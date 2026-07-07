# Message Data Design — Investigation Notes

This document synthesizes two investigations of the message model: the overall data design (top-level `Message` union, side-channel variants, normalization pipeline) and the concrete nested types inside `AssistantMessage` / `UserMessage` (especially the `BetaContentBlock` / `ContentBlockParam` taxonomy).

The investigation worked from three source files:

- `restored-src/src/types/message.d.ts` — the recovered internal type declarations (permissive editor stub, see "Caveats" at the bottom).
- `restored-src/src/utils/messages.ts` — constructors (`createUserMessage`, `createAssistantMessage`, `createAssistantAPIErrorMessage`, `normalizeMessagesForAPI`, …).
- `restored-src/types/npm/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts` — the SDK declarations that supply `BetaMessage`, `BetaContentBlock`, `BetaContentBlockParam`, `BetaUsage`, etc.

You should read it top-to-bottom. Part 1 is the top-level shape, Part 2 is `AssistantMessage`, Part 3 is `UserMessage`, Part 4 is the side-channel variants, Part 5 is the block taxonomy (the most concrete nested types), Part 6 is the pairing/visibility rules that glue everything together, Part 7 is the normalization pipeline that translates stored → wire, and Part 8 lists what was not directly visible in the recovered source.

---

## Part 1: Top-Level `Message` Union

```ts
// recovered from restored-src/src/types/message.d.ts
type MessageBase = { uuid: UUID; timestamp: string }

export type Message =
  | AssistantMessage
  | UserMessage
  | AttachmentMessage
  | ProgressMessage
  | SystemMessage
```

Five variants, discriminated on `type`. Every variant inherits `{ uuid, timestamp }` from `MessageBase`. The discriminator is exhausted through normal TypeScript narrowing.

### Why a union of five (not one shape with optional fields)?

- **Different lifecycles.** `AssistantMessage` carries a full SDK response; `ProgressMessage` is a transient UI delta; `SystemMessage` is meta with subtype-specific junk.
- **Different transport rules.** `AssistantMessage` and `UserMessage` are sent to the API; `AttachmentMessage` may be either, may be neither, may be re-ordered via `reorderAttachmentsForAPI`.
- **Different pairing semantics.** `tool_use` ↔ `tool_result` only exists between `AssistantMessage` and `UserMessage`.

### The base `MessageBase`

```ts
{ uuid: UUID; timestamp: string }
```

`uuid` is required on every message. It is the join key for tool pairing (alongside the wire-level `tool_use_id` on the content blocks), the source for `deriveShortMessageId` / `[id:...]` tags used by the snip tool, and the stability anchor across API calls.

### Variant at a glance

| Variant | `type` | Stored? | Sent to API? | UI? |
|---|---|---|---|---|
| `AssistantMessage` | `'assistant'` | yes | yes (after normalize) | yes |
| `UserMessage` | `'user'` | yes | yes (after normalize) | yes |
| `AttachmentMessage<A>` | `'attachment'` | yes | depends on attachment | yes |
| `ProgressMessage<P>` | `'progress'` | no | no | transient |
| `SystemMessage` | `'system'` | yes | filtered except `local_command` | yes |

The last three columns are what `normalizeMessagesForAPI` and the visibility flags decide per-message.

---

## Part 2: `AssistantMessage`

`AssistantMessage` wraps an SDK `BetaMessage` (with `diagnostics` / `stop_details` made optional for compat) plus Claude-Code-specific metadata.

```ts
export type AssistantMessagePayload =
  Omit<BetaMessage, 'diagnostics' | 'stop_details'> &
    Partial<Pick<BetaMessage, 'diagnostics' | 'stop_details'>>

export type AssistantMessage = MessageBase & {
  type: 'assistant'
  message: AssistantMessagePayload
  requestId?: string
  apiError?: 'max_output_tokens' | string
  error?: string
  errorDetails?: string
  isApiErrorMessage?: boolean
  isMeta?: true
  isVirtual?: true
  research?: unknown
  advisorModel?: string
}
```

### The SDK `BetaMessage` (wrapped by `message`)

