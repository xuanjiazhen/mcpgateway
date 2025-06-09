import express from 'express'
import cors from 'cors'
import { createProxyMiddleware } from 'http-proxy-middleware'
import fs from 'fs'
import path from 'path'
import { Logger, McpServersConfig } from '../types.js'
import http from 'http'
import {
  loadMcpServersConfig,
  checkRemoteConfigUpdate,
  isUrl,
} from '../lib/configLoader.js'

export interface DynamicRouterOptions {
  configFile: string
  port: number
  logLevel: 'info' | 'none'
  cors?: string[]
  healthEndpoint?: string[]
}

interface ServerRoute {
  name: string
  port: number
  httpPath: string
  ssePath: string
  messagePath: string
  outputTransport: string
  isAvailable: boolean
}

export class DynamicRouter {
  private logger: Logger
  private options: DynamicRouterOptions
  private app: express.Application
  private httpServer: http.Server | null = null
  private configPath: string
  private serverRoutes: Map<string, ServerRoute> = new Map()
  private configWatcher: fs.FSWatcher | null = null
  private remoteWatcher: NodeJS.Timeout | null = null
  private remoteLastModified?: string
  private remoteEtag?: string
  private remoteContentHash?: string

  constructor(options: DynamicRouterOptions) {
    this.options = options
    this.logger = this.createLogger()
    this.configPath = options.configFile // 保持原始路径，可能是URL
    this.app = express()
    this.setupMiddleware()
  }

  private createLogger(): Logger {
    if (this.options.logLevel === 'none') {
      return {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
      }
    }

    return {
      info: (...args: any[]) => console.log('[DynamicRouter]', ...args),
      error: (...args: any[]) => console.error('[DynamicRouter]', ...args),
      warn: (...args: any[]) => console.warn('[DynamicRouter]', ...args),
      debug: (...args: any[]) => console.log('[DynamicRouter]', ...args),
    }
  }

