# Tool Permission System

## Scope and provenance

This document describes the tool-permission behavior visible in the recovered
`@anthropic-ai/claude-code` 2.1.88 workspace. The repository is reconstructed
from a released package and source maps, so names and structure here describe
the recovered artifact rather than authoritative upstream source code.

The permission system answers one question for each tool invocation:

> May this tool run with this input, and if so, which final input should it use?

The design is layered. Static rules, tool-specific checks, permission modes,
hooks, automated classifiers, local or remote users, and cancellation can all
participate. Earlier safety layers constrain what later convenience layers may
approve.

## Decision vocabulary

A final permission decision has one of three behaviors:

- `allow`: execute the tool, normally with an `updatedInput` carried by the
  decision.
- `deny`: do not execute the tool; report the decision's message as an error.
- `ask`: approval is unresolved or the user rejected an interactive request;
  do not execute the tool unless a later permission mechanism converts the
  request to `allow`.

Tool-level permission checks can additionally return `passthrough`. It means
that the tool has no affirmative opinion. Before leaving the core rule
pipeline, `passthrough` is normalized to `ask`, making uncertainty
conservative by default.

A decision can include supporting data:

- `updatedInput`: the input that later stages and ultimately the tool should
  use.
- `decisionReason`: structured provenance such as a settings rule, mode,
  safety check, classifier, or hook.
- `suggestions`: permission updates that a dialog or hook may accept.
- `message`: the explanation used for a denial or permission request.
- `contentBlocks`: supplementary rejection feedback such as images.

## Permission rules

A permission rule has three independent dimensions:

| Dimension | Examples |
| --- | --- |
| Behavior | `allow`, `ask`, `deny` |
| Source | policy, user, project, local, CLI, session |
| Match shape | whole tool or tool input content |

A whole-tool rule has a tool name and no rule content:

```text
Bash
```

It applies to every invocation of that tool and is matched by the generic
permission pipeline.

A content-specific rule contains a tool-defined matcher:

```text
Bash(npm publish:*)
WebFetch(example.com)
```

The generic layer stores and selects these rules, but the tool interprets the
matcher. Bash understands commands and prefixes, WebFetch understands hosts,
and filesystem tools understand paths. This division avoids embedding every
tool's input semantics in the generic permission engine.

The word "global" describes a rule's source or availability, not its match
shape. A matcher-bearing rule in user settings is both global in scope and
content-specific in matching.

## End-to-end execution order

`checkPermissionsAndCallTool()` coordinates the principal path:

```text
model requests a tool
        |
        v
validate input schema and values
        |
        v
run PreToolUse hooks
        |
        v
resolve core permissions and permission mode
        |
        v
if approval is unresolved, run PermissionRequest mechanisms
        |
        v
allow -----------------------------> call the tool
deny or unresolved ask ------------> return an error tool_result
        |
        v
run the applicable post-tool hooks
```

Input is validated before hooks run. A valid parsed input becomes
`processedInput`. PreToolUse hooks can replace it. Permission decisions can
replace it again. The resolved input is carried forward so an approval applies
to the same input that executes.

## PreToolUse hooks

`PreToolUse` is the early, general interception event. It runs after input
validation and before the ordinary permission pipeline. A matching hook can:

- add messages or context;
- modify tool input;
- return `allow`, `ask`, or `deny`;
- prevent continuation or stop processing.

Its permission result is interpreted by `resolveHookPermissionDecision()`.

### PreToolUse deny

A hook denial immediately becomes the permission decision. The normal
interactive permission flow is not used to overturn it.

### PreToolUse ask

A hook ask forces `canUseTool()` to begin with that ask decision instead of
recomputing an initial decision through `hasPermissionsToUseTool()`. The ask
message, reason, suggestions, and updated input are therefore preserved.

The request can subsequently be answered by a PermissionRequest hook, an
automated mechanism, or a user interface.

### PreToolUse allow

A hook allow can bypass an ordinary confirmation prompt, but it is not an
unconditional override. The implementation still respects configured deny and
ask rules.

For a tool that requires user interaction, allow alone is insufficient. The
normal `canUseTool()` path is retained unless the hook also supplies
`updatedInput`. The presence of `updatedInput` is treated as a protocol signal
that the hook or its wrapper already mediated the interaction. This is a trust
boundary: the flag checks for the presence of updated input, not proof that a
human actually supplied it.

