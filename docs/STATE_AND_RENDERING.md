# State Mutation and React Rendering — A Beginner's Guide Using `AppStateStore`

This document explains how React state flows and how re-renders happen, using `restored-src/src/state/*` as the running example. It's written for engineers who have used Node/TypeScript but haven't internalized how React works under the hood.

You should read it linearly — Part 1 builds the mental model from scratch, then Part 2 walks through `AppStateStore`'s actual code, then Part 3 walks the full lifecycle of the store, then Part 4 does a concrete end-to-end trace of one field (`toolPermissionContext`). Part 5 explains the recovered TSX's provenance, and Part 6 is a quick-reference table.

---

## Part 1: The Building Blocks (and how React state management evolved)

The core question React state machinery exists to answer is deceptively simple:

> *"A user types something into an input box. How does the rest of the screen know to update?"*

Each section below adds one idea. By the end you'll see exactly what problem each piece of code in `state/` solves.

---

### 1.1 React `useState` — the smallest unit of memory

A React **component** is just a function that returns a description of UI (a JSX tree). When React runs the function, it executes top-to-bottom and returns the tree. Without any state, every run of that function is independent — it has no memory.

`useState` is React's slot for "remember one value across renders of *this* component":

```tsx
import { useState } from 'react'

function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>clicked {count} times</button>
}
```

What's happening:

1. **First render.** React calls `Counter()`. `useState(0)` returns `[0, setCount]`. The component renders `<button>clicked 0 times</button>`.
2. **A click.** The button's `onClick` runs `setCount(count + 1)` → React is told "the value for this slot changed."
3. **Second render.** React re-runs `Counter()`. `useState(0)` returns `[1, setCount]` (the *new* value, not `0`). The component renders `<button>clicked 1 times</button>`.

Three rules that aren't obvious until you hit them:

- **Private to one component.** Two `<Counter />` instances have two independent slots. Nothing crosses the boundary.
- **Re-runs only the component that called `set*`, plus its descendants in the tree.** Siblings don't rerun.
- **Hooks must be called at the top of the function, in the same order on every render.** Otherwise React gets confused about which slot is which.

`useState` is enough for one component to remember something. What if two components need to share a value?

---

### 1.2 The prop-drilling problem

Say a "user" object is set at the top of your tree but read many layers down by deeply nested components (Avatar, Header, Toolbar, Footer). The naive solution is to pass it through props at every layer:

```tsx
function App() {
  const [user, setUser] = useState({ name: 'Ada' })
  return <Page user={user} setUser={setUser} />
}

function Page({ user, setUser }) {
  return <Sidebar user={user} setUser={setUser} />
}

function Sidebar({ user, setUser }) {
  return <Avatar user={user} />
}

function Avatar({ user }) {
  return <span>{user?.name ?? 'guest'}</span>
}
```

Notice `Page` and `Sidebar` don't actually use `user` or `setUser` — they just forward them. That's **prop drilling**, and it's painful:

- The tree is many layers deep.
- Many components need different slices of the same state.
- A new descendant arrives and you have to thread new props through 5 files.

---

### 1.3 React `Context` — "publish once, read anywhere"

Context is React's built-in fix. You publish a value at the top of a subtree; any descendant can pull it out without props:

```tsx
import { createContext, useContext, useState } from 'react'

const UserContext = createContext<{
  user: { name: string } | null
  setUser: (u: { name: string }) => void
} | null>(null)

function App() {
  const [user, setUser] = useState<{ name: string } | null>({ name: 'Ada' })
  return (
    <UserContext.Provider value={{ user, setUser }}>
      <Page />
    </UserContext.Provider>
  )
}

function Avatar() {
  const ctx = useContext(UserContext)!
  return <span>{ctx.user?.name ?? 'guest'}</span>
}
```

Three things to internalise:

- **`createContext<X | null>(null)`** declares a new "tag" (a Context object). The `<null>` is the *default* — what `useContext` returns if no `<Provider>` is found.
- **`<MyContext.Provider value={…}>`** publishes the value to all descendants.
- **`useContext(MyContext)`** walks up the fiber tree from the calling component until it finds the nearest `Provider` ancestor, and returns whatever was passed to its `value` prop.

This is precisely what `state/AppState.tsx:47` does:

```tsx
// state/AppState.tsx:47
export const AppStoreContext = React.createContext<AppStateStore | null>(null)
```

…and what `<AppStateProvider>` will later do to publish the store (lines 112–120):

```tsx
<AppStoreContext.Provider value={store}>
  <MailboxProvider><VoiceProvider>{children}</VoiceProvider></MailboxProvider>
</AppStoreContext.Provider>
```

…and what `useAppStore` does to read it:

```tsx
// state/AppState.tsx:123-132
function useAppStore(): AppStateStore {
  const store = useContext(AppStoreContext)
  if (!store) {
    throw new ReferenceError(
      'useAppState/useSetAppState cannot be called outside of an <AppStateProvider />'
    )
  }
  return store
}
```

So Context alone looks like enough. Why isn't it?

---

### 1.4 Context's hidden trap — every consumer re-renders on every change

This is the part most tutorials skip. **When the value passed to `<MyContext.Provider>` changes, every component that called `useContext(MyContext)` re-renders — even ones that didn't read the part that changed.**

Imagine one context holding the whole app state:

```tsx
function App() {
  const [state, setState] = useState(initialAppState)  // 80 fields
  return (
    <AppContext.Provider value={{ state, setState }}>
      <Toolbar />      // only reads state.verbose
      <ModelPicker />  // only reads state.mainLoopModel
      <ThemeBadge />   // only reads state.theme
    </AppContext.Provider>
  )
}
```

The user clicks "make verbose." You call `setState(prev => ({ ...prev, verbose: !prev.verbose }))`. React sees the context value changed and re-renders **all three components**, even though only `Toolbar` cares about `verbose`. The other two do the same render work and produce identical output.

For an 80-field `AppState` updated frequently (every keystroke during chat input, every tool result, every mode toggle, …), this becomes a real performance problem. The React docs explicitly call it out and recommend the official fix:

