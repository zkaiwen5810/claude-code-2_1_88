# TypeScript Cheat Sheet For This Repo

This note is for a beginner reading the reconstructed `claude-code` source.

It is not a full TypeScript guide. It focuses on the syntax and patterns that show up often in this repo.

## 1. What You Are Looking At

Most source files are one of these:

- `*.ts`: TypeScript logic files
- `*.tsx`: TypeScript files that contain React JSX UI
- `*.js`: JavaScript files, sometimes still written in a TypeScript-style codebase

In this repo:

- `commands/` usually define slash commands
- `tools/` usually define model-callable tools
- `hooks/` are React hooks, reusable UI/state logic
- `components/` are React UI pieces
- `services/` are integrations and subsystems
- `utils/` are helpers

## 2. The Smallest Useful Reading Strategy

When a file looks overwhelming, read in this order:

1. File name and directory
2. `import` lines
3. `export` lines
4. top-level constants/functions
5. ignore most type syntax on first pass

Good first question:

"What does this file provide to the rest of the app?"

## 3. Imports

Example:

```ts
import React from 'react'
import { feature } from 'bun:bundle'
import { logError } from './utils/log.js'
```

How to read it:

- `import X from '...'`: bring in one default thing
- `import { A, B } from '...'`: bring in named things
- `'./utils/log.js'`: local file
- `'react'`: package dependency

Beginner shortcut:

- Do not try to understand every import.
- Just notice categories: UI, helpers, config, services, tools.

## 4. Exports

Example:

```ts
export function init(): void {
  // ...
}
```

or:

```ts
export default command
```

How to read it:

- `export`: this file exposes something for other files to use
- `export default`: the main thing this file provides

## 5. Function Syntax

Example:

```ts
function add(a: number, b: number): number {
  return a + b
}
```

Meaning:

- `a: number`: parameter type
- `): number`: return type

Beginner rule:

- You can often ignore the type parts and read it as normal JavaScript.

So this:

```ts
function add(a: number, b: number): number
```

can first be read as:

```ts
function add(a, b)
```

## 6. Arrow Functions

Very common in this repo.

```ts
const fn = (): void => {
  doSomething()
}
```

Read it as:

- define a function called `fn`
- it takes no arguments
- it returns nothing important (`void`)

Another common form:

```ts
const doubled = items.map(item => item * 2)
```

Read it as:

- for each `item`, return `item * 2`

## 7. Type Annotations You Can Ignore On First Pass

These are common:

```ts
name: string
count: number
enabled: boolean
value: string | undefined
result: Promise<void>
```

Quick meanings:

- `string`: text
- `number`: numeric value
- `boolean`: `true` or `false`
- `A | B`: one of multiple possible types
- `undefined`: may be missing
- `Promise<T>`: async result
- `void`: no meaningful return value

First-pass reading trick:

- strip the types mentally
- focus on names and control flow

## 8. Objects

Very important in command/tool definitions.

```ts
const command = {
  name: 'exit',
  description: 'Exit the app',
  type: 'local-jsx',
}
```

This is just a grouped set of fields.

How to read it:

- `name`: identifier
- `description`: human description
- `type`: category

In this repo, big object literals often define:

- commands
- tools
- config
- app state

## 9. Arrays

Example:

```ts
const items = [a, b, c]
```

Very common array operations:

```ts
items.map(...)
items.filter(...)
items.find(...)
items.some(...)
items.sort(...)
```

Quick meanings:

- `map`: transform each item
- `filter`: keep matching items
- `find`: return first match
- `some`: check whether any match
- `sort`: reorder items

## 10. Async/Await

Extremely common in this repo.

```ts
async function load(): Promise<void> {
  const data = await fetchSomething()
  save(data)
}
```

Read it as:

- this function does asynchronous work
- pause at `await` until result is ready

Beginner shortcut:

- `await something()` often means "get the result before continuing"

## 11. Destructuring

Very common.

```ts
const { name, version } = pkg
```

Read it as:

- pull `name` and `version` fields out of `pkg`

Also:

```ts
import { Box, Text } from '../ink.js'
```

Same idea, but for imports.

## 12. Optional Chaining

Common in large app code.

```ts
user?.profile?.name
```

Meaning:

- if `user` exists, then try `profile`
- if `profile` exists, then try `name`
- otherwise return `undefined` instead of crashing

## 13. Nullish Coalescing

```ts
const value = input ?? defaultValue
```