```ts
{
  id: string                              // 'msg_...'
  container: BetaContainer | null         // code-execution container
  content: BetaContentBlock[]             // ← the meat (see Part 5)
  context_management: BetaContextManagementResponse | null
  model: Model                            // 'claude-opus-4-6' etc.
  role: 'assistant'
  stop_reason: BetaStopReason | null      // see below
  stop_sequence: string | null
  type: 'message'
  usage: BetaUsage                        // see below
}
```

`stop_reason` is one of `'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'compaction' | 'refusal' | 'model_context_window_exceeded'`. The code comment is explicit that `'tool_use'` is unreliable — `isToolUseRequestMessage` checks content blocks directly, not `stop_reason`.

### `BetaUsage` (token accounting)

```ts
{
  cache_creation: { ephemeral_1h_input_tokens, ephemeral_5m_input_tokens } | null
  cache_creation_input_tokens: number | null
  cache_read_input_tokens: number | null
  inference_geo: string | null
  input_tokens: number                     // not cached
  iterations: BetaIterationsUsage | null   // per-iteration breakdown (server tool loops, advisor, etc.)
  output_tokens: number
  output_tokens_details: { thinking_tokens } | null
  server_tool_use: { web_search_requests, web_fetch_requests } | null
  service_tier: 'standard' | 'priority' | 'batch' | null
  speed: 'standard' | 'fast' | null
}
```

`baseCreateAssistantMessage` in `messages.ts:362-376` defaults every field to zero / null. So a `createAssistantAPIErrorMessage` (synthetic error) carries an all-zero usage — useful because callers can rely on `usage.input_tokens` being defined, not `undefined`.

### Synthetic-message flags

These four flags drive how the message is treated downstream:

| Flag | Sent to API? | UI visible? | When set |
|---|---|---|---|
| `isApiErrorMessage: true` | No | Yes | `createAssistantAPIErrorMessage` output. Triggers skip-stop-hooks and surface. |
| `isMeta: true` | Yes | No | System reminders, recovery nudges, "max_output_tokens — resume directly" injections. |
| `isVirtual: true` | No | Yes | REPL inner tool calls that should render but not pollute API history. |
| `apiError: 'max_output_tokens'` | n/a | Yes | Marks a withheld max_output_tokens; drives `isWithheldMaxOutputTokens` predicate (see `query.ts:175`). |

`error` / `errorDetails` are populated from `SDKAssistantMessageError` by `createAssistantAPIErrorMessage` for the error renderer. `requestId` is the originating API request id. `research` / `advisorModel` are extras populated only in research-mode flows.

---

## Part 3: `UserMessage`

```ts
export type UserMessage = MessageBase & {
  type: 'user'
  message: {
    role: 'user'
    content: string | ContentBlockParam[]   // string ≡ [{ type: 'text', text }]
  }
  isMeta?: true
  isVisibleInTranscriptOnly?: true
  isVirtual?: true
  isCompactSummary?: true
  toolUseResult?: unknown
  mcpMeta?: { _meta?: Record<string, unknown>; structuredContent?: Record<string, unknown> }
  imagePasteIds?: number[]
  sourceToolAssistantUUID?: UUID
  sourceToolUseID?: string
  permissionMode?: string
  summarizeMetadata?: {
    messagesSummarized: number
    userContext?: string
    direction?: 'from' | 'up_to'
  }
  origin?: MessageOrigin
  planContent?: string
}

export type MessageOrigin =
  | { kind: 'human' }
  | { kind: 'task-notification' }
  | { kind: 'coordinator' }
  | { kind: 'channel'; server: string }
```

### `message.content` — string or `ContentBlockParam[]`

When the user message is simple text, content is a string. Otherwise it's an array of block variants (see Part 5). The string form is shorthand for `[{ type: 'text', text }]`.

### `toolUseResult` — the dual representation

```ts
toolUseResult?: unknown  // Matches tool's `Output` type
```