The context flag `requireCanUseTool` is stronger still. When set, it forces the
full `canUseTool()` path even if a PreToolUse hook returned allow and satisfied
an interactive input requirement.

## Core rule pipeline

`hasPermissionsToUseToolInner()` applies the following precedence:

| Priority | Condition | Outcome |
| ---: | --- | --- |
| 1 | Request already aborted | Throw an abort error |
| 2 | Whole-tool deny rule | Deny |
| 3 | Whole-tool ask rule | Ask |
| 4 | Tool-specific check denies | Deny |
| 5 | Protected tool-specific ask | Ask |
| 6 | Bypass mode applies | Allow |
| 7 | Whole-tool allow rule | Allow |
| 8 | Tool returns allow or ask | Preserve the result |
| 9 | Tool passes through or its check fails | Ask |

The tool-specific check parses the input with the tool schema and calls
`tool.checkPermissions()`. It is responsible for matching content-specific
rules and enforcing input-aware safety policy.

Three types of tool-specific ask are protected from bypass mode:

- an ask from a tool whose operation requires user interaction;
- an ask caused by an explicit content-specific ask rule;
- an ask caused by a safety check.

This ordering creates intentional asymmetry. Broad allow mechanisms run only
after explicit denies and protected asks. A whole-tool allow rule therefore
cannot erase a more specific tool denial or safety requirement.

There is a Bash sandbox exception to the early whole-tool ask behavior. When
sandboxing and sandbox auto-allow are enabled and the command will actually be
sandboxed, evaluation continues into Bash's command-specific checks rather
than returning the whole-tool ask immediately.

## Permission modes and outer transformations

`hasPermissionsToUseTool()` wraps the inner rule pipeline and transforms
remaining ask decisions according to session mode.

### Normal interactive modes

An unresolved ask remains available to the interactive permission machinery.

### `bypassPermissions`

Bypass mode allows a request only after it has survived whole-tool denial,
tool-specific denial, explicit protected asks, and safety checks. It bypasses
ordinary prompting rather than all policy.

Plan mode can inherit bypass behavior when bypass permission was available at
the time plan mode began.

### `dontAsk`

The outer function converts every remaining ask to deny. This transformation
occurs after the inner function returns so an early return cannot accidentally
leave an interactive prompt in a no-prompt mode.

### `auto`

Auto mode attempts to resolve asks without a user dialog. Its major paths are:

- preserve non-classifier-approvable safety asks for explicit approval;
- preserve tools requiring genuine user interaction;
- allow actions that would be allowed under `acceptEdits`, with exclusions for
  tools whose full behavior must reach the classifier;
- allow tools on a safe-tool allowlist;
- otherwise ask an action classifier.

A classifier can allow or deny. Classifier failures may fail closed or fall
back to ordinary handling depending on the relevant feature policy. Repeated
classifier denials are tracked; reaching configured limits can return to a
manual prompt in an interactive session or abort a headless session.

### Contexts without permission prompts

When `shouldAvoidPermissionPrompts` is set, PermissionRequest hooks receive an
opportunity to decide. If none does, the request is denied. This prevents a
background or headless agent from hanging on a dialog that no user can see.

## PermissionRequest hooks

`PermissionRequest` is a distinct hook event. It occurs later than
`PreToolUse`, after policy has concluded that approval is still required.

Its input includes the event name, tool name, tool input, current permission
mode, and permission suggestions. Its decision is either:

```ts
{
  behavior: 'allow'
  updatedInput?: Record<string, unknown>
  updatedPermissions?: PermissionUpdate[]
}
```

or:

```ts
{
  behavior: 'deny'
  message?: string
  interrupt?: boolean
}
```

No returned decision means that the hook declines to resolve the request.

An allow decision selects input in this order:

```text
PermissionRequest updatedInput
    ?? current permission result updatedInput
    ?? original input
```

Any permission updates are persisted and applied to in-memory state. The final
decision is marked with a hook decision reason and execution may proceed.

A deny decision stops the invocation and preserves the hook's message. With
`interrupt: true`, it also aborts the broader operation through the shared
abort controller.

In a headless session this hook can replace an unavailable human authority. In
an interactive session it can race the visible dialog and resolve policy
programmatically without delaying the UI.

## Interactive permission dialog

`handleInteractivePermission()` converts an unresolved ask into a queued
`ToolUseConfirm` object. The object contains tool data and callbacks rather
than JSX. React state stores a queue of these objects, and the REPL renders the
first entry with a tool-specific permission component.