Meaning:

- use `input` if it exists
- otherwise use `defaultValue`

## 14. Conditionals

Normal:

```ts
if (enabled) {
  run()
} else {
  stop()
}
```

Compact form:

```ts
const label = enabled ? 'on' : 'off'
```

Meaning:

- if `enabled`, use `'on'`
- otherwise use `'off'`

## 15. Common Repo Pattern: Feature Gating

You will see patterns like:

```ts
const voiceCommand = feature('VOICE_MODE')
  ? require('./commands/voice/index.js').default
  : null
```

Meaning:

- if build/runtime feature flag is enabled, load that module
- otherwise use `null`

Why this appears:

- this app ships many optional capabilities
- some are compiled in or removed depending on flags

## 16. Common Repo Pattern: Dynamic Import / Lazy Loading

Example:

```ts
const real = await import('./commands/insights.js')
```

Meaning:

- load that module only when needed

Why this repo does it:

- reduce startup cost
- avoid loading huge modules early
- break circular dependencies

## 17. Common Repo Pattern: `require(...)`

You may expect only `import`, but this repo also uses `require(...)`.

Example:

```ts
const assistantModule = feature('KAIROS')
  ? require('./assistant/index.js')
  : null
```

Usually used here for:

- conditional loading
- lazy loading
- avoiding circular imports

You do not need to worry much about the distinction at first.

## 18. Common Repo Pattern: React Components

A `tsx` file often returns JSX:

```tsx
export function MyView() {
  return <Text>Hello</Text>
}
```

Read it as:

- this function describes UI
- `<Text>` is a UI component

In this repo, many UI files use Ink, which is React for terminal interfaces.

So:

```tsx
<Box>
  <Text>Hello</Text>
</Box>
```

means terminal UI layout, not browser HTML.

## 19. Common Repo Pattern: Hooks

Hook names usually start with `use`.

Examples in this repo:

- `useRemoteSession`
- `useCommandQueue`
- `useMergedTools`
- `useSettings`

Basic idea:

- a hook is reusable stateful logic for React components

Example:

```ts
const [open, setOpen] = useState(false)
```

Meaning:

- `open` is the current value
- `setOpen(...)` changes it

## 20. Common Repo Pattern: State Objects

Files like `AppStateStore.ts` define large state shapes.

Example idea:

```ts
type AppState = {
  verbose: boolean
  statusLineText: string | undefined
}
```

Read it as:

- the app stores many named pieces of state
- this is a schema describing those fields

When the file is huge, do not read every field.
Instead ask:

- what major categories of state exist?
- session?
- UI?
- tools?
- MCP?
- plugins?
- remote mode?

## 21. Common Repo Pattern: Types and Interfaces

Examples:

```ts
type Command = { name: string }
interface User { id: string }
```

These define shapes of data.

Beginner reading rule:

- `type` and `interface` usually do not execute anything
- they describe structure for humans and tooling

You can skim them first, then revisit if needed.

## 22. Common Repo Pattern: Union Types

Example:

```ts
type Status = 'idle' | 'running' | 'done'
```

Meaning:

- `Status` can only be one of those exact strings

This is common in app state and command/tool modes.

## 23. Common Repo Pattern: Generics

This looks scary at first:

```ts
Promise<T>
Map<string, number>
Record<string, ServerResource[]>
```

Simple reading:

- `Promise<T>`: async result containing some type `T`
- `Map<string, number>`: map from text keys to numbers
- `Record<string, X>`: object whose keys are strings and values are `X`

Do not get stuck here. Treat the inside of `<...>` as extra detail.

## 24. Common Repo Pattern: Memoization

Example:

```ts
const COMMANDS = memoize((): Command[] => [ ... ])
```

Meaning:

- compute once
- reuse cached result later

Why this repo uses it:

- startup performance
- avoid repeated expensive setup

## 25. Common Repo Pattern: Large Registries

Files like `commands.ts` and `tools.ts` are long because they are registries.

They often:

- import many modules
- conditionally include some
- return one combined list

This does not mean every line is unique logic.
Often the file is mostly wiring.

When reading such files, focus on:

- what gets registered
- what is conditional
- where the real implementation lives

## 26. How To Read A Command File

Typical questions:

1. What is the command name?
2. Is it local UI, prompt-driven, or both?
3. What function runs when invoked?
4. Which helpers/services does it call?

You usually do not need to understand every imported type.

## 27. How To Read A Tool File

