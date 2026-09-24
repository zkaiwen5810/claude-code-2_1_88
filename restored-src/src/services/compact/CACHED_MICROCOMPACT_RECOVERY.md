# Cached microcompact declaration recovery

`cachedMicrocompact.d.ts` is an editor-only reconstruction from consumers in
this unofficial recovered 2.1.88 workspace. The missing module was not found
among the sources or declaration definitions in `package/cli.js.map`.
No runtime implementation has been reconstructed.

## Evidence

| Declaration | Recovered evidence | Confidence / limits |
| --- | --- | --- |
| `CacheEditsBlock` | `services/api/claude.ts`: `CachedMCEditsBlock`, `addCacheBreakpoints` | Exact visible wire shape: `type: 'cache_edits'`, deletion entries with string references. |
| `PinnedCacheEdits` | `services/api/claude.ts`: `CachedMCPinnedEdits`; `microCompact.ts`: `pinCacheEdits` | Exact visible record shape: message index and edit block. |
| `CachedMCConfig` | `microCompact.ts`: threshold/keep logging and count-based policy comments; `services/api/claude.ts`: supported-model logging | Numeric counts and a string model list are inferred. This type name is supplied for editor use; original name, defaults, and additional fields are unknown. |
| `CachedMCState` | `microCompact.ts`: registration, logging, and pinned-edit helpers | Only `.has(id)`, `.length`, `.size`, and the pinned-edit array are observed. Minimal structural types avoid inventing internal collection implementations. |
| Function declarations | Calls in `microCompact.ts` and `services/api/claude.ts` | Argument and consumed return shapes are inferred. `void` means callers ignore the result, not proof the original function returned nothing. |

The old generic stub also exposed `default`, `block`, and `isAgenticQuery`.
No consumers of those exports were found; they are omitted rather than
presented as recovered API. Likewise, types are not duplicated as runtime
values without evidence.

## Visible protocol

1. Register eligible tool IDs, grouped by their containing user message.
2. Ask the missing module which results to delete and build an edit block.
3. Consume pending edits once before constructing request parameters, so
   retries and logging can reuse the same edits.
4. In `addCacheBreakpoints`, reinsert previous edits at their pinned message
   positions; insert new edits after tool results in the last user message.
   Deduplicate deletion references across blocks.
5. Add `cache_reference: tool_use_id` to tool results in messages strictly
   before the last message containing a cache-control marker.
6. Send these blocks in the normal streaming Messages request with the
   cache-editing beta enabled. This request path is gated to the first-party
   provider and the exact `repl_main_thread` source in the recovered API code.
7. After a successful response, mark tools as sent. `query.ts` records deletion
   savings using the increase in cumulative `cache_deleted_input_tokens`.

## Not recoverable from these callers

- Complete state layout, config defaults, and exact deletion-selection rules.
- Whether grouping prevents partial message deletion, and precisely how
  previously sent tool IDs influence eligibility.
- The exact empty-result sentinel of `createCacheEditsBlock`; the declaration
  allows both `null` and `undefined` because the caller only tests truthiness.
- The literal `CACHE_EDITING_BETA_HEADER` value, absent from recovered constants.
- Server-side cache/attention behavior, billing semantics, or runtime support.

The declaration intentionally does not invent these details or modify the
recovered implementation files to hide their remaining diagnostics.
