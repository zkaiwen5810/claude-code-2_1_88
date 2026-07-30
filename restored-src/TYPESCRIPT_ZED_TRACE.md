# TypeScript And Zed Fixes

This file is the beginner-friendly trace for the TypeScript and Zed fixes in
`restored-src`.

## Big Overview

This repository is not a normal TypeScript project checked out from its original source control. It is a recovered source tree for `@anthropic-ai/claude-code` version `2.1.88`.

Most files under `restored-src/src/` were recovered from the released JavaScript package and its source map, especially `package/cli.js.map`. That means the tree is useful for reading and research, but it is incomplete.

The main problem was that Zed and TypeScript could not understand some imports. Zed uses the TypeScript language server, so when TypeScript cannot resolve a file or package, Zed shows squiggles such as:

```txt
Cannot find module './some/module.js'
```

The goal was not to rebuild the original source perfectly. The goal was to make the recovered source easier to read in an editor:

- keep real package type information where possible
- add small editor-only declarations for files that are missing
- avoid changing recovered implementation files just to satisfy TypeScript
- avoid broad wildcard shims that would make everything become `any`

## Key TypeScript Ideas

### What Is An Import?

In JavaScript and TypeScript, files use `import` to load code or types from another file or package:

```ts
import { something } from "./someFile.js"
import memoize from "lodash-es/memoize.js"
```

TypeScript checks these imports before running anything. If it cannot find the target, it reports `TS2307`.

### What Is A Declaration File?

A `.d.ts` file describes the shape of code without containing real runtime implementation.

Example:

```ts
export const isEnabled: any
```

This tells TypeScript that `isEnabled` exists. It does not create real JavaScript code.

In this repo, many `.d.ts` files are intentionally editor-only placeholders.

### What Does `any` Mean?

`any` tells TypeScript, "do not check this value strictly."

It is useful for recovered missing code because we often do not know the real type. But using too much `any` makes editor help worse, so the fixes try to use real types for real packages and `any` only for missing or unavailable modules.

## Problem 1: Type-Only Source Files Were Missing

### Concrete Modules

- `restored-src/src/types/message.d.ts`
- `restored-src/src/types/tools.d.ts`
- `restored-src/src/types/utils.d.ts`
- `restored-src/src/types/notebook.d.ts`
- `restored-src/src/types/messageQueueTypes.d.ts`
- `restored-src/src/types/connectorText.d.ts`
- `restored-src/src/types/statusLine.d.ts`
- `restored-src/src/types/fileSuggestion.d.ts`

### Why It Happened

TypeScript types disappear when TypeScript is compiled to JavaScript.

For example, a file may exist in the original source only to define types:

```ts
export type Message = {
  role: "user" | "assistant"
  text: string
}
```

When this is compiled, there may be no JavaScript output because types are only used by the editor/compiler. If recovery is based on JavaScript output and source maps, these type-only files can be missing.

### How It Was Fixed

Editor-only `.d.ts` files were added in the expected locations.

They begin with this warning:

```ts
// Editor-only declaration for a restored module that is absent from
// this source snapshot. This suppresses TypeScript/Zed resolution warnings only;
// it is not a runtime implementation.
```

### Rationale

The recovered implementation files still import these modules. Adding `.d.ts` files lets TypeScript resolve those imports without pretending we recovered the real original source.

### Note About `export type` Versus `export const`

TypeScript has two related but separate worlds:

- type space: names used only for type checking
- value space: names used by JavaScript at runtime

A type-only missing module can be declared with only `export type`:

```ts
export type Message = any
```

That is enough for code like:

```ts
import type { Message } from "../types/message.js"
```

But it is not enough for code that uses an imported name as a runtime value:

```ts
import { isAssistantMode } from "../assistant/index.js"

if (isAssistantMode()) {
  // ...
}
```

That kind of import needs a value declaration:

```ts
export const isAssistantMode: any
```

Some permissive generated stubs include both forms for the same name:

```ts
export const ToolProgressData: any
export type ToolProgressData = any
```

This is deliberate. It lets the same missing name satisfy either a type import or a runtime value import. So the real rule is not "Problem 1 never has `const` and Problem 2 always has `const`." The real rule is: type-only usage needs `export type`; runtime usage needs `export const`.

## Problem 2: Missing Internal Runtime Modules

### Concrete Modules

Examples include:

