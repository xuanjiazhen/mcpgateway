export interface Logger {
  info: (...args: any[]) => void
  error: (...args: any[]) => void
  warn: (...args: any[]) => void
  debug: (...args: any[]) => void
}

// 添加cors模块的类型引用
import { CorsOptions } from 'cors'
export { CorsOptions }

export interface MCPServiceOptions {
  // 基础服务选项
}

export interface MCPService {
  initialize(): Promise<void>
  destroy(): Promise<void>
  getTools(): Array<{
    name: string
    description: string
    parameters: {
      type: string
      properties: Record<string, any>
      required: string[]
    }
  }>
  executeToolCall(toolName: string, params: Record<string, any>): Promise<any>
}

export interface McpServerConfig {
  // stdio模式配置
  stdio?: string

  // sse模式配置
  sse?: string

  // api模式配置
  api?: string
  apiHost?: string
  ignoreHeader?: boolean

  // 输出传输配置
  outputTransport: 'sse' | 'ws' | 'streamable-http'
  port?: number

  // 路径配置
  ssePath?: string
  messagePath?: string
  httpPath?: string

  // 其他配置
  baseUrl?: string
  logLevel?: 'info' | 'none'
  cors?: string[]
  healthEndpoint?: string[]
  header?: string | string[] // 支持单个字符串或字符串数组
  oauth2Bearer?: string
}

export interface McpServersConfig {
  mcpServers: Record<string, McpServerConfig>
}

export interface MultiServerOptions {
  configFile: string
  port: number
  logLevel: 'info' | 'none'
}