> *"…if the value you pass to Provider changes, all consumers will re-render. … Consider using `useSyncExternalStore` or a state management library."*

That's the bridge to the next idea.

---

### 1.5 External stores + selected snapshots — the second fix

The project's solution combines two ideas:

1. **Move the value out of React's memory** into a plain JavaScript object — a "mailbox." The mailbox has its own subscribers list.
2. **Read it from React via `useSyncExternalStore`**, which wraps a foreign store and lets each consumer expose the slice it cares about as that hook instance's snapshot.

Here's the actual mailbox from `state/store.ts:10-34`:

```ts
// state/store.ts
type Listener = () => void
type OnChange<T> = (args: { newState: T; oldState: T }) => void

export type Store<T> = {
  getState: () => T
  setState: (updater: (prev: T) => T) => void
  subscribe: (listener: Listener) => () => void
}

export function createStore<T>(initialState: T, onChange?: OnChange<T>): Store<T> {
  let state = initialState
  const listeners = new Set<Listener>()

  return {
    getState: () => state,

    setState: (updater) => {
      const prev = state
      const next = updater(prev)
      if (Object.is(next, prev)) return     // bail if nothing changed
      state = next
      onChange?.({ newState: next, oldState: prev })   // ① side-effects go here
      for (const listener of listeners) listener()    // ② notify subscribers
    },

    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

Three primitives, all of them plain JS. No React involved.

The `setState` flow has two parts:

- Line `onChange?.(...)` — *before* notifying subscribers, run an optional callback with the old and new state. This is where persistence, analytics, sync-to-cloud, clearing caches, etc. all live.
- Line `for (const listener of listeners) listener()` — *after* `onChange`, walk every subscriber and tell them "the store changed." This is a broadcast: the store has no selectors and does not know which slice each subscriber reads. Each React listener then checks its own selected snapshot and React decides independently whether that hook's component needs to re-render.

Why an `Object.is` bail at the top? If your updater returns the same reference (e.g. `prev => prev` because nothing matched the conditions), no listeners get woken up and no React re-renders happen. Cheap skip for the common "nothing changed" case.

---

### 1.6 `useSyncExternalStore` — the bridge from foreign store to React

`useState + Context` made everything *couple*: changing any field woke every consumer. The external store decouples that — but now we need a way to make React *react* to changes in something it doesn't own.

That's `useSyncExternalStore`, React's official hook for "subscribe to an outside-the-React store":

```tsx
// state/AppState.tsx:150-167 (build-target guard omitted here)
export function useAppState<T>(selector: (state: AppState) => T): T {
  const store = useAppStore()
  const get = () => {
    const state = store.getState()
    const selected = selector(state)   // read just the slice I care about
    return selected
  }
  return useSyncExternalStore(store.subscribe, get, get)
}
```

What `useSyncExternalStore(subscribe, getSnapshot)` does internally:

1. During the first render, it calls `getSnapshot()` to read the current value.
2. It calls `subscribe(onStoreChange)`. When the store broadcasts a change, React's callback calls the current `getSnapshot()` and compares its result with the snapshot remembered by this hook instance using `Object.is`.
3. If the selected snapshot is unchanged, this subscription does not schedule a re-render. If it changed, React schedules the component and reads the snapshot again while rendering.
4. **At unmount**, the function returned by `subscribe` is called to remove the listener.

The `subscribe(onStoreChange)` call is what wires this particular `useAppState` hook instance into the store's `listeners` set. Two different `useAppState` calls own independent listeners, even if they are in the same component. The distinction between their slices lives in their separate `get` closures, not in the store's registry.

So now:

```tsx
function Toolbar() {
  const verbose = useAppState(s => s.verbose)   // selects state.verbose
}
function ModelPicker() {
  const model = useAppState(s => s.mainLoopModel)  // selects state.mainLoopModel
}
```

A `setState` that touches only `verbose` will:

- run `onChange`;
- invoke both registered listeners because the store broadcasts every successful change;
- make React evaluate `Toolbar`'s snapshot and detect that `verbose` changed; and
- make React evaluate `ModelPicker`'s snapshot, see the same `mainLoopModel`, and skip a render from that subscription.

That's the per-slice rendering win: notification is global, but React's snapshot comparison is per hook instance.

**Consistent snapshots.** A second guarantee of `useSyncExternalStore` is that React checks external-store snapshots for consistency around a render:

```tsx
function Toolbar() {
  const verbose = useAppState(s => s.verbose)                    // (a)
  const mode    = useAppState(s => s.toolPermissionContext.mode)  // (b)
  if (verbose && mode === 'plan') return <Banner />
}
```

If you called `store.getState()` directly, React would not know that those reads depend on an external store and could not validate them before commit. Each `useAppState` call here has its own selected snapshot; React does not put one captured `AppState` into the store's listener registry. Instead, `useSyncExternalStore` lets React recheck the snapshots and retry the render if the store changes at an unsafe point, preventing a torn committed UI.

---

### 1.7 Why a custom store instead of Redux/Zustand/etc.?

This codebase chose to build its own ~25-line store rather than reach for a library. The reasons aren't ideological, they're practical:

- **One file, no dependency.** `state/store.ts` is 34 lines. Adding Redux is +5–10kB gzipped and a second mental model.
- **No boilerplate.** Each consumer is one line (`useAppState(s => s.x)`). Action types, reducers, slices — none of those exist.
- **Customisable side-effects.** `onChange` is a first-class parameter on `createStore`, so the book's bookkeeper (`onChangeAppState`) plugs in trivially. Most libraries make you register reducers/middleware instead.
- **Aligns with React's official answer.** The design here is literally the one React docs recommend (`useSyncExternalStore`) — just without the rest of the library around it.

The shape is generic (`Store<T>`), so the same machinery could host any kind of state. This codebase happens to use it once, for `AppState`.

---

## Part 2: `AppStateStore` — anatomy

The whole folder is six files. Each plays one role:

| File | Role |
|---|---|
| `state/store.ts` | The generic mailbox (`Store<T>` + `createStore`). No React. |
| `state/AppStateStore.ts` | The `AppState` *type* and `getDefaultAppState()`. Defines what fits in the mailbox. |
| `state/AppState.tsx` | React adapter. `<AppStateProvider>` mounts it; `useAppState` / `useSetAppState` / `useAppStore` are the read/write hooks. |
| `state/onChangeAppState.ts` | The `onChange` callback — persistence + cloud sync + cache invalidation. Lives outside React entirely. |
| `state/selectors.ts` | Pure read helpers (e.g. "which agent should input go to?"). |
| `state/teammateViewHelpers.ts` | Pre-built updaters for the "view teammate transcript" feature. |

Two of these files (`selectors.ts`, `teammateViewHelpers.ts`) are conveniences. The four that matter for the rendering model are `store.ts`, `AppStateStore.ts`, `AppState.tsx`, and `onChangeAppState.ts`. I'll walk all four.

---

### 2.1 `state/store.ts` — the mailbox

Already shown in full in §1.5. The only thing to add is that **nothing about this file knows about React or `AppState`** — it's pure data structure. That's the foundation the React layer sits on.

---

### 2.2 `state/AppStateStore.ts` — the data shape and the defaults

This file is mostly type declarations. The `AppState` type lists every field the UI ever reads. A few highlights (you can see the full 500-line type in the source):

```ts
// state/AppStateStore.ts:89 — illustrative excerpt
export type AppState = DeepImmutable<{
  settings: SettingsJson
  verbose: boolean
  mainLoopModel: ModelSetting
  toolPermissionContext: ToolPermissionContext
  mcp: { clients: MCPServerConnection[]; tools: Tool[]; commands: Command[]; ... }
  plugins: { enabled: LoadedPlugin[]; disabled: LoadedPlugin[]; ... }
  tasks: { [taskId: string]: TaskState }
  teamContext?: { teamName: string; teammates: ... }
  inbox: { messages: Array<...> }
  notifications: { current: Notification | null; queue: Notification[] }
  // ... 60+ more fields
}>
```

Two structural things to notice:

- **Most fields are wrapped in `DeepImmutable`** so the compiler complains if you try to mutate (you have to construct a new object). This forces the immutable-update pattern that `Store.setState`'s `Object.is` bail-out requires.
- **Some fields are deliberately excluded from `DeepImmutable`** (`tasks`, `agentNameRegistry`, `mcp`, `teamContext`, etc.) because they hold function-typed values or `Map`s that don't deep-freeze cleanly. The "rules" are intentionally relaxed where the math doesn't fit.

Then `getDefaultAppState()` (line 456) returns a brand-new blank state. Key parts:

```ts
// state/AppStateStore.ts:456-503
export function getDefaultAppState(): AppState {
  const teammateUtils = require('../utils/teammate.js') as typeof import('../utils/teammate.js')
  const initialMode: PermissionMode =
    teammateUtils.isTeammate() && teammateUtils.isPlanModeRequired()
      ? 'plan'
      : 'default'

  return {
    settings: getInitialSettings(),
    tasks: {},
    agentNameRegistry: new Map(),
    verbose: false,
    mainLoopModel: null,
    expandedView: 'none',
    toolPermissionContext: {
      ...getEmptyToolPermissionContext(),
      mode: initialMode,
    },
    mcp: { clients: [], tools: [], commands: [], resources: {}, pluginReconnectKey: 0 },
    plugins: { enabled: [], disabled: [], commands: [], errors: [], installationStatus: {...}, needsRefresh: false },
    todos: {},
    inbox: { messages: [] },
    workerSandboxPermissions: { queue: [], selectedIndex: 0 },
    pendingWorkerRequest: null,
    pendingSandboxRequest: null,
    promptSuggestion: { text: null, promptId: null, shownAt: 0, acceptedAt: 0, generationRequestId: null },
    speculation: IDLE_SPECULATION_STATE,
    authVersion: 0,
    initialMessage: null,
    activeOverlays: new Set<string>(),
    fastMode: false,
    // ... ~50 more fields
  }
}
```

A few things are not defaults — they're *computed at startup*:

- `initialMode` is `'plan'` for teammates spawned with `--plan-mode-required`, otherwise `'default'`. (Uses `require()` to dodge a circular import — see the eslint-disable comment.)
- `thinkingEnabled` defaults to `shouldEnableThinkingByDefault()`.
- `promptSuggestionEnabled` defaults to `shouldEnablePromptSuggestion()`.

So the file does two things: declare the schema, and produce a "blank but reasonable" instance.

---

### 2.3 `state/AppState.tsx` — the React adapter

This is the most important file for understanding how state interacts with rendering. It contains:

- The two Context declarations (`AppStoreContext`, `HasAppStateContext`)
- The `<AppStateProvider>` component
- Five hooks: `useAppStore`, `useAppState`, `useSetAppState`, `useAppStateStore`, `useAppStateMaybeOutsideOfProvider`

The nested source-map recovery has restored this file to readable TypeScript/TSX. The source below is therefore a lightly annotated excerpt of the recovered file, not a hand-decompiled translation:

```tsx
// state/AppState.tsx:57-121 (lightly annotated)
export function AppStateProvider({
  children,
  initialState,
  onChangeAppState,
}: Props): React.ReactNode {
  // ① Refuse to nest two providers.
  const hasAppStateContext = useContext(HasAppStateContext)
  if (hasAppStateContext) {
    throw new Error('AppStateProvider can not be nested within another AppStateProvider')
  }

  // ② Build the mailbox ONCE on first mount; keep it stable across re-renders.
  //    Note: useState's initializer fires only on the first render.
  const [store] = useState(() =>
    createStore<AppState>(
      initialState ?? getDefaultAppState(),
      onChangeAppState,
    )
  )

  // ③ Mount-time race fix.
  //    Remote-managed settings can finish loading before React mounts.
  //    If they did, re-disable bypass-permissions mode now.
  useEffect(() => {
    const { toolPermissionContext } = store.getState()
    if (
      toolPermissionContext.isBypassPermissionsModeAvailable &&
      isBypassPermissionsModeDisabled()
    ) {
      logForDebugging(
        'Disabling bypass permissions mode on mount (remote settings loaded before mount)',
      )
      store.setState(prev => ({
        ...prev,
        toolPermissionContext: createDisabledBypassPermissionsContext(
          prev.toolPermissionContext,
        ),
      }))
    }
    // eslint-disable-next-line ...
  }, [])

  // ④ Wire external settings changes through to the store.
  const onSettingsChange = useEffectEvent(
    (source: SettingSource) => applySettingsChange(source, store.setState),
  )
  useSettingsChange(onSettingsChange)

  // ⑤ Publish.
  return (
    <HasAppStateContext.Provider value={true}>
      <AppStoreContext.Provider value={store}>
        <MailboxProvider>
          <VoiceProvider>{children}</VoiceProvider>
        </MailboxProvider>
      </AppStoreContext.Provider>
    </HasAppStateContext.Provider>
  )
}
```

And the consumers:

```tsx
// state/AppState.tsx:123-132
function useAppStore(): AppStateStore {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const store = useContext(AppStoreContext)
  if (!store) {
    throw new ReferenceError(
      'useAppState/useSetAppState cannot be called outside of an <AppStateProvider />',
    )
  }
  return store
}