- `restored-src/src/assistant/index.d.ts`
- `restored-src/src/proactive/index.d.ts`
- `restored-src/src/constants/querySource.d.ts`
- `restored-src/src/services/compact/snipCompact.d.ts`
- `restored-src/src/services/compact/snipProjection.d.ts`
- `restored-src/src/services/contextCollapse/index.d.ts`
- `restored-src/src/services/contextCollapse/operations.d.ts`
- `restored-src/src/services/oauth/types.d.ts`
- `restored-src/src/services/lsp/types.d.ts`
- `restored-src/src/tools/TungstenTool/TungstenTool.d.ts`
- `restored-src/src/tools/WorkflowTool/WorkflowTool.d.ts`
- `restored-src/src/tasks/LocalWorkflowTask/LocalWorkflowTask.d.ts`
- `restored-src/src/tasks/MonitorMcpTask/MonitorMcpTask.d.ts`

### Why It Happened

The source map did not recover every original source module. Some imports still point to files that are absent from `restored-src/src/`.

TypeScript does not care whether the code path will actually run. If a file has:

```ts
const mod = await import("./assistant/index.js")
```

TypeScript still tries to find `./assistant/index.js` or a matching declaration file during editor analysis.

### How It Was Fixed

Targeted `.d.ts` stubs were added at the missing paths. Most generated stubs export:

- a default `any`
- named `any` exports that recovered source files import

Some dynamic imports needed explicit named exports. For example:

- `assistant/index.d.ts` exports `isAssistantMode`, `initializeAssistantTeam`, `markAssistantForced`, and related names.
- `services/compact/snipCompact.d.ts` exports `snipCompactIfNeeded` and `SNIP_NUDGE_TEXT`.
- `services/compact/snipProjection.d.ts` exports `isSnipBoundaryMessage` and `projectSnippedView`.

### Rationale

These stubs are intentionally minimal. They unblock editor resolution without inventing detailed behavior.

The alternative, adding one global wildcard like this:

```ts
declare module "*"
```

would hide too much. It would make many real packages lose useful hover information and become `any`.

## Problem 3: Missing Command Modules

### Concrete Modules

Examples under `restored-src/src/commands/` include:

- `agents-platform/index.d.ts`
- `assistant/index.d.ts`
- `autofix-pr/index.d.ts`
- `backfill-sessions/index.d.ts`
- `bughunter/index.d.ts`
- `env/index.d.ts`
- `force-snip.d.ts`
- `reset-limits/index.d.ts`
- `teleport/index.d.ts`
- `workflows/index.d.ts`

### Why It Happened

Command files are imported by the command registry. Some command implementations were not present in the recovered snapshot.

Even if a command is feature-gated, TypeScript still resolves imports statically. A runtime feature flag such as:

```ts
feature("WORKFLOW_SCRIPTS")
```

does not stop the TypeScript language server from checking the import.

### How It Was Fixed

Declaration-only command stubs were added.

Most command stubs export a default `Command`. `reset-limits/index.d.ts` exports named commands because the recovered source imports named values from that module.

Relative imports inside stubs were adjusted based on directory depth:

- direct command file: `../types/command.js`
- nested command index file: `../../types/command.js`

### Rationale

This keeps the command registry readable in Zed while making it clear that these files are not real command implementations.

## Problem 4: Package Imports Needed Real Type Metadata

### Concrete Modules

Examples:

- `lodash-es/memoize.js`
- `@modelcontextprotocol/sdk/types.js`
- `@modelcontextprotocol/sdk/client/index.js`
- `@modelcontextprotocol/sdk/server/stdio.js`
- `vscode-jsonrpc/node.js`
- `vscode-languageserver-protocol`
- `https-proxy-agent`

### Why It Happened

Packages can publish their type declarations in different internal paths.

For example, source code imports:

```ts
import { SomeType } from "@modelcontextprotocol/sdk/types.js"
```

But the available local declaration file is stored at:

```txt
restored-src/types/npm/@modelcontextprotocol/sdk/dist/esm/types.d.ts
```

TypeScript needed help connecting the public import path to the local declaration path.

### How It Was Fixed

`restored-src/tsconfig.json` was configured with local type metadata:

- `typeRoots` points to `restored-src/types/@types`
- `paths` maps package import paths to local declarations

Important mappings include:

```json
"@modelcontextprotocol/sdk/*": ["types/npm/@modelcontextprotocol/sdk/dist/esm/*"],
"https-proxy-agent": ["types/npm/https-proxy-agent/dist/index.d.ts"],
"vscode-jsonrpc/node.js": ["types/npm/vscode-jsonrpc/lib/node/main.d.ts"],
"vscode-languageserver-protocol": ["types/npm/vscode-languageserver-protocol/lib/node/main.d.ts"]
```

