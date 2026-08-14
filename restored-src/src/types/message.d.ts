// Editor-only declarations for a restored module that is absent from this
// source snapshot. These shapes are inferred from the recovered call sites and
// the released SDK declarations. They support source reading and editor
// resolution; they are not authoritative upstream source definitions.

import type { UUID } from 'crypto'
import type {
  BetaContentBlock,
  BetaMessage,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { Attachment } from '../utils/attachments.js'
import type { HookProgress } from './hooks.js'

type MessageUUID = UUID

type MessageBase = {
  uuid: MessageUUID
  timestamp: string
}

/**
 * The recovered code creates synthetic assistant payloads without a couple of
 * response-only fields added by newer SDK declarations. Keep the released
 * message shape while making those fields optional at this internal boundary.
 */
export type AssistantMessagePayload = Omit<
  BetaMessage,
  'diagnostics' | 'stop_details'
> &
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

export type MessageOrigin =
  | { kind: 'human' }
  | { kind: 'task-notification' }
  | { kind: 'coordinator' }
  | { kind: 'channel'; server: string }

export type PartialCompactDirection = 'from' | 'up_to'

export type UserMessage = MessageBase & {
  type: 'user'
  message: {
    role: 'user'
    content: string | ContentBlockParam[]
  }
  isMeta?: true
  isVisibleInTranscriptOnly?: true
  isVirtual?: true
  isCompactSummary?: true
  toolUseResult?: unknown
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
  imagePasteIds?: number[]
  sourceToolAssistantUUID?: MessageUUID
  sourceToolUseID?: string
  permissionMode?: string
  summarizeMetadata?: {
    messagesSummarized: number
    userContext?: string
    direction?: PartialCompactDirection
  }
  origin?: MessageOrigin
  planContent?: string
}

/**
 * Attachment is generic because its full union lives in utils/attachments.ts,
 * which itself imports MessageOrigin. The query loop only requires its
 * discriminator and selected payload fields.
 */
export type AttachmentMessage<
  A extends Attachment = Attachment,
> = MessageBase & {
  type: 'attachment'
  attachment: A
}

export type ProgressMessage<P = any> = MessageBase & {
  type: 'progress'
  data: P
  toolUseID: string
  parentToolUseID?: string
}

export type SystemMessageLevel = 'info' | 'warning' | 'error' | 'suggestion'

/**
 * System subtypes have heterogeneous presentation metadata. Their common
 * query-loop contract is the discriminant plus identity; subtype-specific
 * declarations below remain permissive editor aids.
 */
export type SystemMessage = MessageBase & {
  type: 'system'
  subtype: string
  content?: string
  isMeta?: boolean
  level?: SystemMessageLevel
  [key: string]: any
}

export type Message =
  | AssistantMessage
  | UserMessage
  | AttachmentMessage
  | ProgressMessage
  | SystemMessage

/**
 * Low-level API deltas are transient UI events. Completed AssistantMessage
 * values are yielded separately and are the values retained in conversation
 * history.
 */
export type StreamEvent = {
  type: 'stream_event'
  event: BetaRawMessageStreamEvent
  ttftMs?: number
}

/** Emitted once for each model request in the potentially multi-turn loop. */
export type RequestStartEvent = {
  type: 'stream_request_start'
}

/** Retracts a previously yielded message after a failed streaming attempt. */
export type TombstoneMessage = {
  type: 'tombstone'
  message: Message
}

/** SDK-facing progress summary; it is deliberately not conversation history. */
export type ToolUseSummaryMessage = MessageBase & {
  type: 'tool_use_summary'
  summary: string
  precedingToolUseIds: string[]
}

export type StopHookInfo = {
  command: string
  promptText?: string
  durationMs?: number
}

/**
 * normalizeMessages splits messages into one-content-block rows. These generic
 * forms preserve the block type used by query/tool lookup predicates.
 */
export type NormalizedAssistantMessage<
  B extends BetaContentBlock = BetaContentBlock,
> = Omit<AssistantMessage, 'message'> & {
  message: Omit<AssistantMessagePayload, 'content'> & { content: [B] }
}

export type NormalizedUserMessage<
  B extends ContentBlockParam = ContentBlockParam,
> = Omit<UserMessage, 'message'> & {
  message: Omit<UserMessage['message'], 'content'> & { content: [B] }
}

export type NormalizedMessage =
  | NormalizedAssistantMessage
  | NormalizedUserMessage
  | AttachmentMessage
  | ProgressMessage
  | SystemMessage

/**
 * Hook execution yields both persistent attachment messages and transient
 * progress messages. createAttachmentMessage intentionally returns the broad
 * AttachmentMessage shape, while executeHooks constructs progress values with
 * HookProgress data.
 */
export type HookResultMessage =
  | AttachmentMessage
  | ProgressMessage<HookProgress>

// The following presentation-layer shapes are outside the query-loop recovery
// scope. Keep them permissive rather than inventing unsupported detail.
export type RenderableMessage = any
export type GroupedToolUseMessage = any
export type CollapsedReadSearchGroup = any

export type SystemAPIErrorMessage = SystemMessage
export type SystemInformationalMessage = SystemMessage
export type SystemMemorySavedMessage = SystemMessage
export type SystemStopHookSummaryMessage = SystemMessage
export type SystemBridgeStatusMessage = SystemMessage
export type SystemTurnDurationMessage = SystemMessage
export type SystemThinkingMessage = SystemMessage
export type SystemAwaySummaryMessage = SystemMessage
export type SystemCompactBoundaryMessage = SystemMessage
export type SystemMicrocompactBoundaryMessage = SystemMessage
export type SystemPermissionRetryMessage = SystemMessage
export type SystemScheduledTaskFireMessage = SystemMessage
export type SystemLocalCommandMessage = SystemMessage
export type SystemFileSnapshotMessage = SystemMessage
export type SystemApiMetricsMessage = SystemMessage
export type SystemAgentsKilledMessage = SystemMessage
