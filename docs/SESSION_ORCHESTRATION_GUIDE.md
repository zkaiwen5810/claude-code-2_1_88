# Session Orchestration Guide

This guide explains the main session orchestration design of the recovered Claude Code app. It focuses on the interactive REPL path: how user input becomes a model turn, how streamed results update the terminal UI, and how follow-up input is handled while a turn is already running.

The repository is recovered from a released package, so names and paths should be read as recovered implementation clues, not official upstream architecture.

## Overview

The app is best understood as one local terminal process with several layers, not as a traditional web frontend calling a separate backend.

```text
Terminal UI layer
  React + Ink components render prompt input, transcript, dialogs, spinners.

Session orchestration layer
  REPL state, submit handling, queueing, guards, context assembly, turn lifecycle.

Query engine layer
  query() streams model/tool events, runs tools, handles API calls, hooks, MCP.
```

The important mental model is that `REPL.tsx` is not only presentation code. It is the interactive session controller. It owns user-visible state and coordinates the local query engine.

The core path for a normal interactive prompt is:

```text
main.tsx
  -> launchRepl(...)
  -> <App><REPL /></App>
  -> <PromptInput onSubmit={onSubmit} />
  -> REPL.onSubmit(...)
  -> handlePromptSubmit(...)
  -> processUserInput(...)
  -> REPL.onQuery(...)
  -> query(...)
  -> REPL handles streamed query events
```

In this design, `onQuery` is the adapter between UI/session state and the backend-like query engine. It is defined in the REPL layer because it needs direct access to REPL state: messages, abort controllers, tools, model selection, notifications, permissions, and app state.

## Key Files

`restored-src/src/main.tsx`

Creates the CLI command tree, parses flags, loads settings, builds initial session state, then starts either headless mode or the interactive REPL.

`restored-src/src/replLauncher.tsx`

Small lazy-loading bridge that renders:

```tsx
<App {...appProps}>
  <REPL {...replProps} />
</App>
```

`restored-src/src/screens/REPL.tsx`

The main session controller for interactive mode. It renders the transcript and prompt, owns session state, defines `onSubmit`, defines `onQuery`, starts turns, consumes streamed query events, and launches resume/direct/remote variants.

`restored-src/src/components/PromptInput/PromptInput.tsx`

Terminal input component. It handles editing behavior, keybindings, history, paste state, mode switching, and calls `onSubmit(input)` when the user submits.

`restored-src/src/utils/handlePromptSubmit.ts`

Converts submitted input into executable session work. It validates input, expands pasted text references, queues follow-ups when a turn is active, reserves the query guard, calls `processUserInput`, and finally invokes `onQuery`.

`restored-src/src/utils/processUserInput/processUserInput.ts`

Classifies and normalizes input. It handles normal prompts, slash commands, bash mode, attachments, pasted images, IDE context, and user-prompt hooks. It returns new conversation messages plus whether the model should be queried.

`restored-src/src/query.ts`

The query engine. It takes messages and context, calls the model/API, runs tools, handles tool loops, emits streamed events, and returns control to the REPL through the async event stream.

`restored-src/src/utils/messageQueueManager.ts`

Module-level queue for follow-up prompts, slash commands, task notifications, and other queued commands.

`restored-src/src/hooks/useQueueProcessor.ts`

React hook that watches the queue and query guard. When the current turn is idle, it drains queued work back through the normal submit pipeline.

## Startup Into REPL

`main.tsx` is the process entrypoint and CLI dispatcher. For interactive mode, its job is to prepare enough state to render the REPL:

1. Parse CLI arguments and feature-gated flags.
2. Load settings, policies, auth-related state, tools, commands, agents, plugins, and MCP configuration.
3. Build the initial `AppState`.
4. Construct `REPLProps`, including commands, tools, initial messages, permission context, model/thinking settings, and optional remote/direct/SSH config.
5. Call `launchRepl(root, appProps, replProps, renderAndRun)`.

After this point, `main.tsx` is mostly out of the interactive turn loop. The REPL owns the session lifecycle.

## Prompt Input Flow