  private setupMiddleware(): void {
    // CORS
    this.app.use(
      cors({
        origin: true,
        credentials: true,
      }),
    )

    // 解析JSON请求体
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))

    // 健康检查端点
    this.app.get('/health', (req, res) => {
      const totalServers = this.serverRoutes.size
      const availableServers = Array.from(this.serverRoutes.values()).filter(
        (r) => r.isAvailable,
      ).length

      res.json({
        status: 'ok',
        message: 'Dynamic Router is healthy',
        servers: {
          total: totalServers,
          available: availableServers,
        },
        timestamp: new Date().toISOString(),
      })
    })

    // 服务器列表端点
    this.app.get('/servers', (req, res) => {
      const servers = Array.from(this.serverRoutes.entries()).map(
        ([name, route]) => ({
          name,
          port: route.port,
          httpPath: route.httpPath,
          ssePath: route.ssePath,
          messagePath: route.messagePath,
          outputTransport: route.outputTransport,
          isAvailable: route.isAvailable,
          urls: this.generateServerUrls(name, route),
        }),
      )

      res.json({
        message: 'Multi MCP Server Dynamic Router',
        totalServers: servers.length,
        servers,
        timestamp: new Date().toISOString(),
      })
    })

    // 直接路由处理 - /{serverName}/* 格式
    this.app.use('/:serverName/*', (req, res, next) => {
      const serverName = req.params.serverName
      const remainingPath = req.params[0] || ''

      // 跳过已知的系统路径
      if (['health', 'servers'].includes(serverName)) {
        return next()
      }

      this.handleDynamicRoute(serverName, remainingPath, req, res, next)
    })

    // 根路径显示服务器信息
    this.app.get('/', (req, res) => {
      const servers = Array.from(this.serverRoutes.entries()).map(
        ([name, route]) => ({
          name,
          available: route.isAvailable,
          paths: this.generateServerUrls(name, route),
        }),
      )

      res.json({
        message: 'Multi MCP Server Dynamic Router',
        usage: 'Access servers via /{server-name}/{path}',
        servers,
        endpoints: {
          health: '/health',
          servers: '/servers',
        },
      })
    })
  }

  private generateServerUrls(name: string, route: ServerRoute): any {
    const baseUrl = `http://localhost:${this.options.port}`

    if (route.outputTransport === 'streamable-http') {
      return {
        http: `${baseUrl}/${name}${route.httpPath}`,
      }
    } else if (route.outputTransport === 'sse') {
      return {
        sse: `${baseUrl}/${name}${route.ssePath}`,
        message: `${baseUrl}/${name}${route.messagePath}`,
      }
    }

    return {}
  }

  private async handleDynamicRoute(
    serverName: string,
    remainingPath: string,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): Promise<void> {
    const route = this.serverRoutes.get(serverName)

    if (!route) {
      this.logger.warn(`Server not found: ${serverName}`)
      res.status(404).json({
        error: 'Server not found',
        serverName,
        availableServers: Array.from(this.serverRoutes.keys()),
      })
      return
    }

    if (!route.isAvailable) {
      this.logger.warn(`Server unavailable: ${serverName}`)
      res.status(503).json({
        error: 'Server unavailable',
        serverName,
      })
      return
    }

    // 检查服务器是否在线
    const isOnline = await this.checkServerHealth(route.port)
    if (!isOnline) {
      route.isAvailable = false
      this.logger.error(`Server ${serverName} is offline`)
      res.status(503).json({
        error: 'Server offline',
        serverName,
        port: route.port,
      })
      return
    }

    // 自定义代理逻辑
    const targetUrl = `http://localhost:${route.port}`
    const proxyPath = `/${remainingPath}${req.url?.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`

    this.logger.debug(
      `Routing ${serverName}: ${req.originalUrl} -> ${targetUrl}${proxyPath}`,
    )

    // 使用自定义代理
    this.proxyRequest(req, res, targetUrl, proxyPath)
  }

  private proxyRequest(
    req: express.Request,
    res: express.Response,
    targetUrl: string,
    path: string,
  ): void {
    const url = new URL(path, targetUrl)

    // 准备请求体（如果有的话）
    let body = ''
    if (
      req.method === 'POST' ||
      req.method === 'PUT' ||
      req.method === 'PATCH'
    ) {
      if (req.body && typeof req.body === 'object') {
        body = JSON.stringify(req.body)
      } else if (typeof req.body === 'string') {
        body = req.body
      }
    }

    // 构建请求头，过滤掉可能有问题的头
    const requestHeaders: Record<string, string | string[]> = {}

    // 复制原始请求头，但跳过一些特定的头
    const skipHeaders = [
      'host',
      'content-length',
      'connection',
      'upgrade',
      'proxy-authorization',
    ]

    Object.keys(req.headers).forEach((key) => {
      if (!skipHeaders.includes(key.toLowerCase())) {
        const value = req.headers[key]
        if (value !== undefined) {
          requestHeaders[key] = value
        }
      }
    })

    // 设置目标主机和内容长度
    requestHeaders.host = url.host
    if (body) {
      requestHeaders['content-length'] = Buffer.byteLength(body).toString()
      if (!requestHeaders['content-type']) {
        requestHeaders['content-type'] = 'application/json'
      }
    }

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: req.method,
      headers: requestHeaders,
    }

    this.logger.debug(
      `Proxying ${req.method} ${req.originalUrl} -> ${url.toString()}`,
    )
    this.logger.debug(
      `Request headers:`,
      JSON.stringify(requestHeaders, null, 2),
    )

    const proxyReq = http.request(options, (proxyRes) => {
      this.logger.debug(
        `Target response: ${proxyRes.statusCode} ${proxyRes.statusMessage}`,
      )
      this.logger.debug(`Target headers:`, proxyRes.headers)

      // 设置响应状态码
      res.status(proxyRes.statusCode || 500)

      // 复制所有响应头
      Object.keys(proxyRes.headers).forEach((key) => {
        const value = proxyRes.headers[key]
        if (value !== undefined) {
          res.setHeader(key, value)
        }
      })

      // 检查是否是SSE响应，需要修改endpoint路径
      const isSSE =
        proxyRes.headers['content-type']?.includes('text/event-stream')

      if (isSSE) {
        // 对于SSE响应，需要修改endpoint数据中的路径
        let buffer = ''

        proxyRes.on('data', (chunk) => {
          buffer += chunk.toString()

          // 处理完整的事件
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // 保留最后一个不完整的行

          for (const line of lines) {
            let modifiedLine = line

            // 修改endpoint事件中的路径
            if (line.startsWith('data: /message')) {
              // 将 "/message?sessionId=xxx" 改为 "message?sessionId=xxx"
              modifiedLine = line.replace(/^data: \/message/, 'data: message')
              this.logger.debug(
                `Modified SSE endpoint: ${line} -> ${modifiedLine}`,
              )
            }

            res.write(modifiedLine + '\n')
          }
        })

        proxyRes.on('end', () => {
          // 发送最后的缓冲数据
          if (buffer) {
            let modifiedBuffer = buffer
            if (buffer.startsWith('data: /message')) {
              modifiedBuffer = buffer.replace(
                /^data: \/message/,
                'data: message',
              )
              this.logger.debug(
                `Modified final SSE endpoint: ${buffer} -> ${modifiedBuffer}`,
              )
            }
            res.write(modifiedBuffer)
          }
          res.end()
          this.logger.debug('Target response ended')
        })
      } else {
        // 非SSE响应，直接流式传输，但增加错误处理
        let responseData = ''

        proxyRes.on('data', (chunk) => {
          responseData += chunk.toString()
          res.write(chunk)
        })

        proxyRes.on('end', () => {
          this.logger.debug(
            `Response data: ${responseData.substring(0, 500)}...`,
          )
          res.end()
          this.logger.debug('Target response ended')
        })

        proxyRes.on('error', (error) => {
          this.logger.error('Target response error:', error)
          if (!res.headersSent) {
            res.status(502).json({
              error: 'Bad Gateway - Target Response Error',
              message: error.message,
            })
          } else {
            res.end()
          }
        })
      }
    })

    proxyReq.on('error', (error) => {
      this.logger.error(`Proxy request error:`, error)
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Bad Gateway',
          message: error.message,
          target: url.toString(),
        })
      }
    })

    proxyReq.on('timeout', () => {
      this.logger.error('Proxy request timeout')
      if (!res.headersSent) {
        res.status(504).json({
          error: 'Gateway Timeout',
          target: url.toString(),
        })
      }
      proxyReq.destroy()
    })

    proxyReq.setTimeout(30000) // 30秒超时

    // 发送请求数据
    if (body) {
      this.logger.debug(`Request body: ${body}`)
      proxyReq.write(body)
    }
    proxyReq.end()
  }

  private async checkServerHealth(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path: '/health',
          method: 'GET',
          timeout: 5000,
        },
        (res) => {
          resolve(res.statusCode === 200)
        },
      )

      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })

      req.end()
    })
  }

  private async loadServerRoutes(): Promise<void> {
    try {
      this.logger.info(`加载配置: ${this.configPath}`)

      // 如果是远程配置，先获取缓存信息
      if (
        isUrl(this.configPath) &&
        !this.remoteLastModified &&
        !this.remoteEtag &&
        !this.remoteContentHash
      ) {
        try {
          const result = await checkRemoteConfigUpdate(this.configPath)
          this.remoteLastModified = result.lastModified
          this.remoteEtag = result.etag
          this.remoteContentHash = result.contentHash
        } catch (error) {
          this.logger.warn('获取远程配置缓存信息失败:', error)
        }
      }

      const config = await loadMcpServersConfig(this.configPath)

      this.serverRoutes.clear()

      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        const route: ServerRoute = {
          name,
          port: serverConfig.port || 8000,
          httpPath: serverConfig.httpPath || '/mcp',
          ssePath: serverConfig.ssePath || '/sse',
          messagePath: serverConfig.messagePath || '/message',
          outputTransport: serverConfig.outputTransport,
          isAvailable: true, // 初始状态假设可用，后续会检查
        }

        this.serverRoutes.set(name, route)
        this.logger.info(`Loaded route: ${name} -> localhost:${route.port}`)
      }

      this.logger.info(`Loaded ${this.serverRoutes.size} server routes`)
    } catch (error) {
      this.logger.error('Failed to load server routes:', error)
    }
  }

  // 设置配置文件监听（本地文件或远程URL）
  private setupConfigWatcher(): void {
    if (isUrl(this.configPath)) {
      this.watchRemoteConfig()
    } else {
      this.watchLocalConfig()
    }
  }

  // 监听本地配置文件
  private watchLocalConfig(): void {
    try {
      const resolvedPath = path.resolve(this.configPath)
      this.configWatcher = fs.watch(resolvedPath, (eventType) => {
        if (eventType === 'change') {
          this.logger.info('本地配置文件已更改，重新加载路由...')
          setTimeout(() => {
            this.loadServerRoutes()
          }, 1000) // 延迟重载，避免文件写入过程中的问题
        }
      })

      this.logger.info(`监听本地配置文件: ${resolvedPath}`)
    } catch (error) {
      this.logger.error('监听本地配置文件失败:', error)
    }
  }

  // 监听远程配置文件
  private watchRemoteConfig(): void {
    const checkInterval = 30000 // 30秒检查一次

    this.logger.info(
      `开始监听远程配置: ${this.configPath} (间隔: ${checkInterval / 1000}秒)`,
    )

    this.remoteWatcher = setInterval(async () => {
      try {
        const result = await checkRemoteConfigUpdate(
          this.configPath,
          this.remoteLastModified,
          this.remoteEtag,
          this.remoteContentHash,
        )

        if (result.hasUpdate) {
          this.logger.info('检测到远程配置更新，重新加载路由...')
          this.remoteLastModified = result.lastModified
          this.remoteEtag = result.etag
          this.remoteContentHash = result.contentHash
          await this.loadServerRoutes()
        }
      } catch (error) {
        this.logger.warn('检查远程配置更新失败:', error)
      }
    }, checkInterval)
  }

  public async start(): Promise<void> {
    // 先加载配置和设置监听
    await this.loadServerRoutes()
    this.setupConfigWatcher()

    return new Promise((resolve) => {
      this.httpServer = this.app.listen(this.options.port, () => {
        this.logger.info(`Dynamic Router started on port ${this.options.port}`)
        this.logger.info(`Configuration source: ${this.configPath}`)
        this.logger.info(`Loaded ${this.serverRoutes.size} server routes`)

        // 显示路由信息
        this.serverRoutes.forEach((route, name) => {
          this.logger.info(
            `  - ${name}: localhost:${route.port} (${route.outputTransport})`,
          )
        })

        resolve()
      })

      // 处理进程退出
      process.on('SIGINT', () => this.stop())
      process.on('SIGTERM', () => this.stop())
    })
  }

  public async stop(): Promise<void> {
    this.logger.info('Stopping Dynamic Router...')

    // 停止配置文件监听
    if (this.configWatcher) {
      this.configWatcher.close()
    }

    // 停止远程配置监听
    if (this.remoteWatcher) {
      clearInterval(this.remoteWatcher)
    }

    // 停止HTTP服务器
    if (this.httpServer) {
      this.httpServer.close()
    }

    this.logger.info('Dynamic Router stopped')
    process.exit(0)
  }
}
