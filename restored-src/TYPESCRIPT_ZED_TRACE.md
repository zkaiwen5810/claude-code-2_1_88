# TypeScript and Zed Resolution Trace

Date: 2026-06-20

This note records the local changes made to help Zed and TypeScript understand the recovered source tree under `restored-src/src`.

## Background

`restored-src` is a recovered TypeScript source tree, not a clean original source checkout. Some files appear to have been reconstructed from emitted JavaScript, bundles, source maps, or partial package artifacts. That matters because TypeScript type-only information is erased when TypeScript is compiled to JavaScript.

For example, a source file like `src/types/message.ts` can be critical during TypeScript development while producing little or no runtime JavaScript. If recovery is based mainly on runtime output, such type-only modules can be missing even though many recovered `.ts` files still import them.

Zed uses the TypeScript language server. It does not execute feature gates such as `feature('WORKFLOW_SCRIPTS')`; it statically resolves both normal imports and type queries like `typeof import('./some/module.js')`. Therefore feature-gated imports can still show `Cannot find module` if the target file is missing from the recovered snapshot.

## Goals

- Make Zed resolve external packages such as `lodash-es/memoize.js` using real type metadata instead of broad `any` shims.
- Reduce reliance on `restored-src/editor-shims.d.ts`.
- Avoid changing recovered source implementation files.
- Add declaration-only stubs only where modules are absent from the recovered snapshot.
- Clearly mark stubs as editor-only so they are not mistaken for runtime implementations.

## Package and Type Metadata

`restored-src/package.json` was expanded to describe the external packages imported by recovered source files. `restored-src/package-lock.json` was generated so dependency versions are explicit.

Type metadata was downloaded and stored locally:

- `restored-src/types/npm/` contains declarations extracted from packages that ship their own `.d.ts` files.
- `restored-src/types/@types/` contains declarations from DefinitelyTyped packages.
- `@types/node` was added so Node/Bun-like imports have Node type coverage where applicable.

The intent is to let TypeScript resolve real package declarations first, instead of hiding package imports behind ambient `declare module "...": any` shims.

## TypeScript Configuration

`restored-src/tsconfig.json` was adjusted so Zed/TypeScript can resolve local recovered paths and local type metadata:

- `baseUrl: "."` lets imports like `src/...` resolve relative to `restored-src`.
- `typeRoots: ["./types/@types"]` points TypeScript at local DefinitelyTyped packages.
- `types: ["node"]` enables Node globals and Node module types.
- `paths` maps local package type metadata and recovered source aliases.
- `exclude: ["node_modules"]` keeps the generated JavaScript package tree from being treated as source.

`ignoreDeprecations` was removed because the Zed TypeScript language server reported it as invalid in this environment.

## Editor Shims

`restored-src/editor-shims.d.ts` was reduced to the remaining virtual build module:

```ts
declare module "bun:bundle" {
  export function feature(name: string): boolean
}
```

This file still exists because `bun:bundle` is not a normal npm package or local file. It is a build/runtime-provided module, so TypeScript needs a small ambient declaration for editor analysis.

The previous broad package shims were removed because they caused weak hover information such as `(alias) const memoize: any`.

## Package Hover Improvement

The original example was:

```ts
import memoize from "lodash-es/memoize.js"
```

That now resolves through real local type metadata, specifically the `lodash-es` type declarations under `restored-src/types/@types/lodash-es/`. This is why Zed can provide a more useful function signature instead of only `any`.

## Missing Internal Module Stubs

Some modules are absent from the recovered source snapshot. For these, declaration-only `.d.ts` files were added. They are intentionally editor-only and include this note:

```ts
// Editor-only declaration for a restored module that is absent from
// this source snapshot. This suppresses TypeScript/Zed resolution warnings only;
// it is not a runtime implementation.
```

Feature-gated stubs use a variant that says `feature-gated restored module`.

### Command Module Stubs

The following missing command modules were stubbed under `restored-src/src/commands`:

- `agents-platform/index.d.ts`
- `ant-trace/index.d.ts`
- `assistant/index.d.ts`
- `autofix-pr/index.d.ts`
- `backfill-sessions/index.d.ts`
- `break-cache/index.d.ts`
- `buddy/index.d.ts`
- `bughunter/index.d.ts`
- `ctx_viz/index.d.ts`
- `debug-tool-call/index.d.ts`
- `env/index.d.ts`
- `force-snip.d.ts`
- `fork/index.d.ts`
- `good-claude/index.d.ts`
- `issue/index.d.ts`
- `mock-limits/index.d.ts`
- `oauth-refresh/index.d.ts`
- `onboarding/index.d.ts`
- `peers/index.d.ts`
- `perf-issue/index.d.ts`
- `proactive.d.ts`
- `remoteControlServer/index.d.ts`
- `reset-limits/index.d.ts`
- `share/index.d.ts`
- `subscribe-pr.d.ts`
- `summary/index.d.ts`
- `teleport/index.d.ts`
- `torch.d.ts`
- `workflows/index.d.ts`

Most of these export a default `Command`. `reset-limits/index.d.ts` exports the named commands used by the recovered source.

Relative imports inside these stubs were corrected:

- Direct files under `src/commands/*.d.ts` import `../types/command.js`.
- Nested files under `src/commands/<name>/index.d.ts` import `../../types/command.js`.

### Non-Command Stubs

These additional missing modules were stubbed because they were directly reported by Zed/TypeScript:

- `restored-src/src/types/message.d.ts`
- `restored-src/src/services/skillSearch/localSearch.d.ts`
- `restored-src/src/tools/WorkflowTool/createWorkflowCommand.d.ts`

`message.d.ts` exists because `src/types/message.ts` is absent from the recovered snapshot, while many files import message-related types. The declarations are permissive placeholders, not reconstructed source truth.

`localSearch.d.ts` and `createWorkflowCommand.d.ts` exist because `commands.ts` contains feature-gated imports that TypeScript still resolves statically.

## Verification Commands

Focused check for the reported import locations:

```sh
npx --yes -p typescript@5.9.3 tsc --noEmit --project restored-src/tsconfig.json --pretty false \
  | rg "restored-src/src/commands.ts.*TS2307|restored-src/src/types/command.ts.*TS2307|restored-src/src/commands/.*\\.d\\.ts.*TS2307"
```

This produced no matching errors after the stub additions.

Check that all declaration stubs under `restored-src/src` have editor-only notes:

```sh
find restored-src/src -name '*.d.ts' -exec sh -c 'for f do if ! sed -n "1,4p" "$f" | rg -q "Editor-only declaration|source snapshot|runtime implementation"; then printf "%s\n" "$f"; fi; done' sh {} +
```

This produced no output after annotation.

## Remaining Caveat

A full project `tsc --noEmit` still reports many unrelated `TS2307` errors for other missing internal recovered modules. Those were not broadly shimmed on purpose.

Broad wildcard declarations such as `declare module "*"` would silence many squiggles, but they would also erase useful type information and push Zed hover behavior back toward `any`. The current approach favors targeted stubs plus real package metadata.

## Zed Usage Notes

Open `/workspaces/claude-code-2_1_88` as the project root. Zed should discover `restored-src/tsconfig.json` for files under `restored-src/src`.

After changes:

- Restart the TypeScript language server in Zed.
- Reopen the affected file if diagnostics appear stale.
- Confirm package hovers, such as `lodash-es/memoize.js`, point at declarations under `restored-src/types`.

If Zed still reports a stale error at a location that `tsc` no longer reports, it is likely language-server cache state rather than a TypeScript configuration issue.
