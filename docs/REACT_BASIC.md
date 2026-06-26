## Take `REPL.tsx` AS A EXAMPLE
`REPL.tsx` exports a React function component (almost certainly the default export, conventionally named `REPL`). The evidence I can see from the conversation context:

- It's a `.tsx` file (TypeScript + JSX)
- It uses React hooks: `useRef`, `useState`, `useEffect`, `useCallback`, `useSyncExternalStore` (e.g. REPL.tsx:900, 904, 3861, 3889)
- It returns JSX — there's a large fragment at REPL.tsx:4905 and JSX usages at lines 4410, 4552 that pass props like `onSubmit`, `vimMode`, `setVimMode`, etc. to child components like `<CommandKeybindingHandlers>` and `<PromptInput>`

I haven't read the very top of the file, so I can't quote the exact `export default function REPL(...)` line, but the patterns inside are unmistakably a function component.

---

## What is a "component" in React?

A component is just **a function (or class) that returns a description of UI** — a tree of elements written in JSX. React takes that description and turns it into actual output.

### Function component (the modern kind)

```jsx
function Greeting({ name }) {
  return <h1>Hello, {name}</h1>
}
```

That's it. A regular JavaScript function that:

1. Receives data via `props` (an object of inputs)
2. Optionally uses **hooks** (`useState`, `useEffect`, etc.) to read or store data
3. Returns JSX — a tree describing what should appear on screen

React does **not** call your function continuously. It calls it, gets a tree, then calls it again later when something changes, gets a new tree, and figures out what actually changed. Your function is essentially a pure recipe: "given these inputs, here's what the UI should look like."

### Class component (the older kind)

Before hooks existed, components had to be classes extending `React.Component`, with `render()` returning JSX and lifecycle methods like `componentDidMount`. The codebase you're reading uses function components with hooks throughout.

### Why components?

- **Composition** — small components nest to make bigger UIs. `REPL` is one big component, but it composes smaller ones like `<PromptInput>`, `<CommandKeybindingHandlers>`, etc.
- **Reusability** — write once, render many times with different props.
- **Reactivity** — when props/state change, React re-runs the function and updates the screen automatically.

---

## How is it rendered?

React's rendering has three phases. Using REPL as the running example:

### Phase 1: Mount — first render

Something has to **mount** the root component. In a normal React app, you'd write:

```jsx
const root = ReactDOM.createRoot(document.getElementById('app'))
root.render(<REPL />)
```

That single `render(<REPL />)` call starts everything. claude-code is a TUI, so instead of `ReactDOM` it uses **Ink** (`import { render } from 'ink'` or similar) as the renderer — same React, but the output goes to terminal cells instead of DOM nodes. Ink uses Yoga for layout. The point is: *some* renderer somewhere calls your function for the first time.

### Phase 2: Render — running the function

React calls `REPL(props)`. Inside, your function:

- Reads props
- Calls hooks (e.g. `useState` returns the current state, `useSyncExternalStore` reads the latest query-guard status)
- Computes values
- Returns JSX describing the UI

That JSX is **not** real DOM. It's a description — an object tree like:

```js
{ type: 'div', props: { children: [
  { type: PromptInput, props: { onSubmit, vimMode, ... } },
  ...
] } }
```

(You can actually `console.log(<REPL />)` to see the plain object.)

### Phase 3: Commit — apply to the renderer

React takes that virtual tree and hands it to the renderer (ReactDOM for browser, Ink for terminal). The renderer:

1. **Reconciles** — compares the new tree with the previous one (if any) to find the minimal set of changes
2. **Commits** — applies those changes to whatever the output target is (DOM nodes in a browser, terminal cells in a TUI)

### Subsequent renders

After mount, React **re-runs your function** when:

- A `useState` setter is called
- A `useReducer` dispatch happens
- A parent passes new props
- A `useSyncExternalStore` snapshot changes (this is the case for `isQueryActive` and `queueSnapshot` in REPL)
- A `useContext` value changes

Each re-run produces a new JSX tree, React diffs it against the old one, and the renderer patches the output. **Your function doesn't know or care** that this is happening — it just runs, returns a description, and React handles the rest.

### What "rendering" specifically means in REPL's context

For this codebase, since it uses Ink:

1. Ink renders REPL into a terminal buffer
2. Each render produces Yoga-computed layout (which cells each character occupies)
3. Ink writes only the diff to stdout — so typing in the input field doesn't redraw the whole transcript, only the input row
4. State changes (Enter pressed, query finished, queue mutation) propagate via hooks → re-render → terminal patch

That's why the patterns we discussed earlier matter: `useSyncExternalStore` and signals are the bridges that let **non-React events** (a user pressing Enter, a queue mutation, a query-guard transition) trigger React re-renders, which then get re-painted to the terminal.
