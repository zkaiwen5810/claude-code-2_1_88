// Editor-only declaration for a restored module that is absent from
// this source snapshot. These shapes are inferred from recovered callers,
// not original upstream declarations or a runtime implementation.
// Evidence and recovery limits: ./CACHED_MICROCOMPACT_RECOVERY.md

/** Wire format reproduced from CachedMCEditsBlock in services/api/claude.ts. */
export type CacheEditsBlock = {
  type: 'cache_edits'
  edits: { type: 'delete'; cache_reference: string }[]
}

/** Replayed at the original message position to preserve cache hits. */
export type PinnedCacheEdits = {
  userMessageIndex: number
  block: CacheEditsBlock
}

/** Observed config fields only; defaults and additional fields are unknown. */
export type CachedMCConfig = {
  triggerThreshold: number
  keepRecent: number
  // Inferred from isModelSupportedForCacheEditing and the supportedModels log.
  supportedModels: string[]
}

/**
 * Partial state surface used by microCompact.ts, not the full internal state.
 * Only observed collection operations are specified: callers do not establish
 * whether registeredTools/deletedRefs are Sets, Maps, or custom collections.
 */
export type CachedMCState = {
  registeredTools: { has(toolUseId: string): boolean }
  toolOrder: { readonly length: number }
  deletedRefs: { readonly size: number }
  pinnedEdits: PinnedCacheEdits[]
}

export function getCachedMCConfig(): CachedMCConfig
export function isCachedMicrocompactEnabled(): boolean
export function isModelSupportedForCacheEditing(model: string): boolean
export function createCachedMCState(): CachedMCState
export function registerToolResult(state: CachedMCState, toolUseId: string): void
export function registerToolMessage(state: CachedMCState, toolUseIds: string[]): void
export function getToolResultsToDelete(state: CachedMCState): string[]
// The caller checks truthiness; the exact empty-result sentinel is unknown.
export function createCacheEditsBlock(
  state: CachedMCState,
  toolUseIds: string[],
): CacheEditsBlock | null | undefined
export function markToolsSentToAPI(state: CachedMCState): void
export function resetCachedMCState(state: CachedMCState): void