```text
unresolved ask
    |
    v
append ToolUseConfirm to queue
    |
    v
REPL renders queue[0]
    |
    v
tool-specific dialog invokes callback
    |
    v
remove queue head and resolve canUseTool promise
```

Different tools can render specialized dialogs. Bash can propose command
prefix rules, file-edit tools can show diffs, and unknown tools use a fallback
dialog.

### Accept once

The component calls `onAllow(updatedInput, [], feedback)`. The handler logs the
user approval, records whether the user modified the input when the tool can
compare inputs, and resolves with `allow`.

### Accept and save a rule

The component supplies one or more `PermissionUpdate` objects to `onAllow`.
They are persisted when their destination supports persistence and are also
applied to the active in-memory permission context. The current request is
allowed and later matching requests can be allowed automatically.

### Reject

The component calls `onReject()`, optionally with feedback or content blocks.
The current tool is not called. The resulting unapproved decision carries a
message suitable for returning as an error tool result. Depending on context
and feedback, rejection can also abort the current request.

### Abort

An interrupt invokes `onAbort()`. It cancels outstanding remote requests,
logs cancellation, aborts the shared controller, and resolves the pending
permission operation so it cannot remain hung.

## Multiple decision sources and race safety

An interactive request can have several simultaneous responders:

- the local terminal dialog;
- a PermissionRequest hook;
- an automated Bash classifier;
- a remote bridge UI;
- a configured messaging channel;
- a permission recheck after configuration changes;
- cancellation.

`createResolveOnce()` supplies `claim()`, `isResolved()`, and `resolve()`.
Every asynchronous responder calls `claim()` before awaiting additional work.
Only the first claimant succeeds, and only one final decision is delivered to
the outer promise. Losing responders remove or ignore stale work where
possible.

User interaction with a displayed dialog is tracked separately from a final
decision. After a short grace period, typing or navigating marks the dialog as
actively used and prevents a background classifier from unexpectedly
auto-approving it. Interaction does not itself allow or deny the tool.

## Final handling in tool execution

After permission resolves, `checkPermissionsAndCallTool()` replaces
`processedInput` with the resolved input and records decision telemetry.

If a PermissionRequest hook made the final non-ask decision, the function adds
a `hook_permission_decision` attachment so the source is visible in the
conversation.

For any decision other than allow, it:

- ends the tool timing spans as rejected;
- creates an error `tool_result` from the decision message;
- includes supported rejection content blocks;
- returns without calling the tool.

For allow, it proceeds to tool execution with the approved input. Post-tool
success or failure hooks then observe the outcome.

## Security and usability principles

The recovered implementation implies the following design principles:

1. **Uncertainty asks rather than allows.** A tool with no affirmative result
   falls through to approval.
2. **Specific restrictions dominate broad convenience.** Deny rules,
   input-aware denials, explicit asks, and safety checks precede bypass and
   broad allow rules.
3. **Hooks have separate phases.** PreToolUse controls early interception;
   PermissionRequest answers a permission request that policy has already
   identified.
4. **Allow is tied to input.** Hooks, dialogs, and classifiers carry the input
   they approved toward execution.
5. **Headless operation fails closed.** Programmatic hooks may approve, but an
   unavailable prompt does not silently become permission.
6. **Interactive automation is race-safe.** Local, remote, hook, classifier,
   and cancellation paths compete through a single-winner guard.
7. **Persistent approval is explicit.** Allowing one call and installing an
   allow rule are separate user or hook actions.

## Key recovered implementation files

- `restored-src/src/services/tools/toolExecution.ts`: end-to-end validation,
  hook ordering, permission invocation, and final execution or rejection.
- `restored-src/src/services/tools/toolHooks.ts`: PreToolUse result resolution.
- `restored-src/src/utils/permissions/permissions.ts`: rule precedence and
  permission-mode transformations.
- `restored-src/src/hooks/useCanUseTool.tsx`: conversion of policy decisions
  into immediate results, automated handling, or interactive handling.
- `restored-src/src/hooks/toolPermission/PermissionContext.ts`: shared
  decision builders, hook processing, persistence, and queue operations.
- `restored-src/src/hooks/toolPermission/handlers/interactiveHandler.ts`:
  dialog queue callbacks and competing responders.
- `restored-src/src/components/permissions/PermissionRequest.tsx`: selection
  and rendering of tool-specific dialogs.
- `restored-src/src/utils/hooks.ts`: hook execution and PermissionRequest input
  construction.