Typical questions:

1. What capability does the tool expose?
2. What inputs does it accept?
3. What permission/safety checks exist?
4. What actual operation happens underneath?
5. What output is returned to the model?

Tool files in this repo often separate:

- prompt/schema definition
- validation
- execution

## 28. How To Read A Hook File

Typical questions:

1. What state does it manage?
2. What inputs does it receive?
3. What side effects does it trigger?
4. What values/functions does it return?

Common React-related syntax:

```ts
useEffect(() => {
  // side effect
}, [dependency])
```

Meaning:

- run the effect when dependencies change

## 29. How To Read Error Handling

Common forms:

```ts
try {
  await run()
} catch (error) {
  logError(error)
}
```

Meaning:

- try risky work
- handle failures without crashing badly

In this repo, error handling matters a lot because it is a CLI app with:

- network requests
- subprocesses
- file operations
- remote sessions
- plugins

## 30. Repo-Specific Vocabulary

Useful mental map for names you will keep seeing:

- `MCP`: model context protocol integration layer
- `Ink`: React renderer for terminal UI
- `REPL`: the interactive terminal session screen
- `hook`: reusable React logic
- `tool`: capability callable by the model
- `command`: user-invoked slash command
- `skill`: packaged instruction/workflow capability
- `plugin`: extension package
- `teleport` / `remote`: remote session features
- `kairos`, `buddy`, `coordinator`: feature-gated product modes

## 31. Things You Can Safely Ignore At First

When you are overwhelmed, skip these on first pass:

- very long import lists
- most `type` definitions
- generic-heavy signatures
- JSX details in complex UI files
- build-flag conditionals
- analytics and telemetry wiring

Come back only if they matter to your question.

## 32. Things You Should Not Ignore

These usually carry the real meaning:

- function names
- object field names
- conditional branches
- comments near startup logic
- validation logic
- permission/safety checks
- what gets returned/exported

## 33. A Practical Translation Example

Original:

```ts
export async function renderAndRun(
  root: Root,
  element: React.ReactNode,
): Promise<void> {
  root.render(element)
  startDeferredPrefetches()
  await root.waitUntilExit()
  await gracefulShutdown(0)
}
```

Beginner-friendly reading:

- this function is exported for other files to use
- it is asynchronous
- it receives a UI root and a UI element
- it renders the UI
- it starts some background prefetch work
- it waits for the UI session to end
- then it shuts down cleanly

You do not need to fully understand `Root`, `React.ReactNode`, or `Promise<void>` to get the behavior.

## 34. Best Reading Order In This Repo

For a beginner:

1. one small command file
2. one small tool file
3. one registration file like `skills/bundled/index.ts`
4. one hook file
5. only then look at `main.tsx` or `REPL.tsx`

If a file is over 1000 lines, treat it as a map, not a chapter book.

## 35. Recommended Beginner Mindset

Do not ask:

- "Can I understand every token in this file?"

Ask:

- "What is this file responsible for?"
- "What are its inputs and outputs?"
- "What larger subsystem is it part of?"

That is enough to make steady progress.

## 36. Quick Glossary Of Syntax You Will See Often

```ts
const x = 1
```

- define a constant

```ts
let x = 1
```

- define a variable that can change

```ts
obj.name
```

- access a field

```ts
fn(arg)
```

- call a function

```ts
arr.map(x => x.id)
```

- transform each array item

```ts
if (cond) { ... }
```

- conditional branch

```ts
return value
```

- function result

```ts
await doWork()
```

- wait for async work

```ts
foo?.bar
```

- safely access nested field

```ts
value ?? fallback
```

- use fallback when missing

## 37. If You Only Remember Five Rules

1. Ignore most type syntax on first pass.
2. Read file purpose before file details.
3. Long registry files are mostly wiring, not core logic.
4. `tsx` in this repo usually means terminal UI via Ink.
5. Follow names: command names, tool names, hook names, service names.

## 38. Suggested Next Files To Read

Good small-ish starting points:

- `restored-src/src/commands/version.js`
- `restored-src/src/commands/exit/exit.tsx`
- `restored-src/src/tools/GlobTool/GlobTool.ts`
- `restored-src/src/tools/GrepTool/GrepTool.ts`
- `restored-src/src/skills/bundled/index.ts`

After that, revisit:

- `restored-src/src/commands.ts`
- `restored-src/src/tools.ts`

Use those as indexes, not as line-by-line reading material.
