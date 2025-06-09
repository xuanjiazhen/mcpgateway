import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { McpServersConfig, McpServerConfig } from '../types.js'

// 检查是否为URL
function isUrl(str: string): boolean {
  try {
    const url = new URL(str)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// 从远程URL下载配置文件
function downloadConfigFromUrl(
  url: string,
): Promise<{ content: string; lastModified?: string; etag?: string }> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http

    const req = client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`))
        return
      }

      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        resolve({
          content: data,
          lastModified: res.headers['last-modified'] as string,
          etag: res.headers['etag'] as string,
        })
      })
    })

    req.on('error', reject)
    req.setTimeout(10000, () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
  })
}

/**
 * 加载MCP服务器配置文件（支持本地文件和远程URL）
 */
export async function loadMcpServersConfig(
  configPath: string,
): Promise<McpServersConfig> {
  try {
    let configContent: string

    if (isUrl(configPath)) {
      console.log(`[ConfigLoader] 从远程URL加载配置: ${configPath}`)
      const result = await downloadConfigFromUrl(configPath)
      configContent = result.content
      console.log(
        `[ConfigLoader] 远程配置加载成功，大小: ${configContent.length} 字节`,
      )
    } else {
      const absolutePath = path.resolve(configPath)

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`配置文件不存在: ${absolutePath}`)
      }

      configContent = fs.readFileSync(absolutePath, 'utf-8')
      console.log(`[ConfigLoader] 本地配置加载成功: ${absolutePath}`)
    }

    const config = JSON.parse(configContent) as McpServersConfig

    // 验证配置格式
    validateConfig(config)

    return config
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`配置文件JSON格式错误: ${error.message}`)
    }
    throw error
  }
}

// 检查远程配置文件是否有更新
export async function checkRemoteConfigUpdate(
  url: string,
  lastModified?: string,
  etag?: string,
): Promise<{ hasUpdate: boolean; lastModified?: string; etag?: string }> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http

    const req = client.request(url, { method: 'HEAD' }, (res) => {
      const newLastModified = res.headers['last-modified'] as string
      const newEtag = res.headers['etag'] as string

      let hasUpdate = false

      // 检查 Last-Modified
      if (lastModified && newLastModified) {
        hasUpdate = new Date(newLastModified) > new Date(lastModified)
      }

      // 检查 ETag（优先级更高）
      if (etag && newEtag) {
        hasUpdate = etag !== newEtag
      }

      // 如果没有缓存信息，假设有更新
      if (!lastModified && !etag) {
        hasUpdate = true
      }

      resolve({
        hasUpdate,
        lastModified: newLastModified,
        etag: newEtag,
      })
    })

    req.on('error', reject)
    req.setTimeout(5000, () => {
      req.destroy()
      reject(new Error('检查更新超时'))
    })

    req.end()
  })
}

// 导出URL检查函数
export { isUrl }

/**
 * 验证配置文件格式
 */
function validateConfig(config: McpServersConfig): void {
  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    throw new Error('配置文件必须包含 mcpServers 对象')
  }

  const serverNames = Object.keys(config.mcpServers)
  if (serverNames.length === 0) {
    throw new Error('配置文件中必须至少包含一个服务器配置')
  }

  // 验证每个服务器配置
  for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
    validateServerConfig(serverName, serverConfig)
  }

  // 检查端口冲突（如果配置了不同的端口）
  checkPortConflicts(config.mcpServers)
}

/**
 * 验证单个服务器配置
 */
function validateServerConfig(
  serverName: string,
  config: McpServerConfig,
): void {
  // 检查输入模式（必须有且只有一种）
  const inputModes = [config.stdio, config.sse, config.api].filter(Boolean)
  if (inputModes.length === 0) {
    throw new Error(
      `服务器 ${serverName}: 必须指定 stdio、sse 或 api 输入模式之一`,
    )
  }
  if (inputModes.length > 1) {
    throw new Error(
      `服务器 ${serverName}: 只能指定一种输入模式（stdio、sse 或 api）`,
    )
  }

  // 检查输出传输
  if (!config.outputTransport) {
    throw new Error(`服务器 ${serverName}: 必须指定 outputTransport`)
  }

  const validOutputTransports = ['sse', 'ws', 'streamable-http']
  if (!validOutputTransports.includes(config.outputTransport)) {
    throw new Error(
      `服务器 ${serverName}: outputTransport 必须是 ${validOutputTransports.join(', ')} 之一`,
    )
  }

  // API模式需要apiHost
  if (config.api && !config.apiHost) {
    throw new Error(`服务器 ${serverName}: 使用 API 模式时必须指定 apiHost`)
  }

  // 验证路径配置
  if (config.httpPath && !config.httpPath.startsWith('/')) {
    throw new Error(`服务器 ${serverName}: httpPath 必须以 / 开头`)
  }
  if (config.ssePath && !config.ssePath.startsWith('/')) {
    throw new Error(`服务器 ${serverName}: ssePath 必须以 / 开头`)
  }
  if (config.messagePath && !config.messagePath.startsWith('/')) {
    throw new Error(`服务器 ${serverName}: messagePath 必须以 / 开头`)
  }
}

/**
 * 检查端口冲突
 */
function checkPortConflicts(servers: Record<string, McpServerConfig>): void {
  const usedPorts = new Map<number, string>()

  for (const [serverName, config] of Object.entries(servers)) {
    if (config.port) {
      const existingServer = usedPorts.get(config.port)
      if (existingServer) {
        throw new Error(
          `端口冲突: 服务器 ${serverName} 和 ${existingServer} 都使用端口 ${config.port}`,
        )
      }
      usedPorts.set(config.port, serverName)
    }
  }
}

/**
 * 获取服务器配置的默认值
 */
export function getServerConfigDefaults(
  config: McpServerConfig,
): Required<McpServerConfig> {
  return {
    stdio: config.stdio || '',
    sse: config.sse || '',
    api: config.api || '',
    apiHost: config.apiHost || '',
    ignoreHeader: config.ignoreHeader || false,
    outputTransport: config.outputTransport,
    port: config.port || 8000,
    ssePath: config.ssePath || '/sse',
    messagePath: config.messagePath || '/message',
    httpPath: config.httpPath || '/mcp',
    baseUrl: config.baseUrl || '',
    logLevel: config.logLevel || 'info',
    cors: config.cors || [],
    healthEndpoint: config.healthEndpoint || [],
    header: config.header || [],
    oauth2Bearer: config.oauth2Bearer || '',
  }
}