### Rationale

Real package declarations are better than `any` shims. They give Zed better hover text, autocomplete, and error checking.

For example, `lodash-es/memoize.js` can now resolve to useful local type declarations instead of only showing `any`.

## Problem 5: Native Or Private Runtime Packages Were Unavailable

### Concrete Modules

Examples:

- `@ant/claude-for-chrome-mcp`
- `@ant/computer-use-mcp`
- `@ant/computer-use-mcp/types`
- `@ant/computer-use-input`
- `@ant/computer-use-swift`
- `audio-capture-napi`
- `color-diff-napi`
- `image-processor-napi`
- `url-handler-napi`
- `bun:ffi`
- `bidi-js`
- `cacache`

### Why It Happened

Some imports refer to packages that are private, platform-native, build-provided, or not available with useful type metadata in this recovered workspace.

Native packages often expose compiled binary bindings. TypeScript cannot infer those shapes unless a package supplies `.d.ts` files.

Bun modules such as `bun:ffi` are runtime-provided modules, not normal npm package paths.

### How It Was Fixed

Targeted ambient module declarations were added to `restored-src/editor-shims.d.ts`.

Example shape:

```ts
declare module "audio-capture-napi" {
  const defaultExport: any
  export default defaultExport
  export const getPlatform: any
}
```

These declarations are by exact module name, not broad wildcards.

### Rationale

There is no real local type metadata to preserve for these modules. Targeted `any` shims are acceptable here because the alternative is unresolved imports.

The shim is still narrow: it only affects known unavailable modules.

## Problem 6: Markdown Files Were Imported As Modules

### Concrete Modules

Examples under `restored-src/src/skills/bundled/`:

- `claude-api/SKILL.md`
- `claude-api/python/agent-sdk/README.md`
- `claude-api/typescript/claude-api/tool-use.md`
- `verify/SKILL.md`
- `verify/examples/cli.md`

### Why It Happened

JavaScript bundlers can be configured to import text files. TypeScript does not automatically know that a `.md` file should be treated as a string.

So an import like this needs a declaration:

```ts
import content from "./SKILL.md"
```

### How It Was Fixed

`restored-src/editor-shims.d.ts` now includes:

```ts
declare module "*.md" {
  const content: string
  export default content
}
```

### Rationale

This is a common TypeScript pattern for non-code assets. It tells the editor that Markdown imports produce strings.

## Problem 7: Generated Stubs Accidentally Included Invalid Names

### Concrete Modules

Affected files included:

- `restored-src/src/services/compact/snipCompact.d.ts`
- `restored-src/src/services/contextCollapse/index.d.ts`
- `restored-src/src/tools/SendUserFileTool/prompt.d.ts`
- `restored-src/src/utils/postCommitAttribution.d.ts`

### Why It Happened

A helper script inferred export names from import sites. Some import expressions involved destructuring or default values, and the simple parser accidentally collected JavaScript keywords or literals:

- `continue`
- `true`
- `false`
- `null`

These cannot be exported as normal variable names:

```ts
export const null: any // invalid
```

### How It Was Fixed

The invalid generated export lines were removed manually.

### Rationale

The stubs only need to export names that real source files import or access. Keywords and literals are not module exports.

## Problem 8: Existing Modules Were Missing Expected Named Exports

### Concrete Modules

The main existing modules involved were:

- `restored-src/src/entrypoints/agentSdkTypes.ts`
- `restored-src/src/entrypoints/sdk/coreTypes.ts`
- `restored-src/src/entrypoints/sdk/coreTypes.generated.d.ts`
- `restored-src/src/entrypoints/sdk/runtimeTypes.d.ts`
- `restored-src/src/entrypoints/sdk/toolTypes.d.ts`

Concrete import sites that exposed the problem included:

- `restored-src/src/QueryEngine.ts`
- `restored-src/src/Tool.ts`
- `restored-src/src/bootstrap/state.ts`
- `restored-src/src/bridge/bridgeMessaging.ts`
- `restored-src/src/cli/print.ts`
- `restored-src/src/cli/structuredIO.ts`
- `restored-src/src/utils/hooks.ts`
- `restored-src/src/utils/messages/mappers.ts`
- `restored-src/src/utils/messages/systemInit.ts`

Examples of missing names:

- `PermissionMode`
- `SDKMessage`
- `SDKStatus`
- `SDKUserMessageReplay`
- `HookEvent`
- `ModelUsage`
- `SDKResultSuccess`

