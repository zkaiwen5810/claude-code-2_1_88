# Repository Notes For Agents

## Provenance

- This is an unofficial recovered repository for `@anthropic-ai/claude-code` version `2.1.88`.
- It is not an original upstream source checkout and should not be treated as authoritative internal repository structure.
- The recovery is based on the released package and source map analysis, mainly `package/cli.js.map`.
- The repository is for research and code-reading work. Avoid presenting recovered source, paths, or type stubs as official Anthropic source truth.

## Layout

- `.devcontainer/` contains the local devcontainer setup.
- `claude-code-2.1.88.tgz` is the package archive used for recovery.
- `package/` is the unpacked released npm package. Its executable entry is `package/cli.js`, with source map `package/cli.js.map`; `package/package.json` declares `@anthropic-ai/claude-code` version `2.1.88`.
- `restored-src/` is the reconstructed TypeScript workspace used for reading and editor tooling.
- `restored-src/src/` contains source files recovered primarily from `package/cli.js.map`.
- `restored-src/node_modules/` stores dependency packages bundled with or installed for the recovered artifact workspace.
- `restored-src/types/npm/` contains type declarations extracted from npm packages that ship their own `.d.ts` files.
- `restored-src/types/@types/` contains local DefinitelyTyped packages, including `@types/node`.
- `restored-src/vendor/` and `package/vendor/` contain vendored files from the package/recovery context.

## TypeScript And Editor Setup

- `restored-src/TYPESCRIPT_ZED_TRACE.md` is the beginner-friendly trace for TypeScript/Zed resolution work and the remaining semantic diagnostics.
- Semantic type checking is enabled. Full `tsc --noEmit` is expected to report recovered-source diagnostics, and those diagnostics are acceptable hints.
- `restored-src/editor-shims.d.ts` contains targeted ambient declarations for build/runtime-provided modules, private/native packages that are absent from this recovered workspace, and imported Markdown files.
- Prefer real local package type metadata under `restored-src/types/` over broad ambient `any` declarations.
- The diagnostic categories and rationale are documented in `restored-src/TYPESCRIPT_ZED_TRACE.md`.
- Do not add wildcard declarations such as `declare module "*"`. They erase useful package hover/type information and undo the point of the targeted cleanup.

## Recovered Source Caveats

- Some modules that existed in the original TypeScript project are absent from this recovered snapshot, especially type-only modules erased during compilation.
- Missing internal modules are represented only by targeted declaration stubs when needed for editor resolution.
- Declaration-only stubs under `restored-src/src/**/*.d.ts` are editor-only placeholders. They begin with an "Editor-only declaration..." note and are not runtime implementations.
- TypeScript has separate type and value spaces. Type-only imports need `export type`; runtime imports or dynamic namespace access need `export const`. Some permissive stubs intentionally export both for the same name.
- Many command stubs under `restored-src/src/commands/**` export permissive `Command` declarations. Treat them as resolution aids, not reconstructed behavior.
- `restored-src/src/types/message.d.ts` is intentionally permissive because the real `src/types/message.ts` is absent while many recovered files import message-related types.
- Feature-gated imports still matter to TypeScript and Zed: even code guarded by `feature("...")` is statically resolved by the language server.

## Working Guidelines

- Make source-reading and editor-support changes in `restored-src/` unless the task explicitly targets the released package files.
- Avoid modifying recovered implementation files just to satisfy TypeScript diagnostics. Prefer targeted `.d.ts` stubs for absent recovered modules and keep them clearly marked as editor-only.
- Do not remove or collapse local type metadata in `restored-src/types/`; it exists to preserve useful TypeScript resolution for package imports such as `lodash-es/memoize.js`.
- For package subpath resolution, prefer precise `paths` mappings to existing local declarations in `restored-src/types/npm/` before adding ambient `any` shims.
- Use `restored-src/editor-shims.d.ts` only for exact module names that are build/runtime-provided, private/native, or otherwise unavailable in the recovered workspace.
- If adding new missing-module stubs, use relative imports that match the stub location. For example, command files directly under `src/commands/*.d.ts` import `../types/command.js`, while nested `src/commands/<name>/index.d.ts` files import `../../types/command.js`.
- To run the project check, use `npx --yes -p typescript@5.9.3 tsc --noEmit --project restored-src/tsconfig.json --pretty false`; semantic diagnostics are expected.
- To verify missing-module cleanup specifically, filter that output for `TS2307: Cannot find module`.
