# Conversation and Transcript Lifecycle

This document explains how the recovered `@anthropic-ai/claude-code` 2.1.88
workspace manages streaming model output, temporary UI state, durable
conversation messages, model-facing context, and persisted transcripts.

This is an unofficial recovered repository. The names and paths below describe
this artifact and should not be presented as authoritative Anthropic source
structure.

## 1. The central idea: several views of one conversation

The implementation does not use one message array for every purpose. It derives
separate views with different guarantees:

```text
Raw API SSE events
        |
        v
queryModel stream reducer
        |
        +--------------------> stream_event
        |                       temporary/live UI
        |
        +--------------------> completed Message
                                durable REPL state
                                      |
                     +----------------+----------------+
                     |                                 |
                     v                                 v
             model-facing projection          transcript projection
             normalize/compact/budget          clean/dedupe/persist
                     |                                 |
                     v                                 v
             next API request                  session JSONL log
```

The practical rule is:

- Display partial output through temporary React state.
- Add only completed semantic blocks to durable conversation state.
- Derive a compact, API-valid projection for the next model request.
- Persist a cleaned, UUID-linked session event log for resume and history.

## 2. Message layers

### 2.1 Raw stream events

The API emits message-level and content-block-level events:

```text
message_start
  content_block_start(index=0)
  content_block_delta(index=0)
  content_block_stop(index=0)
message_delta
message_stop
```

Message events describe the outer response and its usage/stop metadata.
Content-block events construct individual `text`, `thinking`, or `tool_use`
items in the response's `content` array.

`queryModel` in `src/services/api/claude.ts` accumulates these events. It emits
two views:

1. Every raw event is wrapped as a `StreamEvent` for immediate consumers.
2. A normalized `AssistantMessage` is emitted only when a content block stops.

```ts
yield {
  type: 'stream_event',
  event: part,
}
```

Waiting for `content_block_stop` prevents partial text or incomplete tool JSON
from entering durable conversation processing. A tool input such as
`{"path":"/tmp/a"}` may arrive in fragments and is not safe to parse or execute
until its block is complete.

### 2.2 Temporary UI state

The REPL owns state used only while output is streaming, including:

```ts
streamingText: string | null
streamingToolUses: StreamingToolUse[]
streamMode: SpinnerMode
streamingThinking: StreamingThinking | null
```

`handleMessageFromStream` in `src/utils/messages.ts` routes raw events into
these setters. For example:

- `text_delta` appends to `streamingText`.
- `content_block_start` for `tool_use` adds a `StreamingToolUse`.
- `input_json_delta` appends to its `unparsedToolInput`.
- message/block events update spinner mode.

A state setter schedules a React render. `REPL.tsx` then passes the new state to
`Messages.tsx`, and Ink updates the terminal UI.

Streaming tool calls are rendered by wrapping their blocks in synthetic
assistant messages:

```text
StreamingToolUse
    -> synthetic AssistantMessage
    -> MessageRow
    -> Message
    -> AssistantMessageBlock
    -> AssistantToolUseMessage
```

When the real completed assistant message appears, `Messages.tsx` recognizes
the same `tool_use.id` and filters out the synthetic version. This avoids a
duplicate row.

Temporary stream state is not the transcript. Raw deltas can cause UI renders
without changing the durable `messages` array.

### 2.3 Durable in-memory conversation

Completed messages pass through `handleMessageFromStream`'s `onMessage`
callback and are appended by the REPL:

```ts
setMessages(oldMessages => [...oldMessages, newMessage])
```

This `Message[]` is the main in-memory session history. It can contain more
than model turns:

- user and assistant messages
- tool calls and tool results
- attachments and system notices
- compact boundaries
- hook output and other UI/session records

Raw `stream_event` values are not appended to it. The array supplies both the
rendered history and the source from which later model context is projected.

## 3. The agentic query loop

Production dependency wiring maps `deps.callModel` to
`queryModelWithStreaming`. `queryLoop` consumes it with:

```ts
for await (const message of deps.callModel(...)) {
  // forward events, retain completed messages, and detect tool calls
}
```

The yielded types receive different treatment:

| Yielded value | `queryLoop` behavior |
|---|---|
| `stream_event` | Forward immediately; do not retain as conversation state |
| `AssistantMessage` | Forward, retain, inspect for `tool_use` blocks |
| retry/system message | Forward as status information |
| assistant API error | Expose or temporarily withhold for recovery |
| `FallbackTriggeredError` | Switch model and retry the request |

When an assistant message contains a completed `tool_use`, `queryLoop` records
the block and starts tool execution. With streaming tool execution, tool work
can overlap continued model generation:

```text
content_block_stop(tool_use)
        |
        v
AssistantMessage yielded
        |
        v
queryLoop starts tool --------+
        |                      |
model keeps streaming         |
        |                      |
        +---- collect result <-+
```

Tool output becomes a user-role `tool_result`. The following model iteration
receives the prior assistant `tool_use` followed by its user `tool_result`.