### Why It Happened

This was not a missing-file problem.

TypeScript could find modules such as:

```ts
src/entrypoints/agentSdkTypes.js
./sdk/coreTypes.js
```

The problem was that those modules did not appear to export the names that other files expected.

For a beginner: this is the difference between two TypeScript errors:

```txt
TS2307: Cannot find module './some-file.js'
```

means TypeScript cannot find the module at all.

```txt
TS2305: Module has no exported member 'SomeName'
```

means TypeScript found the module, but the module's known exports do not include `SomeName`.

This repo has a re-export chain:

```ts
agentSdkTypes.ts -> sdk/coreTypes.ts -> sdk/coreTypes.generated.d.ts
```

`agentSdkTypes.ts` uses `export * from './sdk/coreTypes.js'`, so names from `coreTypes.ts` are supposed to become public SDK names. But `coreTypes.ts` itself re-exports from `coreTypes.generated.d.ts`, and that generated declaration stub was incomplete.

There was also one ambiguity problem:

```txt
TS2308: Module has already exported a member named 'SDKMessage'
```

That happened because two declaration-only stubs exported the same SDK message names through `export *` chains. TypeScript did not know which star export should win.

### How It Was Fixed

No recovered implementation files should be edited for this category.

The fix was kept in declaration-only files:

- Added permissive SDK type aliases in `restored-src/src/entrypoints/sdk/coreTypes.generated.d.ts`.
- Added missing aliases such as `HookEvent` and `ExitReason` in the same declaration stub.
- Made `InferShape` and `SdkMcpToolDefinition` generic in `restored-src/src/entrypoints/sdk/runtimeTypes.d.ts`, because `agentSdkTypes.ts` uses them like `InferShape<Schema>` and `SdkMcpToolDefinition<Schema>`.
- Removed duplicate SDK message placeholder exports from `restored-src/src/entrypoints/sdk/toolTypes.d.ts`, so `export *` no longer produced ambiguous exports.

Example declaration-only shape:

```ts
export type PermissionMode = any
export type SDKMessage = any
export type SDKStatus = any
export type HookEvent = any
```

Example generic placeholder:

```ts
export type InferShape<_Schema = any> = any
export type SdkMcpToolDefinition<_Schema = any> = any
```

### Rationale

The files `agentSdkTypes.ts` and `coreTypes.ts` are recovered implementation/source files. Editing them would mix editor-repair work with recovered source content.

Because the missing names are type-level declarations for editor analysis, the safer fix is to repair the editor-only `.d.ts` stubs that feed the re-export chain.

This keeps a clear boundary:

- recovered `.ts` files remain as recovered source
- editor-only `.d.ts` files describe missing or incomplete type information
- TypeScript/Zed can resolve the expected names without pretending the recovered implementation was changed upstream

## Problem 9: Build-Time Globals Were Unknown

### Concrete Modules

Examples that referenced build-time or unrecovered globals:

- `restored-src/src/cli/update.ts`
- `restored-src/src/components/AutoUpdater.tsx`
- `restored-src/src/components/LogoV2/LogoV2.tsx`
- `restored-src/src/constants/system.ts`
- `restored-src/src/entrypoints/cli.tsx`
- `restored-src/src/main.tsx`
- `restored-src/src/services/analytics/metadata.ts`
- `restored-src/src/utils/model/model.ts`

Examples of unknown names:

- `MACRO`
- `resolveAntModel`
- `getAntModelOverrideConfig`
- `getAntModels`
- `GateOverridesWarning`
- `ExperimentEnrollmentNotice`
- `TungstenPill`
- `UltraplanChoiceDialog`
- `UltraplanLaunchDialog`
- `launchUltraplan`

### Why It Happened

Some names are probably injected by the original build system, stripped by feature gates, or lost during source recovery.

For a beginner: JavaScript normally needs every variable to be declared somewhere. TypeScript checks that too. If code uses:

```ts
MACRO.VERSION
```

but TypeScript cannot find a declaration for `MACRO`, it reports:

```txt
TS2304: Cannot find name 'MACRO'
```

### How It Was Fixed

The known global `MACRO` was added to `restored-src/editor-shims.d.ts`:

```ts
declare const MACRO: {
  VERSION: string
  CHANNEL: string
  COMMITHASH: string
  DATE: string
  BUILD_TIMESTAMP: string
  [key: string]: any
}
```

