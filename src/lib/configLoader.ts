import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import crypto from 'crypto'
import { McpServersConfig, McpServerConfig } from '../types.js'
import { createTimestampedLog } from '../logger.js'

const log = createTimestampedLog('[ConfigLoader]')

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
      log(`从远程URL加载配置: ${configPath}`)
      const result = await downloadConfigFromUrl(configPath)
      configContent = result.content
      log(`远程配置加载成功，大小: ${configContent.length} 字节`)
    } else {
      const absolutePath = path.resolve(configPath)

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`配置文件不存在: ${absolutePath}`)
      }

      configContent = fs.readFileSync(absolutePath, 'utf-8')
      log(`本地配置加载成功: ${absolutePath}`)
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
  lastContentHash?: string,
): Promise<{
  hasUpdate: boolean
  lastModified?: string
  etag?: string
  contentHash?: string
}> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http

    const req = client.request(url, { method: 'HEAD' }, (res) => {
      const newLastModified = res.headers['last-modified'] as string
      const newEtag = res.headers['etag'] as string

      // 检查是否需要内容哈希比较
      const needContentCheck =
        !etag &&
        (!lastModified ||
          !lastContentHash ||
          (lastModified && !newLastModified) ||
          (!lastModified && newLastModified))

      // 只在需要详细调试时打印，稍后根据结果决定是否显示

      let hasUpdate = false
      let reason = ''
      let newContentHash: string | undefined

      if (needContentCheck) {
        // 需要内容检查，重新发起GET请求
        const getReq = client.request(url, { method: 'GET' }, (getRes) => {
          let data = ''
          getRes.on('data', (chunk) => (data += chunk))
          getRes.on('end', () => {
            newContentHash = crypto
              .createHash('sha256')
              .update(data)
              .digest('hex')

            if (lastContentHash && lastContentHash === newContentHash) {
              hasUpdate = false
              reason = '内容哈希匹配，无需更新'
            } else if (!lastContentHash) {
              hasUpdate = false // 首次获取内容哈希，不算更新
              reason = '首次获取内容哈希，跳过更新'
            } else {
              hasUpdate = true
              reason = `内容哈希不匹配: ${lastContentHash} != ${newContentHash}`
            }

            // 只有在需要更新时才打印详细信息
            if (hasUpdate) {
              log(`检测到配置更新:`)
              log(`  URL: ${url}`)
              log(`  检查方式: 内容哈希比较`)
              log(`  缓存的内容哈希: ${lastContentHash || '(无)'}`)
              log(`  服务器内容哈希: ${newContentHash}`)
              log(`  更新原因: ${reason}`)
            }

            resolve({
              hasUpdate,
              lastModified: newLastModified,
              etag: newEtag,
              contentHash: newContentHash,
            })
          })
        })

        getReq.on('error', reject)
        getReq.setTimeout(10000, () => {
          getReq.destroy()
          reject(new Error('内容检查超时'))
        })
        getReq.end()
      } else {
        // 使用头部信息比较
        // 优先检查 ETag（更可靠）
        if (etag && newEtag) {
          hasUpdate = etag !== newEtag
          reason = hasUpdate
            ? `ETag不匹配: ${etag} != ${newEtag}`
            : 'ETag匹配，无需更新'
        } else if (lastModified && newLastModified) {
          // 如果没有ETag，检查 Last-Modified
          const oldDate = new Date(lastModified)
          const newDate = new Date(newLastModified)
          hasUpdate = newDate > oldDate
          reason = hasUpdate
            ? `Last-Modified更新: ${lastModified} -> ${newLastModified}`
            : `Last-Modified未变更: ${lastModified}`
        } else if (!lastModified && !etag) {
          // 第一次检查，如果服务器支持缓存头部就不更新，否则切换到内容检查
          if (newLastModified || newEtag) {
            hasUpdate = false // 服务器支持缓存验证，首次不算更新
            reason = '首次检查，服务器支持缓存验证，跳过更新'
          } else {
            hasUpdate = true // 将在下次切换到内容检查
            reason =
              '首次检查，服务器不支持缓存验证，执行更新并切换到内容检查模式'
          }
        } else {
          // 服务器缓存头部不一致，切换到内容哈希模式
          hasUpdate = true
          reason = '服务器缓存头部不一致，切换到内容哈希模式进行检查'
        }

        // 只有在需要更新时才打印详细信息
        if (hasUpdate) {
          log(`检测到配置更新:`)
          log(`  URL: ${url}`)
          log(`  检查方式: 头部比较`)
          log(`  缓存的 Last-Modified: ${lastModified || '(无)'}`)
          log(`  服务器 Last-Modified: ${newLastModified || '(无)'}`)
          log(`  缓存的 ETag: ${etag || '(无)'}`)
          log(`  服务器 ETag: ${newEtag || '(无)'}`)
          log(`  更新原因: ${reason}`)
        }

        resolve({
          hasUpdate,
          lastModified: newLastModified,
          etag: newEtag,
          contentHash: newContentHash,
        })
      }
    })

    req.on('error', reject)
    req.setTimeout(10000, () => {
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