`PromptInput` is the low-level terminal input surface. It is still UI code: it tracks text editing, cursor position, mode indicators, history, paste placeholders, and keybindings.

When the user submits text, `PromptInput` calls the callback passed by `REPL`:

```text
PromptInput
  -> onSubmit(input)
```

The prompt text itself lives in `REPL` state as `inputValue`. `PromptInput` receives:

```text
input={inputValue}
onInputChange={setInputValue}
onSubmit={onSubmit}
```

That means the input component edits the value, but the REPL owns it.

## What `onSubmit` Does

`REPL.onSubmit` is the main entrypoint for interactive user submission. It is intentionally orchestration-heavy.

For a normal prompt, its useful responsibilities are:

1. Keep the transcript pinned to the bottom.
2. Resume paused loop/proactive modes if needed.
3. Handle immediate slash commands that can run while another turn is active.
4. Add the submitted text to history.
5. Clear the visible prompt input and pasted content state.
6. Handle special modes such as speculation acceptance or remote sessions.
7. Wait for pending startup/session hooks before the first local query.
8. Call `handlePromptSubmit(...)`.

The key handoff is:

```text
REPL.onSubmit
  -> handlePromptSubmit({
       input,
       mode,
       messages,
       mainLoopModel,
       onQuery,
       ...
     })
```

`onSubmit` should be read as "accept this user submission into the session", not as "call the model directly."

## Input Processing

`handlePromptSubmit` and `processUserInput` separate raw input from model-ready messages.

`handlePromptSubmit` handles session-level mechanics:

1. Ignore empty input.
2. Expand pasted text references.
3. Detect exit aliases.
4. If a query is already active, enqueue the input and return.
5. Otherwise create a fresh `AbortController`.
6. Reserve the `queryGuard` so another submit cannot start a concurrent turn.
7. Call `processUserInput`.
8. Call `onQuery` with the produced messages.

`processUserInput` handles semantic classification:

```text
normal prompt
  -> create user message

/slash command
  -> execute command or produce command messages

bash mode
  -> process bash command path

attachments/images/IDE selection
  -> add attachment messages or content blocks

UserPromptSubmit hooks
  -> allow, block, or stop continuation
```

The important return shape is conceptually:

```ts
{
  messages: Message[],
  shouldQuery: boolean,
  allowedTools?: string[],
  model?: string,
  effort?: EffortValue
}
```

If `shouldQuery` is false, the REPL updates local state but does not call the model. This happens for local commands, invalid commands, blocking hooks, and other UI-only flows.

## Query Orchestration

`REPL.onQuery` is where a processed user input becomes an actual model turn.

Its main steps are:

1. Start the query guard state machine.
2. Append new user/attachment/system messages to the transcript.
3. Run optional `onBeforeQuery` callbacks.
4. Build `toolUseContext`, which carries tools, MCP clients, permissions, app state accessors, abort signal, and model options.
5. Load context needed for the model:
   - system prompt
   - user context
   - system/project context
   - current tools and MCP clients
6. Build the effective system prompt.
7. Call `query(...)`.
8. Iterate streamed events from `query(...)`.
9. Pass each event to `onQueryEvent`, which updates visible messages, streaming text, tool-use UI, metrics, errors, and final state.
10. End the query guard and run turn-complete cleanup.

The central call is:

```ts
for await (const event of query({
  messages: messagesIncludingNewMessages,
  systemPrompt,
  userContext,
  systemContext,
  canUseTool,
  toolUseContext,
  querySource,
})) {
  onQueryEvent(event)
}
```

This is why `onQuery` lives in `REPL.tsx`: it needs to glue together UI-owned state and engine-owned streaming.

## Query Guard

The app prevents multiple model turns from running concurrently in the same main REPL session.

That role is handled by `queryGuard`.

Conceptually it has states like:

```text
idle
  -> dispatching/reserved
  -> running
  -> idle
```

The guard exists because input processing can include awaits before the actual API call starts. Without an early reservation, two rapid submits could both believe no query is active and start overlapping turns.

The typical sequence is:

```text
handlePromptSubmit
  -> executeUserInput
  -> queryGuard.reserve()
  -> processUserInput(...)
  -> onQuery(...)
  -> queryGuard.tryStart()
  -> query(...)
  -> queryGuard.end()
```

When a submit arrives while the guard is active, it is queued rather than run immediately.

## Follow-Up Input While A Turn Is Running

When the user submits a follow-up prompt during an in-flight response, the app does not normally start a second query.

The flow is:

```text
User submits follow-up
  -> REPL.onSubmit
  -> handlePromptSubmit
  -> queryGuard.isActive === true
  -> enqueue(command)
  -> clear visible input
  -> return
```

The queue is stored outside React state in `messageQueueManager.ts`. React components subscribe to it with `useSyncExternalStore`, which avoids relying on normal prop/state propagation for queue changes.

Queued items have priorities:

```text
now
next
later
```

User prompts default to `next`. Task notifications usually use `later`, so user input is not starved by background work.

When the current turn finishes, `useQueueProcessor` sees:

```text
queryGuard is inactive
queue has items
no blocking local JSX UI
```

It then drains queued work:

```text
useQueueProcessor
  -> processQueueIfReady
  -> executeQueuedInput
  -> handlePromptSubmit({ queuedCommands })
  -> processUserInput
  -> onQuery
```

So queued follow-ups re-enter the exact same processing path as a fresh user submit.

## Mid-Turn Queue Injection

There is one nuance: queued plain prompts can sometimes be surfaced to the current model turn before the turn fully ends.

During the query loop, `query.ts` snapshots eligible queued commands and turns them into attachment messages. This lets the model notice new user input during a tool-use loop.

However, this is deliberately limited:

1. Slash commands are not injected mid-turn. They must go through slash-command processing after the active turn.
2. Bash-mode commands are treated conservatively and processed one at a time.
3. Agent-scoped notifications are only drained by the matching agent loop.
4. Consumed queued prompts are removed from the queue only after they are converted into attachments.

This gives the app a hybrid behavior:

```text
simple in-flight follow-up
  -> usually queued for the next turn

follow-up during tool-loop opportunity
  -> may be attached into the ongoing query context

slash/bash follow-up
  -> waits for normal queue processing
```

## Streaming Results Back To The UI

`query(...)` is an async generator. It yields events/messages as the model streams, tools run, tool results arrive, errors happen, or compaction/retry logic occurs.

The REPL consumes those events with:

```text
for await (...) {
  onQueryEvent(event)
}
```

`onQueryEvent` is the UI/session reducer for query output. It updates:

1. assistant text streaming
2. final assistant messages
3. tool-use progress
4. tool results
5. errors and interruption messages
6. metrics and diagnostics
7. transcript state

This keeps the query engine mostly independent from the Ink UI. The engine yields structured events; the REPL decides how to display and store them.

## Abort And Interrupt

Each turn gets an `AbortController`. The controller is passed through `toolUseContext` into `query(...)` and tool execution.

The user can cancel a running turn. A special case exists when the user submits while an interruptible tool is running:

```text
submit during interruptible tool
  -> abort current turn with reason "interrupt"
  -> enqueue new prompt
```

`query.ts` checks the abort reason. For submit-interrupts, it skips adding a noisy interruption message because the queued follow-up prompt provides the visible context.

## Why This Design Looks Like Frontend And Backend Are Mixed

The code looks mixed because the app is not split across browser/server boundaries. It is a local terminal application where React is used as a terminal rendering framework.

In a web app, a controller might live on a server and the frontend might only render. Here, the "controller" lives beside the UI because both run in the same process.

The practical split is not file type or React/non-React. The practical split is responsibility:

```text
PromptInput
  editing and submit gesture

REPL.onSubmit
  accept user submission into session

handlePromptSubmit/processUserInput
  convert input into session messages or commands

REPL.onQuery
  assemble context and start a turn

query()
  execute model/tool loop and stream events

onQueryEvent
  fold streamed events back into UI/session state
```

That is the session orchestration spine of the app.