The remaining unknown names are recovered-source semantic artifacts. They are left for semantic type checking to report as hints, not fixed by editing implementation files.

### Rationale

`MACRO` is clearly a build-time global used across many files, so an editor shim is appropriate.

The other unknown names look like missing imports, feature-gated fragments, or partially recovered code. Editing recovered `.ts`/`.tsx` files to add imports would change recovered source, so that was avoided.

## Problem 10: React Compiler Runtime Export Was Missing

### Concrete Modules

Many `.tsx` files import the React compiler helper:

- `restored-src/src/components/App.tsx`
- `restored-src/src/components/PromptInput/PromptInput.tsx`
- `restored-src/src/commands/model/model.tsx`
- `restored-src/src/screens/REPL.tsx`

The repeated error looked like:

```txt
Module '"react/compiler-runtime"' has no exported member 'c'
```

### Why It Happened

The recovered code appears to have been compiled or transformed by the React compiler. That transform inserts imports from:

```ts
react/compiler-runtime
```

The local React type declarations did not expose the helper named `c`, so TypeScript reported a missing export.

### How It Is Handled

`restored-src/editor-shims.d.ts` now declares the missing helper:

```ts
declare module "react/compiler-runtime" {
  export function c(size: number): any[]
}
```

### Rationale

This is a targeted module declaration for a compiler helper. It avoids touching hundreds of recovered `.tsx` files.

## Problem 11: Bun Runtime Globals Were Missing

### Concrete Modules

Examples:

- `restored-src/src/buddy/companion.ts`
- `restored-src/src/cli/print.ts`
- `restored-src/src/services/mcp/client.ts`
- `restored-src/src/upstreamproxy/relay.ts`
- `restored-src/src/utils/hash.ts`
- `restored-src/src/utils/semver.ts`
- `restored-src/src/utils/yaml.ts`

### Why It Happened

Some recovered source uses Bun globals:

```ts
Bun.file(...)
Bun.write(...)
Bun.spawn(...)
```

Node type declarations do not include Bun. Without Bun type declarations, TypeScript reports:

```txt
TS2868: Cannot find name 'Bun'
```

### How It Was Fixed

A small permissive `Bun` global was added to `restored-src/editor-shims.d.ts`:

```ts
declare const Bun: {
  env: Record<string, string | undefined>
  file: (...args: any[]) => any
  write: (...args: any[]) => any
  [key: string]: any
}
```

### Rationale

This repo is not trying to install or model the full Bun runtime. The declaration only tells TypeScript that the known global exists for editor analysis.

## Problem 12: JavaScript Library Target Was Too Old

### Concrete Modules

Examples:

- `restored-src/src/QueryEngine.ts`
- `restored-src/src/cli/print.ts`
- `restored-src/src/services/compact/microCompact.ts`
- `restored-src/src/utils/sessionStorage.ts`
- `restored-src/src/utils/telemetry/sessionTracing.ts`

### Why It Happened

The recovered source uses newer array methods such as:

```ts
items.findLast(...)
items.findLastIndex(...)
```

Those methods are part of newer JavaScript library definitions. The old `tsconfig` used:

```json
"target": "ES2022",
"lib": ["ES2022"]
```

TypeScript therefore did not know those methods existed and reported `TS2550`.

### How It Was Fixed

`restored-src/tsconfig.json` now uses:

```json
"target": "ES2023",
"lib": ["ES2023"]
```

### Rationale

This is a TypeScript library-definition issue, not a source recovery issue. Raising the editor target lets TypeScript recognize JavaScript APIs used by the recovered code.

## Problem 13: Remaining Semantic Type Errors From Recovered Source

### Concrete Modules

After the targeted fixes above, the remaining errors were broad semantic type-checking artifacts across many files, for example:

- `restored-src/src/QueryEngine.ts`
- `restored-src/src/Tool.ts`
- `restored-src/src/cli/handlers/mcp.tsx`
- `restored-src/src/components/PromptInput/PromptInput.tsx`
- `restored-src/src/components/MessageSelector.tsx`
- `restored-src/src/screens/REPL.tsx`
- `restored-src/src/tools/AgentTool/UI.tsx`
- `restored-src/src/utils/messages.ts`

Representative remaining diagnostic categories:

- `TS2339`: property does not exist on `unknown`, `{}`, or an incomplete union
- `TS2322`: `unknown` is not assignable to a narrower type
- `TS2345`: argument type is too broad or too narrow
- `TS2315`: a placeholder type was used as generic but was not declared generic
- `TS2367`: TypeScript thinks two literal values can never overlap
- `TS2578`: an `@ts-expect-error` comment no longer matches an error