## 4. Building model-facing messages

At the beginning of an iteration, `queryLoop` creates a working context:

```ts
let messagesForQuery = [...getMessagesAfterCompactBoundary(messages)]
```

This is a new array, allowing request-side transformations without replacing
the REPL's durable history. The working context can pass through:

```text
active history after compact boundary
    -> aggregate tool-result budget
    -> history snip
    -> microcompact
    -> context-collapse projection
    -> full autocompaction when required
    -> messagesForQuery
```

Inside `queryModel`, `normalizeMessagesForAPI` creates the final API-compatible
user/assistant sequence. It performs work such as:

- removing virtual and display-only messages
- removing progress and ordinary local system messages
- removing synthetic API errors
- converting relevant local-command output to user content
- reordering attachments
- merging consecutive user messages
- preserving and repairing tool-use/tool-result pairing
- removing unsupported tool-search or advisor content

The API therefore receives `messagesForAPI`, not the REPL message array and not
the transcript file verbatim.

## 5. Prompt-cache-safe mutation rules

Content that will be sent back to the API is kept stable where possible.
Changing semantically equivalent fields can still change serialized bytes and
break prompt-cache reuse.

For example, `queryLoop` may add observable fields to a presentation copy of a
tool call. It yields the clone but retains the original for later API use:

```text
original AssistantMessage
    +-> presentation clone -> UI/SDK
    +-> unchanged original -> next model request
```

One intentional mutation occurs when final `usage` and `stop_reason` arrive in
`message_delta`, after the content block was already yielded. `queryModel`
mutates those metadata properties on the previously yielded object so consumers
and delayed transcript serialization observe the final values.

## 6. Tool-result budgeting

`applyToolResultBudget` limits aggregate tool-result content sent to the model.
For selected large results it:

1. Persists the full result through tool-result storage.
2. Creates a stable preview/reference string.
3. Clones the affected message and block with that replacement.
4. Returns the cloned `messagesForQuery` projection.
5. Records the replacement decision for resume.

It does not mutate the original transcript message:

```text
durable REPL/transcript message
    tool_result.content = full original

model-facing messagesForQuery
    tool_result.content = preview/reference

transcript side record
    toolUseId -> exact replacement string
```

Decisions are frozen by `tool_use_id`. Previously replaced results get the
same byte-identical string on every later request. Previously retained results
are not suddenly replaced on a later turn. This maintains prompt-cache
stability.

## 7. How transcript recording is invoked

`REPL.tsx` calls the React hook:

```ts
useLogMessages(messages, messages.length === initialMessages?.length)
```

The hook registers a `useEffect` whose dependencies include `messages`.
Completed message flow is therefore:

```text
query() yields completed Message
    -> onQueryEvent
    -> handleMessageFromStream
    -> onMessage
    -> setMessages(new array)
    -> React commits REPL render
    -> useLogMessages effect runs
    -> recordTranscript(...)
```

Raw streaming deltas update other state, so they normally do not trigger this
effect through the `messages` dependency.

For an ordinary append, `useLogMessages` records only the new tail. It tracks
the previous length and parent UUID in refs. A changed first UUID indicates a
rebuild such as compaction or `/clear`, which requires a full deduplicating
pass. Initial restored messages can be ignored because they already exist on
disk.

Transcript persistence is fire-and-forget from the UI's perspective, so disk
I/O does not block rendering.

## 8. Persisted transcript structure

The transcript is a JSONL session event log: each line is an independent JSON
object. It is not a single JSON array.

Two broad entry families are interleaved:

```text
session.jsonl
|-- conversation-chain entries
|   |-- user
|   |-- assistant
|   |-- attachment
|   `-- system
|
`-- auxiliary session entries
    |-- content-replacement
    |-- summary / title / tag / last-prompt
    |-- file-history and attribution snapshots
    |-- queue operations
    |-- worktree state
    `-- context-collapse commits and snapshots
```

### 8.1 Conversation entries

A transcript message combines the application message with persistence fields:

```ts
type TranscriptMessage = Message & {
  parentUuid: UUID | null
  logicalParentUuid?: UUID | null
  isSidechain: boolean
  sessionId: string
  cwd: string
  userType: string
  entrypoint?: string
  timestamp: string
  version: string
  gitBranch?: string
  slug?: string
  agentId?: string
  teamName?: string
  agentName?: string
  promptId?: string
}
```

Ordinary messages form a parent-linked chain:

```text
user u1 (parent=null)
    -> assistant a1 (parent=u1)
        -> tool result u2 (parent=a1)
            -> assistant a2 (parent=u2)
