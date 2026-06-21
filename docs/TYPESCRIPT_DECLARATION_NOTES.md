# TypeScript Declaration And Type Resolution Notes

This note summarizes TypeScript declaration-file and type-resolution concepts that are useful while reading this recovered `claude-code` repository.

The goal is beginner-friendly context for reading files such as `*.d.ts`, `restored-src/types/@types`, `restored-src/types/npm`, and `restored-src/src/entrypoints/sdk/toolTypes.d.ts`.

## 1. What Is A `.d.ts` File?

A `.d.ts` file is a TypeScript declaration file.

It describes the shape of code for TypeScript and editors, but it does not provide runtime JavaScript implementation.

Example:

```ts
export interface BashInput {
  command: string
  timeout?: number
}
```

This tells TypeScript that a `BashInput` object has a required `command` field and an optional `timeout` field.

It does not create an object at runtime.

Declaration files are useful when:

- JavaScript exists but TypeScript needs type information.
- A package ships type metadata.
- A recovered source tree is missing original type-only files.
- Editor tooling needs help resolving imports.

## 2. The `toolTypes.d.ts` Stub

The file `restored-src/src/entrypoints/sdk/toolTypes.d.ts` currently contains only:

```ts
// Editor-only declaration for a restored module that is absent from
// this source snapshot. This suppresses TypeScript/Zed resolution warnings only;
// it is not a runtime implementation.
declare const defaultExport: any
export default defaultExport
```

This is a generic editor-only placeholder.

It exists because recovered source imports or re-exports `./sdk/toolTypes.js`, especially:

```ts
export * from './sdk/toolTypes.js'
```

The original source file was missing from `restored-src/src`, so this stub tells TypeScript: "the module exists, but we do not know its real shape."

## 3. Is `defaultExport` A Special Name?

No. `defaultExport` is just a local variable name.

This:

```ts
declare const defaultExport: any
export default defaultExport
```

means:

- declare a value named `defaultExport`
- export that value as the module's default export

Importers can choose any local name:

```ts
import anything from './toolTypes.js'
```

They do not need to call it `defaultExport`.

## 4. `export` Versus `export default`

Named exports use explicit exported names:

```ts
export type BashInput = {
  command: string
}

export const toolName = 'Bash'
```

Importers must use those names:

```ts
import { BashInput, toolName } from './toolTypes.js'
```

Default exports expose one default value:

```ts
const value = 123
export default value
```

Importers choose their own local name:

```ts
import whatever from './module.js'
```

Important detail:

```ts
export * from './module.js'
```

re-exports named exports only. It does not re-export the default export.

That is why a file containing only `export default defaultExport` is not very useful for a caller that uses `export *`.

## 5. Why `package/sdk-tools.d.ts` Looks Relevant

`package/sdk-tools.d.ts` contains generated declarations for Claude CLI tool input and output schemas.

It exports named types such as:

- `ToolInputSchemas`
- `ToolOutputSchemas`
- `AgentInput`
- `BashInput`
- `FileReadInput`
- `GrepInput`
- `AskUserQuestionInput`
- `AgentOutput`
- `BashOutput`
- `FileReadOutput`
- `WebSearchOutput`

This is much more informative than the current `toolTypes.d.ts` default-only stub.

For this recovered package, `package/sdk-tools.d.ts` is likely a good provenance match for the missing SDK tool type surface.

Replacing the generic stub with those declarations would improve editor hover/completion for SDK tool types. It probably would not reduce missing-module diagnostics, because the module already resolves.

## 6. `types/@types` Versus `types/npm`

This repo has two local type areas:

```txt
restored-src/types/@types
restored-src/types/npm
```

They serve different roles.

### `types/@types`

This is like a local replacement for:

```txt
node_modules/@types/*
```

It contains npm `@types` packages.

Many come from DefinitelyTyped. Example packages often have metadata pointing to:

```txt
https://github.com/DefinitelyTyped/DefinitelyTyped
```

Some are only deprecated stub packages. For example, `@types/chalk` says that `chalk` provides its own types.

### `types/npm`

This is like a local replacement for:

```txt
node_modules/*
```

It contains declarations shipped by real packages themselves.

For example, `restored-src/types/npm/chalk/package.json` says:

```json
"types": "./source/index.d.ts"
```

So the useful `chalk` declaration is under `types/npm/chalk`, not `types/@types/chalk`.

## 7. Is `types/npm` A TypeScript Convention?

No. `types/npm` is not a TypeScript convention by itself.

It works in this repo because `restored-src/tsconfig.json` has path mappings:

```json
"baseUrl": ".",
"paths": {
  "*": ["types/npm/*", "types/@types/*", "*"]
}
```

That tells TypeScript to try `types/npm` while resolving package imports.

By contrast, `typeRoots` is configured as:

```json
"typeRoots": ["./types/@types"],
"types": ["node"]
```

That controls automatic loading of selected `@types` global packages. In this repo, only `node` is explicitly loaded that way.

## 8. Module Types Versus Global Types

Module types and global types are different.

### Module Types

Module types are available only after import.

Example:

```ts
import chalk from 'chalk'

chalk.green('ok')
```

The `chalk` types describe what the imported module exports.

### Global Types

Global types are available without importing.

Example from Node:

```ts
const env: NodeJS.ProcessEnv = process.env
const buffer = Buffer.from('hello')
```

Here, `NodeJS`, `process`, and `Buffer` are known globally because Node types are included.

## 9. Other Examples Of Global Types

Common global type sources include:

- JavaScript built-ins from TypeScript libs:
  - `Promise`
  - `Map`
  - `Date`
  - `RegExp`
- DOM/browser globals if the `DOM` lib is enabled:
  - `window`
  - `document`
  - `HTMLElement`
  - `MouseEvent`
- Web worker globals if worker libs are enabled:
  - `self`
  - `DedicatedWorkerGlobalScope`
- Test framework globals:
  - `describe`
  - `it`
  - `expect`
- JSX globals:
  - `JSX.Element`
- Custom project globals declared in `.d.ts` files:

```ts
declare global {
  var __DEV__: boolean

  namespace App {
    type UserId = string
  }
}

export {}
```

Then code can use:

```ts
if (__DEV__) {}

const id: App.UserId = 'user_123'
```

## 10. Key Beginner Takeaways

- `.d.ts` files describe types; they do not implement runtime code.
- `defaultExport` is not special; it is just a local name used to define a default export.
- `export default` and named `export` are imported differently.
- `export *` does not re-export default exports.
- `types/@types` is for `@types` package-style declarations.
- `types/npm` is for package-owned declarations copied locally.
- `types/npm` works here because `tsconfig.json` explicitly maps imports to it.
- Module types require imports.
- Global types are available everywhere once TypeScript includes their declaration package.