### Why It Happened

These are not import-resolution errors. They come from incomplete recovery and permissive editor stubs.

For example, if an editor stub says a function returns `unknown`, then later code like this fails:

```ts
result.status
```

because TypeScript does not allow property access on `unknown`.

If a stub says a component accepts only `object`, then JSX props can fail. If a recovered union is incomplete, TypeScript may think a branch is impossible. If a type alias is only `any` instead of generic, code like `DeepImmutable<T>` can fail.

### How It Was Fixed

No recovered implementation files were edited.

Some high-value declaration-only repairs were kept, such as making these placeholders generic:

```ts
export type InferShape<_Schema = any> = any
export type SdkMcpToolDefinition<_Schema = any> = any
```

For the remaining broad semantic categories, semantic type checking is enabled. The errors are accepted as useful hints about the recovered tree.

For a beginner: this means TypeScript is allowed to report problems such as "property does not exist" or "unknown is not assignable." In this repository those messages often point to incomplete recovery or permissive stubs, not necessarily real bugs in the released program.

### Rationale

The remaining errors are not reliable evidence of real bugs. Many are side effects of:

- missing original generated types
- feature-gated source fragments
- absent private/internal packages
- permissive placeholder declarations
- source-map recovery gaps

Fixing all of those by editing `.ts` and `.tsx` files would alter recovered source. The project rule is: do not touch implementation files just to satisfy these diagnostics. Keeping semantic checking enabled makes the diagnostics visible for readers who want the hints.

## Problem 14: Editor Stubs Were Missing Observed Value Exports

### Why It Happened

Many absent, feature-gated internal modules already had targeted editor-only
`.d.ts` files, but those declarations did not expose every member accessed
through a `typeof import(...)` namespace. TypeScript therefore resolved the
module and still reported `TS2339` at the recovered call site.

Returning `false` from the `bun:bundle` `feature()` shim does not solve this.
TypeScript checks both conditional branches and resolves type queries even
when a bundler would eliminate one branch.

### How It Was Fixed

`scripts/audit-editor-stub-exports.js` runs the pinned TypeScript check,
extracts only this diagnostic shape, and classifies the referenced module.
With `--fix`, it appends declarations of this form:

```ts
export const observedMember: any
```

The fixer only touches `.d.ts` files whose header explicitly identifies them
as editor-only declarations. It does not modify recovered implementations,
external package declarations, wildcard modules, or the released package.
Only value exports observed at real call sites are added.

The before and after records are:

- `docs/EDITOR_STUB_EXPORT_AUDIT_BEFORE.json`
- `docs/EDITOR_STUB_EXPORT_AUDIT_AFTER.json`

The measured change was:

| Measure | Before | After |
| --- | ---: | ---: |
| Total TypeScript diagnostics | 629 | 493 |
| Module-namespace member diagnostics | 154 | 20 |
| Modules in that diagnostic category | 70 | 6 |
| Eligible editor declaration modules | 64 | 0 |
| Eligible missing exports | 111 | 0 |

The 20 remaining diagnostics are deliberately outside this mechanical fix:
five external or unresolved packages and the recovered implementation
`src/constants/betas.ts`. Those require real package metadata, an exact native
module shim, or separate source evidence rather than expanding an absent-module
stub.

## What Is Fixed Now

Import/module resolution is fixed, and semantic checking is enabled.

Run the full check with:

```sh
npx --yes -p typescript@5.9.3 tsc --noEmit --project restored-src/tsconfig.json --pretty false
```

This command is expected to report semantic recovered-source diagnostics. That is accepted.

To specifically verify import resolution, this command should still produce no output:

```sh
npx --yes -p typescript@5.9.3 tsc --noEmit --project restored-src/tsconfig.json --pretty false 2>&1 \
  | rg "TS2307: Cannot find module"
```

No output from that filtered command means TypeScript is no longer reporting unresolved imports.

## Mental Model

Think of the fixes in three layers:

1. Real package types when available:
   Use `restored-src/types/` and `tsconfig.json` mappings so editor information stays useful.

2. Editor-only stubs for missing recovered source:
   Add `.d.ts` files where the recovered tree is incomplete.

3. Targeted shims for unavailable runtime modules:
   Use `editor-shims.d.ts` for private/native/Bun modules and Markdown imports.

The important rule is: do not confuse editor declarations with real source code. They help TypeScript and Zed understand the recovered tree, but they are not runtime implementations.
