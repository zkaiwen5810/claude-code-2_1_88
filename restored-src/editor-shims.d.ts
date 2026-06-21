declare module "bun:bundle" {
  export function feature(name: string): boolean
}

declare const MACRO: {
  VERSION: string
  CHANNEL: string
  COMMITHASH: string
  DATE: string
  BUILD_TIMESTAMP: string
  [key: string]: any
}

declare const Bun: {
  env: Record<string, string | undefined>
  file: (...args: any[]) => any
  write: (...args: any[]) => any
  serve: (...args: any[]) => any
  sleep: (...args: any[]) => Promise<void>
  spawn: (...args: any[]) => any
  spawnSync: (...args: any[]) => any
  which: (...args: any[]) => any
  [key: string]: any
}

declare module "react/compiler-runtime" {
  export function c(size: number): any[]
}

declare module "*.md" {
  const content: string
  export default content
}

// Editor-only declarations for native/private runtime modules that are absent
// from this recovered workspace. These suppress TypeScript/Zed resolution
// warnings only; they are not runtime implementations.
declare module "@ant/claude-for-chrome-mcp" {
  const defaultExport: any
  export default defaultExport
  export const BASE_CHROME_PROMPT: any
  export const BROWSER_TOOLS: any
  export const createClaudeForChromeMcpServer: any
  export const shouldAutoEnableClaudeInChrome: any
  export type ClaudeForChromeContext = any
}

declare module "@ant/computer-use-input" {
  const defaultExport: any
  export default defaultExport
  export const ComputerUseInput: any
  export type ComputerUseInputAPI = any
}

declare module "@ant/computer-use-mcp" {
  const defaultExport: any
  export default defaultExport
  export const API_RESIZE_PARAMS: any
  export const CLI_CU_CAPABILITIES: any
  export const CLI_HOST_BUNDLE_ID: any
  export const COMPUTER_USE_MCP_SERVER_NAME: any
  export const DEFAULT_GRANT_FLAGS: any
  export const bindSessionContext: any
  export const buildComputerUseTools: any
  export const buildMcpToolName: any
  export const createComputerUseMcpServer: any
  export const drainRunLoop: any
  export const enableConfigs: any
  export const getChicagoCoordinateMode: any
  export const getTerminalBundleId: any
  export const initializeAnalyticsSink: any
  export const notifyExpectedEscape: any
  export const targetImageSize: any
  export type ComputerExecutor = any
  export type ComputerUseSessionContext = any
  export type CuCallToolResult = any
  export type CuPermissionRequest = any
  export type CuPermissionResponse = any
  export type DisplayGeometry = any
  export type FrontmostApp = any
  export type InstalledApp = any
  export type ResolvePrepareCaptureResult = any
  export type RunningApp = any
  export type ScreenshotDims = any
  export type ScreenshotResult = any
}

declare module "@ant/computer-use-mcp/sentinelApps" {
  export const getSentinelCategory: any
}

declare module "@ant/computer-use-mcp/types" {
  export const COMPUTER_USE_MCP_SERVER_NAME: any
  export const DEFAULT_GRANT_FLAGS: any
  export const createCliExecutor: any
  export const getChicagoEnabled: any
  export const getChicagoSubGates: any
  export const getDynamicConfig_CACHED_MAY_BE_STALE: any
  export const getSubscriptionType: any
  export const isEnvTruthy: any
  export const requireComputerUseSwift: any
  export type ComputerUseHostAdapter = any
  export type CoordinateMode = any
  export type CuPermissionRequest = any
  export type CuPermissionResponse = any
  export type CuSubGates = any
  export type Logger = any
}

declare module "@ant/computer-use-swift" {
  export type ComputerUseAPI = any
}

declare module "audio-capture-napi" {
  const defaultExport: any
  export default defaultExport
  export const getPlatform: any
}

declare module "bidi-js" {
  const defaultExport: any
  export default defaultExport
}

declare module "bun:ffi" {
  export const dlopen: any
  export const FFIType: any
  export const suffix: any
}

declare module "cacache" {
  const defaultExport: any
  export default defaultExport
}

declare module "color-diff-napi" {
  const defaultExport: any
  export default defaultExport
  export const getSyntaxTheme: any
  export const isEnvDefinedFalsy: any
  export type ColorDiff = any
  export type ColorFile = any
  export type SyntaxTheme = any
}

declare module "image-processor-napi" {
  const defaultExport: any
  export default defaultExport
}

declare module "url-handler-napi" {
  const defaultExport: any
  export default defaultExport
}