`toolUseResult` is the *typed* tool output (the in-process tool's return value), kept in parallel with `message.content` (which is the wire-shape). The UI uses `toolUseResult` for rich rendering; the API uses `message.content`. This is the dual-representation pattern that lets the same message look good in the REPL and be wire-correct at the same time.

### `mcpMeta` — out-of-band SDK channel

```ts
mcpMeta?: {
  _meta?: Record<string, unknown>            // MCP-protocol `_meta` pass-through
  structuredContent?: Record<string, unknown>  // MCP structured content
}
```

The constructor comment is explicit: *"MCP protocol metadata to pass through to SDK consumers (never sent to model)."* `mcpMeta` is for SDK consumer pass-through — it's an out-of-band channel that doesn't go to the API. It travels with the message but is invisible to the model.

### `imagePasteIds`

```ts
imagePasteIds?: number[]   // parallel array indexed by image content block position
```

`normalizeMessages` splits a multi-image user message into per-block normalized messages, each carrying `imagePasteIds: [imageId]` (singular). The original message's `imagePasteIds[i]` corresponds to the i-th image block.

### Tool pairing fields

```ts
sourceToolAssistantUUID?: UUID   // uuid of the assistant message that emitted the matching tool_use
sourceToolUseID?: string         // same as the block-level tool_use_id, but at the message level
```

The block-level `tool_use_id` is the wire-format pairing (mandatory for the API to accept the round-trip). The message-level `sourceToolAssistantUUID` is for transcript / UI navigation — you can jump from a tool result back to the originating assistant message.

### `summarizeMetadata`

```ts
summarizeMetadata?: {
  messagesSummarized: number
  userContext?: string
  direction?: 'from' | 'up_to'
}
```

Populated on the user message that *is* a compact summary, recording the provenance of the summary (how many old messages it replaced, and the direction of summarization).

### `origin: MessageOrigin`

Provenance of the user input — undefined defaults to `'human'` (keyboard). `task-notification` for subagent completions, `coordinator` for the multi-agent coordinator, `channel` for non-CLI input channels.

### Visibility flags

| Flag | Sent to API? | UI visible? | Used for |
|---|---|---|---|
| `isMeta: true` | Yes | No | Synthetic system-reminder messages (e.g., "your last tool got an error, the user wants X"). |
| `isVisibleInTranscriptOnly: true` | No | Yes (transcript only) | History-only metadata, never enters API context. |
| `isVirtual: true` | No | Yes | Display-only — never sent to API. |
| `isCompactSummary: true` | Yes | Yes | Marks a /compact-generated summary user message. |

`normalizeMessagesForAPI` strips `isVirtual`, keeps `isMeta` (with `[id:]` tag injection gated by `isMeta`-status), and treats `isCompactSummary` as a normal user message.

---

## Part 4: Side-Channel Variants

The three non-API variants are intentionally narrower than `AssistantMessage` / `UserMessage`. They hold information that lives *alongside* the conversation but is either transient or structurally different.

### `AttachmentMessage<A>` — typed generic

```ts
export type AttachmentMessage<
  A extends Attachment = Attachment,
> = MessageBase & {
  type: 'attachment'
  attachment: A
}
```

Generic over `Attachment` because the full union lives in `utils/attachments.ts`, which itself imports `MessageOrigin` (a cycle `message.d.ts` avoids by the generic parameter). Subtypes seen in `messages.ts`:

- `hook_blocking_error`, `hook_cancelled`, `hook_error_during_execution`, `hook_non_blocking_error`, `hook_success`, `hook_system_message`, `hook_additional_context`, `hook_stopped_continuation` (HookAttachment)
- `hook_permission_decision` (HookPermissionDecisionAttachment)
- `edited_text_file`, `max_turns_reached`, and many more — full list not visible from this recovered source.

`reorderAttachmentsForAPI` walks bottom-up and hoists attachment messages up to the nearest `tool_result` or `assistant` boundary before they're sent.

### `ProgressMessage<P>` — transient UI deltas

```ts
export type ProgressMessage<P = any> = MessageBase & {
  type: 'progress'
  data: P
  toolUseID: string
  parentToolUseID?: string
}
```

The header comment is the design rationale: *"Low-level API deltas are transient UI events. Completed AssistantMessage values are yielded separately and are the values retained in conversation history."*

Used for tool-progress streaming, hook-progress (`data.type === 'hook_progress'`), and subagent status. Filtered out by `normalizeMessagesForAPI`; never enter the API prompt.

### `SystemMessage` — heterogeneous meta channel

```ts
export type SystemMessage = MessageBase & {
  type: 'system'
  subtype: string                  // discriminator
  content?: string
  isMeta?: boolean
  level?: 'info' | 'warning' | 'error' | 'suggestion'
  [key: string]: any               // permissive — subtype-specific fields
}
```

Plus a long list of alias types (`SystemAPIErrorMessage`, `SystemCompactBoundaryMessage`, `SystemMicrocompactBoundaryMessage`, `SystemBridgeStatusMessage`, …) that all reduce to `SystemMessage`. The `[key: string]: any` index signature plus the permissive comments make clear: **subtype-specific shapes are out-of-scope for the query loop** and live elsewhere.

`normalizeMessagesForAPI` filters out most system messages except `local_command`, which is converted into a `UserMessage` so the model can reference previous command output in later turns.

---

## Part 5: Block Taxonomy (The Most Concrete Nested Types)

This is the deepest level. `AssistantMessage.message.content` is `BetaContentBlock[]`; `UserMessage.message.content` (when not a string) is `ContentBlockParam[]`. The two unions overlap on most variants but differ in which side emits/consumes them.

### `BetaContentBlock` (assistant side — 16 variants)

| Block | `type` | Key fields | Meaning |
|---|---|---|---|
| **Text** | `'text'` | `text: string`, `citations: BetaTextCitation[] \| null` | Plain assistant text reply. |
| **Thinking** | `'thinking'` | `thinking: string`, `signature: string` | Extended-thinking reasoning. Signature is model-bound (used by `stripSignatureBlocks`). |
| **Redacted thinking** | `'redacted_thinking'` | `data: string` | Opaque encrypted thinking (displayed as "redacted"). |
| **Tool use** | `'tool_use'` | `id`, `name`, `input`, `caller?` | Client-side tool call. **`id` is the join key to `tool_result.tool_use_id`**. |
| **Server tool use** | `'server_tool_use'` | `id`, `name`, `input`, `caller?` | Server-side tool call (web_search, code_execution, advisor, …). |
| **Web search result** | `'web_search_tool_result'` | `tool_use_id`, `content` | Result of server-side web_search. |
| **Web fetch result** | `'web_fetch_tool_result'` | `tool_use_id`, `content`, `caller?` | Result of server-side web_fetch. |
| **MCP tool use** | `'mcp_tool_use'` | `id`, `name`, `server_name`, `input` | Tool call to an MCP server. |
| **MCP tool result** | `'mcp_tool_result'` | `tool_use_id`, `content`, `is_error` | Result from an MCP server. |
| **Advisor tool result** | `'advisor_tool_result'` | `tool_use_id`, `content` | Result of advisor sub-inference. |
| **Code execution tool result** | `'code_execution_tool_result'` | `tool_use_id`, `content` | Result of server-side code_execution. |
| **Bash code execution tool result** | `'bash_code_execution_tool_result'` | `tool_use_id`, `content` | Result of bash_code_execution server tool. |
| **Text editor code execution tool result** | `'text_editor_code_execution_tool_result'` | `tool_use_id`, `content` | Result of text_editor_code_execution. |
| **Tool search tool result** | `'tool_search_tool_result'` | `tool_use_id`, `content` | Result of tool search (returns tool_references). |
| **Container upload** | `'container_upload'` | `file_id` | Marks a file uploaded to the code-exec container. |
| **Compaction** | `'compaction'` | `content: string \| null`, `encrypted_content: string \| null` | Server-side compaction block (round-tripped verbatim). |
| **Fallback** | `'fallback'` | `from: BetaFallbackInfo`, `to: BetaFallbackInfo`, `trigger: BetaFallbackRefusalTrigger` | Marks a fallback hop boundary between models. |

The most-read shape in `query.ts` is `BetaToolUseBlock`:

```ts
interface BetaToolUseBlock {
  id: string                                  // 'toolu_...' — pair key
  input: unknown                              // tool's input (JSON-shaped)
  name: string                                // e.g. 'Bash', 'Read', 'Agent'
  type: 'tool_use'
  caller?: BetaDirectCaller | BetaServerToolCaller | BetaServerToolCaller20260120
}
```

### `ContentBlockParam` (user side — 19 variants)

Same as `BetaContentBlock` for the most part, plus three extras that are request-only:

| Block | `type` | Key fields | Notes |
|---|---|---|---|
| **Text** | `'text'` | `text`, `cache_control?`, `citations?` | The common case. Concatenated with `\n\n` separator in API. |
| **Image** | `'image'` | `source: Base64ImageSource \| URLImageSource \| FileImageSource`, `cache_control?` | Pasted/uploaded image. |
| **Document** | `'document'` | `source: Base64PDFSource \| PlainTextSource \| ContentBlockSource \| URLPDFSource \| FileDocumentSource`, `title?`, `context?`, `citations?` | PDF or text document. |
| **Search result** | `'search_result'` | `content: TextBlockParam[]`, `source`, `title`, `citations?` | Cited search result. |
| **Thinking** | `'thinking'` | `thinking`, `signature` | Echoed back; preserved for thinking-trajectory continuity. |
| **Redacted thinking** | `'redacted_thinking'` | `data` | Echoed back. |
| **Tool use** | `'tool_use'` | `id`, `name`, `input`, `caller?`, `cache_control?` | Echoed back when resuming / prefill. |
| **Tool result** | `'tool_result'` | `tool_use_id`, `content?`, `is_error?`, `cache_control?` | The dominant block type in `UserMessage`. See below. |
| **Server tool use** | `'server_tool_use'` | `id`, `name`, `input`, `caller?` | Echoed back. |
| **Web search / fetch result** | `'web_search_tool_result' \| 'web_fetch_tool_result'` | `tool_use_id`, `content`, `caller?` | Echoed back. |
| **MCP tool result (request)** | `'mcp_tool_result'` | `tool_use_id`, `content?: string \| TextBlockParam[]`, `is_error?` | MCP server response (request shape). |
| **Advisor tool result** | `'advisor_tool_result'` | `tool_use_id`, `content` | Echoed back. |
| **Code exec tool result** | `'code_execution_tool_result' \| 'bash_code_execution_tool_result' \| 'text_editor_code_execution_tool_result'` | `tool_use_id`, `content` | Echoed back. |
| **Tool search tool result** | `'tool_search_tool_result'` | `tool_use_id`, `content` | Echoed back. |
| **Container upload** | `'container_upload'` | `file_id`, `cache_control?` | File uploaded to code-exec container. |
| **Compaction** | `'compaction'` | `content?`, `encrypted_content?`, `cache_control?` | Server-side compaction (round-trip). |
| **Mid-conversation system** | `'mid_conv_system'` | `content: TextBlockParam[]`, `cache_control?` | Mid-conversation system instructions (request-only). |
| **Fallback** | `'fallback'` | `from`, `to`, `trigger?` | Round-trip fallback boundary. |

The **tool_result** block is the most semantically rich in `UserMessage`:

```ts
interface BetaToolResultBlockParam {
  tool_use_id: string        // ← pairs with AssistantMessage's tool_use.id
  type: 'tool_result'
  cache_control?: BetaCacheControlEphemeral | null
  content?:
    | string
    | Array<
        BetaTextBlockParam
      | BetaImageBlockParam
      | BetaSearchResultBlockParam
      | BetaRequestDocumentBlock
      | BetaToolReferenceBlockParam
      >
  is_error?: boolean
}
```

Notice the asymmetric `content` type — it allows a plain string for simple results, but can also be a heterogeneous array of text/image/search-result/document/tool-reference blocks for rich tool outputs (e.g., a `Read` tool returning text + an image preview).

---

## Part 6: Pairing, Visibility, and The Two Identifier Layers

### Tool pairing uses two distinct identifiers

```
AssistantMessage
└── message.content[i]   // BetaContentBlock
    └── { type: 'tool_use', id: 'toolu_xxx', name, input, caller? }
                          └── id is the wire-format join key
                                  │
                                  ▼  (paired by tool_use_id === id)
UserMessage
└── message.content[j]   // ContentBlockParam
    └── { type: 'tool_result', tool_use_id: 'toolu_xxx', content, is_error? }
                          └── tool_use_id matches the preceding tool_use.id

UserMessage.sourceToolAssistantUUID = '<uuid-of-assistant-message-above>'
```

- **`id` / `tool_use_id`** — wire-level. Preserved across resume, mandatory for the API to accept the pairing.
- **`sourceToolAssistantUUID`** — transcript-level. Lets the REPL UI jump from a tool result back to its tool use.

### Visibility is per-message, not per-type

The visibility flags (`isMeta`, `isVirtual`, `isVisibleInTranscriptOnly`, `isCompactSummary`, `isApiErrorMessage`) form a four-axis matrix rather than a single "send to API or not" decision:

| Flag | API? | UI? |
|---|---|---|
| `isVirtual` | ❌ | ✓ |
| `isVisibleInTranscriptOnly` | ❌ | ✓ (transcript only) |
| `isMeta` | ✓ | ❌ |
| `isApiErrorMessage` | ❌ | ✓ |
| `isCompactSummary` | ✓ | ✓ |
| (none of the above) | ✓ | ✓ |

The default "real conversation message" has none of these flags set.

### Block-type access pattern

From `query.ts` and surrounding files, the canonical access patterns:

| Pattern | Where | Meaning |
|---|---|---|
| `block.type === 'tool_use'` | query.ts:129, 750, 829 | Iterate assistant `tool_use` blocks to pair with results or run tools. |
| `block.type === 'tool_result'` | messages.ts:920, query.ts:1455 | Iterate user `tool_result` blocks. |
| `block.type === 'text'` | query.ts:1425 | Extract last assistant text for tool-use-summary context. |
| `block.type === 'thinking'` | (synthesized) | Filter for orphan-thinking detection. |
| `'tool_use_id' in block` | messages.ts:1255 | Generic check for any server-side result block (advisor, mcp, web_search, …). |
| `block.type === 'server_tool_use' \|\| 'mcp_tool_use'` | messages.ts:1318 | Detect unresolved server-tool uses. |
| `block.type === 'image' \|\| 'document'` | claude.ts:943 | Block-types-to-strip on prior errors. |
| `block.type === 'tool_reference'` | (filtered) | Tool-search blocks; stripped when tool search beta is off. |

The general approach: check `block.type` first (TypeScript narrows), then read `type`-specific fields.

---

## Part 7: Normalization Pipeline (Stored → Wire)

The `normalizeMessagesForAPI` function in `messages.ts:1989-2370` transforms `Message[]` into `(UserMessage | AssistantMessage)[]` ready to send to the API. The transformations, in order:

1. **Reorder attachments.** `reorderAttachmentsForAPI` walks bottom-up, hoisting attachment messages up to the nearest `tool_result` or `assistant` boundary.
2. **Strip virtual messages.** `isVirtual` is dropped (display-only).
3. **Build error strip-map.** Synthetic API errors (`isApiErrorMessage: true`) identify which content-block types to strip from the preceding `isMeta` user message (e.g., remove `document` blocks after a PDF-too-large error).
4. **Filter.** Drop `progress`, non-`local_command` `system`, and synthetic API errors.
5. **Convert local_command system messages** into `UserMessage` so the model can reference previous command output.
6. **Per-message transformation:**
   - User: strip `tool_reference` blocks (when tool search beta is off) or unavailable tool references (when on); apply error-driven block-type stripping; merge consecutive users (Bedrock doesn't allow multiple user messages in a row); inject `TOOL_REFERENCE_TURN_BOUNDARY` to prevent the capybara stop-sequence pattern.
   - Assistant: normalize `tool_use` inputs via `normalizeToolInputForAPI`; strip `caller` field when tool search is off; merge consecutive assistant messages with the same `message.id`.
   - Attachment: convert into one or more normalized messages via `normalizeAttachmentForAPI`; optionally wrap text in `<system-reminder>` (feature-gated).
7. **Relocate tool_reference siblings** (feature-gated) — moves text siblings off a tool_reference-bearing user message onto the next non-tool-reference tool_result user message, preventing the "two consecutive Human:" pattern that teaches the model to emit stop sequences.
8. **Filter orphan thinking-only assistants** — likely introduced by compaction slicing between failed/retry pairs; without this filter, mismatched thinking signatures cause 400s.
9. **Filter trailing thinking** on the last assistant, then **whitespace-only assistants**, then **ensure non-empty assistant content**.
10. **Merge adjacent users** (feature-gated).
11. **Smoosh `<system-reminder>` text siblings** into the adjacent `tool_result.content` (the universal form of the legacy string-only smoosh).
12. **Sanitize `is_error` tool results** — the API rejects non-text content when `is_error: true`, so strip images/documents from error results.
13. **Inject `[id:xxxxxx]` tags** on user message last text blocks (snip tool support, feature-gated).
14. **Validate images** for API size limits.

The output is the wire-ready `(UserMessage | AssistantMessage)[]` passed to `deps.callModel`.

---

## Part 8: What Is Not Directly Visible

A few areas where the recovered source only declares permissive stubs:

- **`utils/attachments.ts`** — only the import is visible in `message.d.ts`; the full `Attachment` union lives elsewhere (the full list of subtypes like `edited_text_file`, `max_turns_reached`, hook variants, etc.).
- **`SDKAssistantMessageError`** shape — only used in `createAssistantAPIErrorMessage`'s signature.
- **Specific content-block shapes for less-common server-side tools** (the inner `content` of `web_search_tool_result`, `encrypted_code_execution_result`, `tool_search_tool_search_result`, etc.).
- **The `StopHookInfo`, `HookResultMessage`, `GroupedToolUseMessage`, `CollapsedReadSearchGroup`, `RenderableMessage`** types — declared as `any` aliases at the bottom of `message.d.ts` because they are presentation-layer concerns outside the query-loop recovery scope.

---

## Part 9: Caveats

`restored-src/src/types/message.d.ts` is declared in `CLAUDE.md` as an editor-only stub:

> `restored-src/src/types/message.d.ts` is intentionally permissive because the real `src/types/message.ts` is absent while many recovered files import message-related types.

The shape inferences are based on call sites and the SDK declarations, not the original TypeScript source. Field presence and types are reliable for fields that are actually read or constructed; some fields marked optional may turn out to be required in the real implementation, and the `[key: string]: any` on `SystemMessage` means subtype-specific fields beyond those listed here certainly exist.

---

## Cross-References

- `restored-src/src/query.ts` — main consumer of `Message` types; reads `assistantMessage.message.content` heavily.
- `restored-src/src/utils/messages.ts` — constructors and the `normalizeMessagesForAPI` pipeline.
- `restored-src/src/utils/attachments.ts` — `Attachment` union (referenced by `AttachmentMessage<A>`).
- `restored-src/src/types/hooks.ts` — `HookEvent` (used inside `AttachmentMessage` for hook variants).
- `restored-src/types/npm/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts` — full SDK declarations.
- `docs/STATE_AND_RENDERING.md` — how messages flow through React state.
- `docs/SESSION_ORCHESTRATION_GUIDE.md` — how messages are scoped per session / subagent.

---

## One-Line Summary

> Messages are a five-variant discriminated union on a shared `{uuid, timestamp}` base, with `AssistantMessage` wrapping an SDK `BetaMessage` (id, model, role, content of 16 `BetaContentBlock` variants, `BetaUsage`, stop_reason) plus synthetic-message flags (`isApiErrorMessage`/`isMeta`/`isVirtual`/`apiError`) for non-real assistant outputs, `UserMessage` wrapping `{ role: 'user', content: string | ContentBlockParam[] }` where the array form has 19 `ContentBlockParam` variants dominated by `tool_result` (paired to `tool_use` via `tool_use_id` === `tool_use.id`) plus rich parallel metadata (`toolUseResult`, `mcpMeta`, `sourceToolAssistantUUID`, `summarizeMetadata`, `origin`, planContent), three side-channel variants (`AttachmentMessage<A>`, `ProgressMessage<P>`, `SystemMessage`), and a separate non-history channel for stream events / tombstones / tool-use summaries — transformed to wire format by `normalizeMessagesForAPI` (reorder-attachments, strip-virtual, merge-adjacent-users, smoosh-system-reminders, inject-id-tags, …).