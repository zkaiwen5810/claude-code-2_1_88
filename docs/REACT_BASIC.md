# React Basics Using the Recovered `REPL.tsx`

This guide uses `restored-src/src/screens/REPL.tsx` as a concrete example. The
file has been restored from the readable `sourcesContent` in its nested source
map; it is no longer React Compiler cache output. See
[`NESTED_SOURCE_MAP_RECOVERY.md`](NESTED_SOURCE_MAP_RECOVERY.md) for the
recovery process and provenance caveats.

The recovered source is useful evidence, but this remains an unofficial
reconstruction of the released package rather than authoritative upstream
source truth.

## What `REPL` actually is

`REPL` is a **named function component**, not a default export. Its declaration
starts at `screens/REPL.tsx:908`:

```tsx
export function REPL({
  commands: initialCommands,
  debug,
  // ...many more props...
  thinkingConfig,
}: Props): React.ReactNode {
  // ...hooks and render calculations...
}
```

The recovered file provides direct evidence that it is a component:

- Its capitalized function is rendered as `<REPL {...replProps} />`.
- It accepts one `Props` object.
- It calls built-in Hooks such as `useState`, `useEffect`, `useMemo`, and
  `useSyncExternalStore`, plus many custom Hooks.
- It returns a React node. Near the end it returns `mainReturn`, optionally
  wrapped in `<AlternateScreen>` for fullscreen rendering.

The file is large because `REPL` coordinates the main interactive screen. It
composes smaller components such as `PromptInput`, keybinding handlers,
dialogs, transcript views, and permission UI.

## Components, elements, and JSX

A modern React function component is a JavaScript or TypeScript function that
React calls to determine what a part of the UI should look like:

```tsx
function Greeting({ name }: { name: string }) {
  return <Text>Hello, {name}</Text>
}
```

A component normally:

1. receives inputs through props;
2. reads state, context, refs, or external stores through Hooks;
3. calculates its output; and
4. returns React nodes, often written as JSX.

Rendering code should be pure: given the same props, state, and context, it
should calculate the same output. Event handlers and Effects are the usual
places for side effects.

JSX creates **React element objects**. It does not create terminal cells and it
does not call a component immediately. For example:

```tsx
const element = <REPL {...replProps} />
```

Conceptually, `element` contains `REPL` as its `type` and `replProps` as its
props. Passing it to a root tells React to render it later. Logging this element
can show the element descriptor, but does not execute `REPL` or reveal the JSX
tree that `REPL` will return.

Function components also existed before Hooks. Before Hooks, a function
component could render from props, but state and lifecycle features generally
required a class component. Class components remain supported, although this
code primarily composes function components and Hooks.

## What makes a function a Hook?

A Hook participates in React's per-component hook lifecycle. Built-in Hooks
include `useState`, `useEffect`, and `useSyncExternalStore`. A function such as
`useAppState` is a custom Hook because it calls other Hooks.

The recovered `REPL` shows both kinds of external-store read:

```tsx
// Custom Hook: selects AppState fields through useSyncExternalStore internally.
const toolPermissionContext = useAppState(s => s.toolPermissionContext)
const tasks = useAppState(s => s.tasks)

// Built-in Hook used directly for the local query lifecycle store.
const isQueryActive = React.useSyncExternalStore(
  queryGuard.subscribe,
  queryGuard.getSnapshot,
)
```

Calling `store.getState()` alone is not a Hook: it is just an ordinary read and
does not subscribe the component. Hooks must be called at the top level of a
component or another Hook so React can associate each call with a stable hook
slot.

For `useAppState`, the store broadcasts every successful state change to all
listeners. Each Hook instance supplies its own selector-backed snapshot, and
React uses `Object.is` to decide whether that selected result changed. The
store's listener registry itself does not distinguish slices. See
[`STATE_AND_RENDERING.md`](STATE_AND_RENDERING.md) for the full flow.

## How the main `REPL` tree is mounted

This program uses its recovered, customized Ink implementation under
`restored-src/src/ink/`, not ReactDOM and not merely an opaque `render` import
from an npm package.

The main path is:

```text
main.tsx
  createRoot(renderOptions)
       ↓
replLauncher.tsx
  <App {...appProps}>
    <REPL {...replProps} />
  </App>
       ↓
interactiveHelpers.tsx
  renderAndRun(root, element)
       ↓
  root.render(element)
```

`<App>` supplies the app-state, statistics, and FPS contexts around `REPL`.
The wrapper in `src/ink.ts` also adds the theme provider before forwarding the
tree to the Ink root.

`root.render(...)` triggers the initial render. **Mounting** means that this is
the first time a component instance is added to the tree; mount is not a
separate step alongside React's render and commit steps.

## Trigger, render, and commit

React describes a screen update in three steps: **trigger, render, commit**.

### 1. Trigger

The initial `root.render(element)` triggers the first render. Later work can be
triggered when, for example:

- a state setter receives a value React treats as changed;
- an ancestor renders and reaches this component again;
- a consumed Context value changes; or
- a `useSyncExternalStore` snapshot changes.

Calling a setter does not guarantee a visible terminal change. React can bail
out when state is unchanged, components can be memoized, and a render can
produce the same host output as before.

### 2. Render

React calls the necessary function components to calculate the next tree. For
`REPL`, that means reading its props, running its Hooks in order, calculating
derived values, and reaching its returned `mainReturn` tree.

Rendering and reconciliation happen before host mutations are committed.
React determines how the new element tree differs from the current fiber and
host trees. It may also render descendants; a parent render does not imply that
every terminal cell will change.

### 3. Commit

React's custom reconciler applies the required mutations to Ink host nodes.
In this recovered Ink implementation, Yoga layout is calculated during the
commit path so layout effects can observe current layout data.

Effects such as `useEffect` run outside the pure render calculation. The
lifecycle logging near the beginning of `REPL`, for example, is implemented as
an Effect with a cleanup function. Because that Effect depends on `disabled`,
its cleanup runs both before an Effect re-run caused by a changed `disabled`
value and when the component unmounts.

## From the committed Ink tree to terminal output

After React updates the Ink host tree, the terminal renderer performs more
work:

1. Yoga calculates positions and sizes for the host nodes.
2. Ink paints the laid-out nodes into a cell-based screen buffer.
3. It compares the new frame with the previous frame, using damage tracking
   and cached regions where possible.
4. It emits the required terminal control sequences and changed cell data.

This frame diff is distinct from React reconciliation. React decides how to
update the component and host trees; Ink later decides how to update the
physical terminal from its screen buffers.

It is therefore too strong to say that typing always redraws "only the input
row." The implementation attempts incremental terminal updates, but layout
shifts, overlays, resize events, fullscreen transitions, or damage recovery can
require a wider patch or full reset. Likewise, a component can re-render even
when the terminal diff is empty.

The complete path is:

```text
event or store update
  → React update is triggered
  → components render and reconcile
  → Ink host mutations commit
  → Yoga computes layout
  → Ink paints a screen buffer
  → terminal frames are diffed
  → escape sequences and changed cells are written
```

For the app-specific state subscription details, continue with
[`STATE_AND_RENDERING.md`](STATE_AND_RENDERING.md). For the general React model,
the official React guides on
[components](https://react.dev/learn/your-first-component),
[render and commit](https://react.dev/learn/render-and-commit), and
[element creation](https://react.dev/reference/react/createElement) use the
same terminology.
