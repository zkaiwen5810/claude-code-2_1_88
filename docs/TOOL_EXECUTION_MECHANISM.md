# Tool Execution Mechanism

This note summarizes the tool-execution design visible in the recovered Claude Code 2.1.88 source. The repository is reconstructed from a released package, so the names and paths below are implementation clues rather than authoritative upstream architecture.

## Core Model

`queryLoop` is the protocol coordinator. It consumes streamed assistant messages, detects completed `tool_use` blocks, delegates execution, yields progress and results to local consumers, and feeds normalized results into the next model request.

```text
Claude SSE response
  -> completed tool_use content block
  -> queryLoop
  -> StreamingToolExecutor or runTools
  -> runToolUse
  -> permission checks + hooks + tool.call()
       |-> progress -> UI / SDK / transcript
       `-> final result -> queryLoop toolResults
                            `-> next Claude API request
```

Streaming tool execution overlaps tool work with the remainder of model generation. It is not a full-duplex conversation: a running model response cannot consume a tool result. Results enter the model context only through a subsequent API request.

## From Model Stream To Tool Start

The API streaming layer in `restored-src/src/services/api/claude.ts` accumulates partial `input_json_delta` text for a `tool_use` block. Partial input is available for UI rendering, but execution waits until `content_block_stop`, when the code emits a completed `AssistantMessage` for that block.

The stream emits one local assistant message per completed content block. These messages have distinct local UUIDs but retain the same API message ID, allowing them to be merged later for the wire transcript.

In `restored-src/src/query.ts`, `queryLoop` inspects assistant content directly for `tool_use` blocks. It deliberately does not rely on `stop_reason === "tool_use"`, which the recovered source describes as unreliable. Each completed block is added to the streaming executor immediately when the feature is enabled.

After every item received from the model stream, `queryLoop` polls the executor for progress and completed results. While the model response remains open, progress presentation is therefore driven by the cadence of model stream events. After the model stream ends, the executor waits independently for either progress or tool completion.

## Scheduling And Concurrency

Two schedulers share the same lower-level execution pipeline.

### Streaming scheduler

`restored-src/src/services/tools/StreamingToolExecutor.ts` starts tools as their completed blocks arrive.

- `isConcurrencySafe(parsedInput)` controls scheduling; it is distinct from `isReadOnly`.
- Multiple concurrency-safe calls may execute together.
- A non-concurrency-safe call requires exclusive execution.
- A queued unsafe call acts as a barrier, so later safe calls do not pass it.
- Invalid inputs and failures in `isConcurrencySafe` are treated conservatively as unsafe.
- Unknown tools immediately receive an error `tool_result`.
- Safe results may be emitted in completion order. Unsafe tools preserve exclusivity and act as ordering barriers.

Context modifiers are currently applied only for non-concurrency-safe tools. The streaming executor explicitly does not support modifiers from concurrent tools.

### Post-response scheduler

When streaming execution is disabled, `restored-src/src/services/tools/toolOrchestration.ts` waits for the model response to finish, then partitions calls into consecutive batches:

- Safe batches run concurrently, with a default concurrency cap of 10.
- Unsafe calls run one at a time.
- Context modifiers from a safe batch are collected and applied afterward in original tool-block order.

## Common Tool Lifecycle

Both schedulers call `runToolUse` in `restored-src/src/services/tools/toolExecution.ts`. Its main stages are:

1. Resolve the tool by primary name or supported legacy alias.
2. Validate model input with the tool's Zod schema.
3. Run tool-specific input validation.
4. Run `PreToolUse` hooks.
5. Resolve permission, including any user- or hook-modified input.
6. Invoke `tool.call(input, context, canUseTool, assistantMessage, onProgress)`.
7. Run success or failure hooks.
8. Map raw output into a model-facing `tool_result`.
9. Persist or truncate oversized model-facing output when necessary.
10. Return messages and optional context changes to the scheduler.

Thrown errors, validation failures, missing tools, and permission denials are converted into user messages containing error `tool_result` blocks. This keeps failures inside the normal model protocol.

Progress callbacks and final results use different timing even though they share one async iterable. Progress is enqueued as it occurs; final and hook-produced messages are delivered after the complete execution Promise settles.

## Result Channels

A tool result is not one representation. The execution pipeline separates model, presentation, SDK, and context concerns.

| Value | Destination |
|---|---|
| `ToolResult.data` | Raw typed output from `tool.call` |
| `mapToolResultToToolResultBlockParam(...)` | Model-facing `tool_result` content |
| `UserMessage.toolUseResult` | Raw output retained for UI and SDK presentation |
| Progress messages | UI, SDK, and transcript; excluded from model input |
| `ToolResult.newMessages` | Additional messages or attachments |
| `ToolResult.contextModifier` | Subsequent execution/query context |
| `ToolResult.mcpMeta` | MCP metadata exposed to main-thread SDK consumers |