// state/AppState.tsx:150-167 (build-target guard omitted here)
export function useAppState<T>(selector: (state: AppState) => T): T {
  const store = useAppStore()
  const get = () => {
    const state = store.getState()
    const selected = selector(state)
    return selected
  }
  return useSyncExternalStore(store.subscribe, get, get)
}

// state/AppState.tsx:174-178
export function useSetAppState() {
  return useAppStore().setState
}

// state/AppState.tsx:183-185
export function useAppStateStore() {
  return useAppStore()
}

// state/AppState.tsx:193-200 — a fallback for callers that may be rendered
// outside the provider; returns undefined if there's no store.
export function useAppStateMaybeOutsideOfProvider<T>(selector: (state: AppState) => T): T | undefined {
  const store = useContext(AppStoreContext)
  return useSyncExternalStore(
    store ? store.subscribe : NOOP_SUBSCRIBE,
    () => (store ? selector(store.getState()) : undefined),
  )
}
```

Five hooks, with distinct purposes:

| Hook | What it gives you | When to use |
|---|---|---|
| `useAppStore()` | The whole `Store<AppState>` object | When you need *both* read and write, or want to pass `setState` to non-React code |
| `useAppState(s => s.x)` | The current value of one slice, with auto re-render | Reading one or a few fields of `AppState` |
| `useSetAppState()` | A stable `setState` reference | Components that *only* write state and should not re-render on reads |
| `useAppStateStore()` | The raw `Store<AppState>` | When you need to pass `getState`/`setState` to non-React callbacks |
| `useAppStateMaybeOutsideOfProvider(s => s.x)` | Slice or `undefined` | Components that might render without a provider in scope (e.g. tooltipped dialogs) |

---

### 2.4 `state/onChangeAppState.ts` — the bookkeeper

`onChangeAppState` is the single function that runs after every successful `setState`. It's where all the "side effects of state changes" live. Read in full it does five things:

```ts
// state/onChangeAppState.ts:43-171 (selected excerpts)
export function onChangeAppState({ newState, oldState }) {
  // ① Permission-mode diff — relay to the cloud dashboard and the SDK.
  const prevMode = oldState.toolPermissionContext.mode
  const newMode = newState.toolPermissionContext.mode
  if (prevMode !== newMode) {
    const prevExternal = toExternalPermissionMode(prevMode)
    const newExternal = toExternalPermissionMode(newMode)
    if (prevExternal !== newExternal) {
      notifySessionMetadataChanged({
        permission_mode: newExternal,
        is_ultraplan_mode: isUltraplan,
      })
    }
    notifyPermissionModeChanged(newMode)
  }

  // ② mainLoopModel — persisted into settings.
  if (newState.mainLoopModel !== oldState.mainLoopModel && newState.mainLoopModel === null) {
    updateSettingsForSource('userSettings', { model: undefined })
    setMainLoopModelOverride(null)
  }
  if (newState.mainLoopModel !== oldState.mainLoopModel && newState.mainLoopModel !== null) {
    updateSettingsForSource('userSettings', { model: newState.mainLoopModel })
    setMainLoopModelOverride(newState.mainLoopModel)
  }

  // ③ expandedView — persisted as legacy showExpandedTodos / showSpinnerTree flags.
  if (newState.expandedView !== oldState.expandedView) {
    const showExpandedTodos = newState.expandedView === 'tasks'
    const showSpinnerTree = newState.expandedView === 'teammates'
    if (getGlobalConfig().showExpandedTodos !== showExpandedTodos ||
        getGlobalConfig().showSpinnerTree !== showSpinnerTree) {
      saveGlobalConfig(current => ({ ...current, showExpandedTodos, showSpinnerTree }))
    }
  }

  // ④ verbose — persisted.
  if (newState.verbose !== oldState.verbose && getGlobalConfig().verbose !== newState.verbose) {
    saveGlobalConfig(current => ({ ...current, verbose: newState.verbose }))
  }

  // ⑤ settings changed — clear auth caches so apiKeyHelper / AWS / GCP pick up new values.
  if (newState.settings !== oldState.settings) {
    try {
      clearApiKeyHelperCache()
      clearAwsCredentialsCache()
      clearGcpCredentialsCache()
      if (newState.settings.env !== oldState.settings.env) {
        applyConfigEnvironmentVariables()
      }
    } catch (error) {
      logError(toError(error))
    }
  }
}
```

The big comment in the source (around line 51) tells you exactly why this function exists: before this central hook, mode changes were synchronised to the cloud dashboard by only 2 of 8+ mutation paths. Centralising the diff here means every mutation path now keeps CCR / SDK in sync without each path having to know about it.

A couple of things worth pointing out for the rendering model:

- **Diff-based, not flag-based.** This function compares `oldState` and `newState` directly. It is *not* a subscriber to a stream of changes — it's a synchronous callback fired inside `setState` before any listener. So when this code runs, the store has a new value, no components have re-rendered yet, and any I/O or fs writes it kicks off happen *between* the write and the React re-render.
- **Idempotent writes to global config.** The `expandedView` and `verbose` blocks check whether the new value already matches `getGlobalConfig()` before writing — this prevents infinite loops where a write to the file would re-trigger `setAppState`, which would re-trigger `onChange`. The escape hatch.
- **Try/catch around `clear*` cache calls.** These can throw if a credential file is malformed. The bookkeeper swallows the error and logs it; it never blocks the user from continuing.

---

## Part 3: `AppStateStore` — full lifecycle

Now I want to trace one store instance from the moment the program decides to launch the chat UI through to every read, write, and re-render, to the moment the chat UI unmounts.

### 3.1 Birth — `main.tsx` decides *what* the store starts with

`restored-src/src/main.tsx` is the entry. After Commander parses argv and resolves the user's settings, `--resume` / `--continue` flows load a previous session's state from disk, etc., the final `launchRepl` call looks like this (`main.tsx:3134-3146`, simplified):

```tsx
// main.tsx:3134-3146 (one of six launchRepl sites)
await launchRepl(
  root,
  {
    getFpsMetrics,
    stats,
    initialState: loaded.initialState,    // ← could be a fresh state or a resumed snapshot
  },
  {
    ...sessionConfig,
    mainThreadAgentDefinition: loaded.restoredAgentDef ?? mainThreadAgentDefinition,
    initialMessages: loaded.messages,
    // ...more REPL-specific props
  },
  renderAndRun,
)
```

Three things to note:

- **`initialState: loaded.initialState`** is the "starting mailbox content." For a brand-new session it's the result of `getDefaultAppState()`; for `--resume` it's the JSON-decoded previous snapshot from disk with a few fields re-derived.
- The `root` argument is an Ink `Root` — the terminal renderer.
- `renderAndRun` is passed in (not imported) because Ink's `Root` is created earlier and the entry passes a thin wrapper.

### 3.2 Launch — `replLauncher.tsx` glues `<App>` and `<REPL>` together

```tsx
// replLauncher.tsx:12-22
export async function launchRepl(root, appProps, replProps, renderAndRun) {
  const { App }  = await import('./components/App.js')
  const { REPL } = await import('./screens/REPL.js')
  await renderAndRun(root,
    <App {...appProps}>
      <REPL {...replProps} />
    </App>
  )
}
```

Lazy imports so the modules don't load until an interactive command is actually running. `<App>` is the chrome (status bar, header, indicators); `<REPL>` is the chat screen. The launcher doesn't know that `AppStateStore` exists — it just renders `<App>` and trusts it to set up whatever providers the children need.

### 3.3 Mount — `components/App.tsx` is where `<AppStateProvider>` is actually mounted

```tsx
// components/App.tsx:19-37 (recovered source)
export function App({ getFpsMetrics, stats, initialState, children }: Props): React.ReactNode {
  return (
    <FpsMetricsProvider getFpsMetrics={getFpsMetrics}>
      <StatsProvider store={stats}>
        <AppStateProvider initialState={initialState} onChangeAppState={onChangeAppState}>
          {children}
        </AppStateProvider>
      </StatsProvider>
    </FpsMetricsProvider>
  )
}
```

Layered providers, innermost first:

- `<AppStateProvider>` is the only place that creates a *live-session* `AppStateStore`. The other providers expose their own concerns (FPS metrics, statistics counters).
- `onChangeAppState` is imported directly from `state/onChangeAppState.ts`. Same reference for every launch.
- `initialState` is passed straight through from `main.tsx`.

This is the single mount site of `<AppStateProvider>` for the main interactive REPL. Other mount sites exist for doctor/setup-token/MCP-approval flows (`cli/handlers/util.tsx`, `cli/handlers/mcp.tsx`, `services/mcpServerApproval.tsx`, …) — each is its own short-lived provider with its own store.

### 3.4 Setup — `AppStateProvider`'s body actually runs

This is the same code shown in §2.3, but I'll restate it in lifecycle terms:

```tsx
export function AppStateProvider({ children, initialState, onChangeAppState }) {
  // STEP 1: refuse to nest.
  const hasAppStateContext = useContext(HasAppStateContext)
  if (hasAppStateContext) throw new Error('AppStateProvider can not be nested within another AppStateProvider')

  // STEP 2: build the mailbox ONCE. Subsequent renders reuse the same store.
  const [store] = useState(() => createStore(initialState ?? getDefaultAppState(), onChangeAppState))

  // STEP 3 (mount-time effect): recheck bypass-permissions mode.
  useEffect(() => { ... }, [])

  // STEP 4 (every render): wire external settings changes → store.setState.
  const onSettingsChange = useEffectEvent(source => applySettingsChange(source, store.setState))
  useSettingsChange(onSettingsChange)

  // STEP 5: publish via Context.
  return (
    <HasAppStateContext.Provider value={true}>
      <AppStoreContext.Provider value={store}>
        <MailboxProvider><VoiceProvider>{children}</VoiceProvider></MailboxProvider>
      </AppStoreContext.Provider>
    </HasAppStateContext.Provider>
  )
}
```

What each step really does, in plain terms:

- **Step 1.** `HasAppStateContext` is a *boolean* Context (`useContext(HasAppStateContext)` returns `true` while we're inside a provider). If true here, we're already nested and we throw — this is a defensive check that fires exactly once at the outer wrap.
- **Step 2.** `useState(() => createStore(...))` — React's `useState` initializer fires **only on the first render of this component**. After that, `store` keeps the *same* reference forever (until the provider unmounts). So even though `<AppStateProvider>` re-renders whenever its parent re-renders, the store is born exactly once.
- **Step 3.** The empty-deps `useEffect` runs once after the first commit. It checks a race condition: if the remote-managed-settings fetch finished *before* the React mount (and would have set the bypass-permissions flag once before any listeners were registered), this re-applies that decision now that subscribers exist.
- **Step 4.** `useSettingsChange` is a hook that listens for external settings-file changes (probably via fs.watch). When one comes in, it calls `store.setState` to merge the new settings into the store. `useEffectEvent` ensures the callback is stable across renders even though it closes over `store.setState` — that's React's official way to express "give me a stable callback that reads fresh props."
- **Step 5.** Wrap the children with two stacked Providers. The actual `<AppStoreContext.Provider value={store}>` is what makes `useAppStore()` work everywhere below.

### 3.5 Publication — Context delivers the store reference

When Step 5 commits, React records "the current value of `AppStoreContext` at this fiber is `store`." The *value* never changes during this provider's lifetime (because the store reference is stable), so React never has to re-render consumers because of a Context value change. This is not a module-level singleton: another root with another `<AppStateProvider>` gets another store.

When a descendant calls `useAppStore()`:

```tsx
const store = useContext(AppStoreContext)
```

…React walks up the fiber tree from the calling component, finds the nearest `<AppStoreContext.Provider>` ancestor, and returns its `value` prop — the same `store` for every call, for the whole life of the provider.

`HasAppStateContext` plays no role in delivering data. It's purely a "you're nested, abort" tripwire.

### 3.6 Subscription — components hook into changes via `useSyncExternalStore`

Inside any component below the provider, reads look like:

```tsx
// e.g. screens/REPL.tsx:618 — the actual line from the source
const toolPermissionContext = useAppState(s => s.toolPermissionContext)
```

Expanding the hook back to its source (from §2.3):

```tsx
const store = useAppStore()
const get = () => selector(store.getState())
const value = useSyncExternalStore(store.subscribe, get, get)
```

What happens under the hood:

- React stores `get` as "this hook instance's `getSnapshot`."
- React calls `store.subscribe(reactInternal_onStoreChange)`, which adds a listener to the store.
- This hook instance now has one subscription. Another `useAppState(s => s.verbose)` call—whether in this component or another one—creates a second subscription.

Every subscription receives the same store broadcast. Their separate `get` closures produce separate selected snapshots, allowing React to ignore notifications whose selected result did not change.

### 3.7 Mutation — the spread-and-replace pattern

Every `setAppState` call looks the same: receive previous state, return a new object that copies everything except the field being changed. Three real examples from `screens/REPL.tsx`:

```tsx
// REPL.tsx:2345-2360 — a named setter for tool permission context
const setToolPermissionContext = useCallback((context, options) => {
  setAppState(prev => ({
    ...prev,
    toolPermissionContext: {
      ...context,
      mode: options?.preserveMode ? prev.toolPermissionContext.mode : context.mode,
    },
  }))
}, [setAppState])

