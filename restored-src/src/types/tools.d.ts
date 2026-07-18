// Editor-only declarations for a restored module that is absent from this
// source snapshot. These shapes are inferred from recovered producers and
// consumers; they are not authoritative upstream source definitions.

import type { TaskType } from '../Task.js'
import type { AgentId } from './ids.js'
import type {
  AssistantMessage,
  NormalizedAssistantMessage,
  NormalizedUserMessage,
} from './message.js'

type ShellProgressBase = {
  output: string
  fullOutput: string
  elapsedTimeSeconds: number
  totalLines: number
  taskId?: string
  timeoutMs?: number
}

/** Incremental output emitted while a Bash command is running. */
export type BashProgress = ShellProgressBase & {
  type: 'bash_progress'
  totalBytes?: number
}

/** Incremental output emitted while a PowerShell command is running. */
export type PowerShellProgress = ShellProgressBase & {
  type: 'powershell_progress'
  totalBytes: number
}

/** Progress shared by the two shell backends and forwarded by subagents. */
export type ShellProgress = BashProgress | PowerShellProgress

/**
 * Agent progress contains either a normalized tool-result row or an assistant
 * message. Forked slash commands also pass their assistant message directly.
 */
export type AgentToolProgress = {
  type: 'agent_progress'
  message: AssistantMessage | NormalizedUserMessage
  prompt: string
  agentId: AgentId
}

/** Tool-use and tool-result rows emitted by an isolated skill agent. */
export type SkillToolProgress = {
  type: 'skill_progress'
  message: NormalizedAssistantMessage | NormalizedUserMessage
  prompt: string
  agentId: AgentId
}

type MCPProgressBase = {
  type: 'mcp_progress'
  serverName: string
  toolName: string
  progress?: number
  total?: number
  progressMessage?: string
  elapsedTimeMs?: number
}

/** Lifecycle and protocol progress notifications for a remote MCP tool call. */
export type MCPProgress =
  | (MCPProgressBase & { status: 'started' })
  | (MCPProgressBase & { status: 'progress'; progress: number })
  | (MCPProgressBase & {
      status: 'completed' | 'failed'
      elapsedTimeMs: number
    })

/** Live inner-tool hint emitted while the REPL tool is executing. */
export type REPLToolProgress = {
  type: 'repl_tool_call'
  phase: 'start'
  toolName: string
  toolInput: Record<string, unknown>
}

/** Progress displayed while TaskOutput blocks for a task to finish. */
export type TaskOutputProgress = {
  type: 'waiting_for_task'
  taskDescription: string
  taskType: TaskType
}

/** Streaming events surfaced while WebSearch refines and executes queries. */
export type WebSearchProgress =
  | {
      type: 'query_update'
      query: string
    }
  | {
      type: 'search_results_received'
      resultCount: number
      query: string
    }

/** Every progress payload accepted by the generic tool execution pipeline. */
export type ToolProgressData =
  | AgentToolProgress
  | ShellProgress
  | MCPProgress
  | REPLToolProgress
  | SkillToolProgress
  | TaskOutputProgress
  | WebSearchProgress

/**
 * SDK workflow producers are absent from this recovered snapshot. The event
 * queue documents these stable identity/grouping fields; payload-specific
 * fields are retained as unknown until their producer can be recovered.
 */
export type SdkWorkflowProgress = {
  type: string
  index: number
  phaseIndex: number
  [key: string]: unknown
}