This split lets a tool send concise or persisted content to the model while rendering richer typed output for the user. UI components call `renderToolResultMessage` with `toolUseResult`, whereas the API receives the mapped `tool_result` block.

Large textual results may be saved under the session's tool-result storage and replaced in model context by a preview plus file path. Empty outputs receive an explicit completion marker so the model does not interpret an empty prompt tail as a reason to stop.

## Feeding Results Back To Claude

For every tool update, `queryLoop` first yields the message outward. It then calls `normalizeMessagesForAPI` on the update and retains only model-relevant user messages in its `toolResults` array. Progress is filtered; some attachments become meta user messages.

Once all tools finish, the next loop state is assembled as:

```ts
messages: [
  ...messagesForQuery,
  ...assistantMessages,
  ...toolResults,
]
```

The next iteration sends that state to Claude in a new API request.

The live event stream may interleave assistant fragments, progress, and fast tool results. Before API submission, normalization reconstructs a valid wire transcript by:

- merging assistant fragments with the same API message ID;
- merging adjacent user messages;
- filtering progress and presentation-only messages;
- normalizing tool names and inputs;
- checking `tool_use` / `tool_result` pairing.

`ensureToolResultPairing` is a final defensive repair pass. It can insert synthetic results for missing pairs or remove orphaned results from damaged/resumed transcripts.

## UI And SDK Propagation

Tool events are correlated primarily by IDs:

- `tool_use.id` identifies the call;
- `tool_result.tool_use_id` resolves it;
- `ProgressMessage.parentToolUseID` associates progress with the outer call;
- a nested progress event may also carry its own `toolUseID`.

The terminal UI builds lookup maps from these IDs to determine whether a tool is queued, executing, resolved, or errored. It renders completed output from the raw `toolUseResult`, after validating resumed output against the tool's output schema.

The SDK adapter emits assistant and user events for completed blocks and results. Nested agent messages carry `parent_tool_use_id`. Bash and PowerShell progress is only exposed in selected remote/container configurations and is throttled.

## Nested And Background Tools

### Synchronous agents

The Agent tool runs a nested `query()` loop. Child tool uses and results are wrapped as `agent_progress` for parent UI/SDK visibility. They are not copied wholesale into the parent model context.

When the child finishes, `finalizeAgentTool` extracts its final assistant text and usage metadata. That summary becomes the single parent Agent `tool_result`.

### Background agents and shell tasks

A background tool first returns a normal launch acknowledgement, satisfying its original `tool_use`. Detached execution then continues through task state and output files.

When the task completes, it does not emit a second result for the original tool ID. Instead it enqueues a `<task-notification>`. A later query iteration converts that notification into a meta user attachment and sends it to Claude.

This preserves the one-result-per-tool-use protocol while allowing asynchronous completion to re-enter the conversation. Blocking task-output tools provide a separate explicit waiting/polling path.

## Cancellation, Errors, And Fallback

The main invariant is that every observed client `tool_use` should receive exactly one matching result before model continuation. Synthetic error results cover:

- unknown or invalid tools;
- permission rejection;
- execution failures;
- user interruption;
- sibling cancellation;
- streaming fallback;
- model/API failure after a tool block was observed.

Only Bash errors automatically cancel concurrently running siblings. The recovered implementation assumes shell calls may form an implicit dependency chain, while Read/Web-style calls are usually independent.

Tools can declare submit-interrupt behavior:

- `cancel`: a newly submitted message may stop the tool and discard its result;
- `block`: the new message waits while the tool continues.

Streaming fallback is the most important side-effect risk. The query loop tombstones assistant fragments from the failed attempt, discards their buffered results, and creates a fresh executor. However, discard cannot roll back a side effect that already occurred and does not itself guarantee immediate termination of work already inside `tool.call`. The API layer therefore includes a gate to disable streaming-to-non-streaming fallback because retrying a partially streamed `tool_use` can execute the same operation twice.

## Design Summary

The recovered architecture separates four responsibilities:

1. `queryLoop` owns model-protocol ordering and continuation.
2. Schedulers own concurrency and execution timing.
3. `runToolUse` owns validation, permissions, hooks, invocation, and result construction.
4. Normalization and presentation layers independently shape results for Claude, the transcript, the terminal UI, and SDK consumers.

The design gains latency by starting safe tools during model streaming and gains resilience through synthetic pairing repairs. Its main complexity comes from reconciling a highly interleaved local event stream with the strict assistant/tool-result ordering required by the model API.