// REPL.tsx:2711-2726 — direct store.setState with a "same value? skip" check
store.setState(prev => {
  const cur = prev.toolPermissionContext.alwaysAllowRules.command
  if (cur === additionalAllowedTools || ...) return prev   // bail early
  return {
    ...prev,
    toolPermissionContext: {
      ...prev.toolPermissionContext,
      alwaysAllowRules: {
        ...prev.toolPermissionContext.alwaysAllowRules,
        command: additionalAllowedTools,
      },
    },
  }
})

// state/teammateViewHelpers.ts:46-81 — a pre-built updater
export function enterTeammateView(taskId, setAppState): void {
  logEvent('tengu_transcript_view_enter', {})
  setAppState(prev => {
    const task = prev.tasks[taskId]
    const prevId = prev.viewingAgentTaskId
    const prevTask = prevId !== undefined ? prev.tasks[prevId] : undefined
    const switching = prevId !== undefined && prevId !== taskId && isLocalAgent(prevTask) && prevTask.retain
    const needsRetain = isLocalAgent(task) && (!task.retain || task.evictAfter !== undefined)
    const needsView = prev.viewingAgentTaskId !== taskId || prev.viewSelectionMode !== 'viewing-agent'
    if (!needsRetain && !needsView && !switching) return prev     // no change → bail
    let tasks = prev.tasks
    if (switching || needsRetain) {
      tasks = { ...prev.tasks }
      if (switching) tasks[prevId] = release(prevTask)
      if (needsRetain) tasks[taskId] = { ...task, retain: true, evictAfter: undefined }
    }
    return { ...prev, viewingAgentTaskId: taskId, viewSelectionMode: 'viewing-agent', tasks }
  })
}
```

Two patterns to internalise:

1. **All-or-nothing replacement.** Each `setState` callback returns a *new* object. Even if you only changed a deeply-nested field, every level of nesting above it gets a new object reference. This is the cost of `Object.is` bail-outs and react-bail render-skipping — but you get the savings when *no* change is needed.
2. **Bail-out returns.** Returning `prev` (same reference) skips both the `onChange` call *and* the listener notification. That's how the `enterTeammateView` example above avoids waking subscribers when no real change happened. The pattern matters: even `setAppState(prev => prev)` with explicit reads is no-op safe, because `store.ts`'s `Object.is(next, prev)` catches it at the top of `setState` anyway.

### 3.8 Notification — listeners fire, React checks snapshots

Inside `store.setState`:

```ts
state = next                                       // ① commit the new value
onChange?.({ newState: next, oldState: prev })     // ② side-effects (e.g. onChangeAppState)
for (const listener of listeners) listener()       // ③ notify each subscriber
```

What each `listener` actually is:

- Each `useAppState(s => s.x)` hook instance registers a React callback. The callback tells React to check that hook's current selected snapshot.
- The store calls every registered callback after every successful state change. It neither stores selectors nor compares slices.
- Multiple hook instances with the same selector each have their own listener. A component with multiple `useAppState` calls has multiple listeners.
- If only `verbose` changes, a listener selecting `toolPermissionContext` is still called. React runs its `getSnapshot`, finds the same object via `Object.is`, and does not schedule a render from that subscription.

Important ordering: **side-effects (②) run before listeners (③).** So `onChangeAppState` writes settings files, clears caches, notifies the cloud, etc. *before* any React component sees the new state. This means that by the time React re-renders, the persisted state and the in-memory state agree.

### 3.9 Re-render — `useSyncExternalStore` reads fresh, React bails if same

For each listener notification:

1. React calls that hook instance's `getSnapshot` (`get` in `useAppState`).
2. `get()` reads `store.getState()` and runs the selector.
3. React compares the selected result with that hook's previous snapshot via `Object.is`.
4. If it is the same, no render is scheduled by this subscription. The component does not first need to re-run to discover that the slice is unchanged.
5. If it differs, React schedules the component. During the render React calls the component top-to-bottom and reads its external-store snapshots again.
6. The React reconciler diffs the new tree against the old and tells the renderer (Ink) to redraw only the changed parts.

Steps 1–4 are the "only re-render if your slice actually changed" behavior. Step 6 is how the screen updates without anyone having to call `screen.draw()` themselves.

### 3.10 Death — provider unmounts, store disappears

The lifespan of the store is the lifespan of `<AppStateProvider>`:

- **Provider unmounts** when its parent stops rendering it (e.g. the `<App>` component itself unmounts, or `root.unmount()` is called).
- **During unmount**, React walks the tree, calling cleanup functions: `useEffect(() => () => clearInterval(...), [])` runs its cleanup, `useSyncExternalStore`'s unsubscribe runs.
- The unsubscribe removes every `useAppState` listener from the store's `listeners` Set. After unmount, the Set is empty.
- The `let state` closure inside `createStore` becomes garbage. The store object becomes garbage. The mailbox is gone.
- For the main REPL this happens when the user types `/exit` (Ink's `useApp().exit()` resolves `waitUntilExit`, then `renderAndRun`'s finally block unmounts the root and process exits).
- For doctor/setup-token flows, it happens after `process.exit(0)` (line 48 of `cli/handlers/util.tsx`).

---

## Part 4: Worked example — the `toolPermissionContext` lifecycle end-to-end

Let's pick one field and trace every step it goes through when the user Shift+Tab-cycles the permission mode.

**Setup.** In `screens/REPL.tsx`:

```tsx
// REPL.tsx:618
const toolPermissionContext = useAppState(s => s.toolPermissionContext)
```

This hook subscribes to the whole store's broadcast but exposes `toolPermissionContext` as its snapshot. Whenever that object's reference changes, this subscription causes `<REPL />` to re-render. If another field changes while this reference remains identical, React's snapshot comparison skips a render from this subscription.

**Read sites inside `<REPL>`** (a few examples from §2.3 of the parts I've already covered in this conversation):

- `REPL.tsx:696` — `getTools(toolPermissionContext)` recomputes the available local tools whenever mode changes.
- `REPL.tsx:811` — `useMergedTools(...)` merges tool lists taking the mode into account.
- `REPL.tsx:1617` — a guard `if (toolPermissionContext.mode !== 'auto') return` in a `useEffect`, which resets the "auto mode warning already shown" flag on non-auto modes.
- `REPL.tsx:2770` — passed to `checkAndDisableBypassPermissionsIfNeeded(...)`.

**Write site.** The chat input component shifts the mode. It calls back up to `<REPL>`'s `setToolPermissionContext` setter (defined `REPL.tsx:2345`), which calls `setAppState(prev => ({...prev, toolPermissionContext: {...}}))` — this goes through React's `useSetAppState()`-exposed `setState` function (which is the same function as `store.setState`).

**Trace.** When the user presses Shift+Tab:

1. The keystroke handler calls `setToolPermissionContext(newContext, { preserveMode: false })`.
2. `setAppState` → `store.setState(prev => next)`.
3. `store.setState` computes `next = updater(prev)`. It's a new object (spread `...prev`), so `Object.is(next, prev)` is false.
4. `store.setState` does `state = next`.
5. `store.setState` calls `onChange?.({ newState: next, oldState: prev })` — that's `onChangeAppState` from `state/onChangeAppState.ts`.
   - `prevMode` ≠ `newMode` → the `permission_mode` block runs.
   - `notifySessionMetadataChanged(...)` writes to the cloud dashboard.
   - `notifyPermissionModeChanged(...)` notifies the SDK stream.
6. `store.setState` walks `listeners` and calls every one, including listeners whose selectors read unrelated fields such as `tasks`.
7. Each React listener calls its hook instance's `getSnapshot`. The `<REPL>` hook selects the new `toolPermissionContext` object, which is not `Object.is`-equal to its previous snapshot, so React schedules `<REPL>`.
8. A hook selecting the unchanged `tasks` object also checks its snapshot, but React does not schedule a render from that subscription.
9. React runs `<REPL>` again, top to bottom. Line 618's `useAppState` reads the new selected value.
10. React re-renders `<REPL>`'s JSX with the new value. Lines 696/811/1617/2770 all see the new mode and behave accordingly. Descendants receiving changed props update through normal React reconciliation; components with their own `useAppState` calls perform their own snapshot comparisons.

**Unchanged observers:** components selecting `tasks` are notified at the store level, but their selected snapshot remains equal, so those subscriptions do not cause renders.

**Snapshot consistency:** every `useAppState` call has its own snapshot function. React rechecks those external-store snapshots around rendering and retries when necessary rather than relying on one slice-aware store subscription.

---

## Part 5: Recovered TSX and provenance

The affected TSX files under `restored-src/` are now readable recovered
TypeScript/TSX. In particular, `state/AppState.tsx` no longer contains React Compiler cache
machinery such as `_c(...)`, `$[...]`, or
`react.memo_cache_sentinel`. Read that file directly; the examples in this
guide are excerpts or abridgements of the recovered source.

Why older notes showed compiler output:

1. The first reconstruction pass used the outer `package/cli.js.map`.
2. Some outer `sourcesContent` entries were themselves React Compiler output
   with inline nested source maps.
3. The nested recovery pass decoded those maps and replaced 552 destinations
   under `restored-src/` with their embedded readable sources. Of those, 395
   outer entries contained React Compiler output; none of their current nested
   candidates retains the cache machinery.

`state/AppState.tsx` was one of those destinations. It was initially skipped
because it had a manual post-recovery edit, then restored after explicit
overwrite approval. Its recovered generic signatures now include
`useAppState<T>` and `useAppStateMaybeOutsideOfProvider<T>`.

This is still an unofficial recovery from released source-map evidence. The
readable files and their paths are useful for research, but are not
authoritative upstream source truth. For the audit procedure, safety rules,
counts, hashes, and manifest format, see
[`NESTED_SOURCE_MAP_RECOVERY.md`](NESTED_SOURCE_MAP_RECOVERY.md) and
`restored-src/source-recovery-manifest.json`. The released `package/cli.js`
and `package/cli.js.map` remain unchanged; inspect those artifacts only when
you specifically need the compiled representation.

---

## Part 6: Quick reference

### 6.1 Where to look

| Question | File | Line |
|---|---|---|
| What does the `Store<T>` interface look like? | `state/store.ts` | 4–8 |
| Where is `createStore` defined? | `state/store.ts` | 10–34 |
| What's in `AppState`? | `state/AppStateStore.ts` | 89–452 |
| Where does a blank `AppState` come from? | `state/AppStateStore.ts` | 456–569 |
| Where are the two Contexts declared? | `state/AppState.tsx` | 47, 55 |
| Where is `<AppStateProvider>` defined? | `state/AppState.tsx` | 57–121 |
| Where is `useAppState` defined? | `state/AppState.tsx` | 150–167 |
| Where is `useSetAppState`? | `state/AppState.tsx` | 174–178 |
| Where is `useAppStateMaybeOutsideOfProvider`? | `state/AppState.tsx` | 193–200 |
| What side effects run on every `setState`? | `state/onChangeAppState.ts` | 43–171 |
| Where is the `<AppStateProvider>` mounted for the main session? | `components/App.tsx` | 28 |
| Where does the initial state come from? | `main.tsx:3134` (one of 6 sites) | — |
| Where is the renderer (`renderAndRun`)? | `interactiveHelpers.tsx:98` | — |
| Where is `<REPL>` reading toolPermissionContext? | `screens/REPL.tsx:618` | — |
| Where is the toolPermissionContext writer? | `screens/REPL.tsx:2345–2360` | — |

### 6.2 Translation cheatsheet

| If you see… | It means… |
|---|---|
| `useState(() => createStore(...))` | Build the mailbox on first render, keep it stable forever. |
| `createContext<X \| null>(null)` | A tag that descendants read. `null` = "no provider in scope." |
| `<MyContext.Provider value={X}>` | Publish `X` to all descendants. |
| `useContext(MyContext)` | Walks up the fiber tree to find the nearest provider; returns its `value`. |
| `Object.is(a, b)` | The bail-out primitive for immutable updates. Same value = skip notification. |
| `setState(prev => ({ ...prev, field: newField }))` | Immutable update — return a new object even if most fields are unchanged. |
| `return prev` (from a `setState` updater) | The "nothing actually changed" bail — saves the `onChange` call and the listener pass. |
| `useSyncExternalStore(subscribe, get, get)` | Subscribe to the store's broadcast and let React compare this hook instance's selected snapshot. |
| `_c(13)` and `$[n]` in a released artifact | React Compiler memo cache. The affected `restored-src/` files have been recovered; see Part 5. |
| `feature('FOO')` | Bun's build-time flag. The chosen branch is the only one in the bundle. |
| `if (false && expr)` / `{"external" === 'ant' && ...}` | Build-time guard, kept in source as a clue. Usually dead in the bundle you have. |

### 6.3 The 5 phases of a state change

1. **Write.** `setAppState(prev => next)` (or `store.setState(prev => next)`).
2. **Compare.** `Object.is(next, prev)` — bail if no change.
3. **Commit.** `state = next` inside the mailbox closure.
4. **Side-effects.** `onChangeAppState({ newState, oldState })` — persistence + cloud sync + cache invalidation.
5. **Notify.** Walk every listener; each `useSyncExternalStore` listener checks its own selected snapshot and schedules its component only if that result changed.

Then React re-renders the components with changed selected snapshots, each `useAppState` re-reads via its `get()`, and the reconciler patches the renderer (Ink) only where needed.

---

## Part 7: Where to read next in the repo

- **`restored-src/src/state/store.ts`** — the entire `Store<T>` interface in 34 lines. Read this first; everything else builds on it.
- **`restored-src/src/state/AppStateStore.ts`** — the full `AppState` type. Skim the structure; it's long because the app's UI is huge.
- **`restored-src/src/state/AppState.tsx`** — the readable recovered React glue. Part 5 explains its source-map provenance.
- **`restored-src/src/state/onChangeAppState.ts`** — what *every* state mutation triggers, in detail. Read the comments — they explain why each block exists.
- **`restored-src/src/components/App.tsx`** — the single mount site for the live-session `<AppStateProvider>`.
- **`restored-src/src/replLauncher.tsx`** — the 22-line function that wires `<App>` to `<REPL>` and mounts them on Ink.
- **`restored-src/src/main.tsx:3134`** — one of six `launchRepl` sites; this one shows how a resumed session threads the loaded state into the chain.
- **`restored-src/src/interactiveHelpers.tsx:98`** — `renderAndRun`: the actual mount point. Calls `root.render(...)`, then `waitUntilExit()`.
- **`restored-src/src/screens/REPL.tsx:618`** — the canonical reader (a `useAppState` call); `REPL.tsx:2345` is the canonical writer.
- **`docs/REACT_BASIC.md`** — the companion doc: components, rendering phases, JSX, Ink primitives. Useful if you're new to React entirely.
- **`docs/COMMANDER_REACT_INK_BRIEF.md`** — the previous primer, focused on how `main.tsx` becomes a rendered tree. The setup story ends right where this doc begins.