```

The chain supports resume, rewind, branching, and leaf selection. Tool results
may also carry `sourceToolAssistantUUID`, explicitly tying them to the
assistant message that initiated the call.

### 8.2 Example JSONL

The following objects are simplified but show the relationships:

```jsonl
{"type":"user","uuid":"u1","parentUuid":null,"message":{"role":"user","content":[{"type":"text","text":"Read config.ts"}]},"sessionId":"s1","isSidechain":false,"timestamp":"..."}
{"type":"assistant","uuid":"a1","parentUuid":"u1","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"config.ts"}}]},"sessionId":"s1","isSidechain":false,"timestamp":"..."}
{"type":"user","uuid":"u2","parentUuid":"a1","sourceToolAssistantUUID":"a1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"<full contents>"}]},"sessionId":"s1","isSidechain":false,"timestamp":"..."}
{"type":"content-replacement","sessionId":"s1","replacements":[{"kind":"tool-result","toolUseId":"toolu_1","replacement":"Stored result preview..."}]}
{"type":"assistant","uuid":"a2","parentUuid":"u2","message":{"role":"assistant","content":[{"type":"text","text":"The configuration enables..."}]},"sessionId":"s1","isSidechain":false,"timestamp":"..."}
```

The `content-replacement` entry does not replace or rewrite the earlier JSONL
message. It records the exact alternate representation the model saw.

### 8.3 Compaction boundaries

A compact boundary starts a new physical chain by setting `parentUuid` to
`null`, while `logicalParentUuid` can preserve its relationship to the old
chain:

```text
old: u1 -> a1 -> ... -> a20
                         |
                         | logicalParentUuid
                         v
new:                  boundary -> summary -> next message
                      parent=null
```

This keeps pre-compaction history available for transcript/history purposes
without sending the entire chain to the model again.

Context collapse can instead store a side record containing archived UUID
boundaries and summary content. The original messages already exist in the
transcript; the side record is enough to reconstruct the model-facing splice.

### 8.4 Sidechains

Agent messages use `isSidechain: true` and an `agentId`. They can be routed to
a separate agent transcript file. Content-replacement entries carrying that
agent ID follow the sidechain so AgentTool resume reconstructs identical
replacement decisions.

## 9. Failure and correction behavior

If a partial streaming attempt is discarded during streaming-to-non-streaming
fallback, `queryLoop` yields tombstones for orphaned assistant messages. The
REPL removes those messages from state, and `removeTranscriptMessage` removes
their persisted records. Pending tool execution from the failed attempt is also
discarded to prevent orphan tool results.

Most API failures are converted into synthetic assistant/system messages.
Recoverable errors may be withheld temporarily while compaction, truncation, or
retry logic attempts recovery.

## 10. Key source files and call sites

| Concern | File and call site |
|---|---|
| Streaming request and event reducer | `restored-src/src/services/api/claude.ts`, `queryModel` near line 1017 |
| Raw event emission | `claude.ts`, stream loop near line 2300 |
| Retry generator | `restored-src/src/services/api/withRetry.ts`, `withRetry` near line 170 |
| Agentic consumption | `restored-src/src/query.ts`, `deps.callModel` loop near line 659 |
| Model-context projection | `query.ts`, `messagesForQuery` near line 365 |
| Tool-result budget integration | `query.ts` near line 379 |
| API message normalization | `restored-src/src/utils/messages.ts`, `normalizeMessagesForAPI` near line 1989 |
| Stream-to-UI routing | `utils/messages.ts`, `handleMessageFromStream` near line 2930 |
| REPL event callback | `restored-src/src/screens/REPL.tsx`, `onQueryEvent` near line 2584 |
| Transcript hook call | `REPL.tsx`, `useLogMessages` near line 3829 |
| Transcript hook | `restored-src/src/hooks/useLogMessages.ts` |
| Transcript cleaning/deduplication | `restored-src/src/utils/sessionStorage.ts`, `recordTranscript` near line 1408 |
| Parent-chain serialization | `sessionStorage.ts`, `insertMessageChain` near line 993 |
| JSONL entry dispatch | `sessionStorage.ts`, `appendEntry` near line 1128 |
| Transcript schemas | `restored-src/src/types/logs.ts` |
| Immutable result replacement | `restored-src/src/utils/toolResultStorage.ts`, `replaceToolResultContents` near line 700 |
| Budget enforcement | `toolResultStorage.ts`, `enforceToolResultBudget` near line 769 |
| Streaming tool rendering | `restored-src/src/components/Messages.tsx` near line 443 and `Message.tsx` near line 483 |

## 11. Compact mental model

```text
queryModel
  = API request builder
  + retrying transport
  + SSE state reducer
  + completed-message producer

queryLoop
  = model-event consumer
  + tool orchestrator
  + context/recovery loop

REPL + React state
  = temporary streaming display
  + durable in-memory conversation

normalizeMessagesForAPI
  = conversation-to-model projection

useLogMessages + sessionStorage
  = conversation-to-persisted-event-log projection
```

The implementation preserves responsiveness by rendering raw deltas, safety by
acting only on completed content blocks, context efficiency by projecting and
compacting model messages, and resumability by retaining a richer UUID-linked
transcript with auxiliary reconstruction records.
