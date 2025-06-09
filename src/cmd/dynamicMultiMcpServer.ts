#!/usr/bin/env node

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { Logger, McpServersConfig, McpServerConfig } from '../types.js'
import {
  loadMcpServersConfig,
  getServerConfigDefaults,
} from '../lib/configLoader.js'
import { DynamicRouter } from '../server/dynamicRouter.js'
import { stdioToStreamableHttp } from '../gateways/stdioToStreamableHttp.js'
import { sseToStreamableHttp } from '../gateways/sseToStreamableHttp.js'
import { apiToStreamableHttp } from '../gateways/apiToStreamableHttp.js'
import { stdioToSse } from '../gateways/stdioToSse.js'
import { apiToSse } from '../gateways/apiToSse.js'
import { corsOrigin } from '../lib/corsOrigin.js'
import { headers } from '../lib/headers.js'

interface Args {
  config: string
  port?: number
  routerPort?: number
  logLevel?: 'info' | 'none'
  cors?: string[]
  healthEndpoint?: string[]
  header?: string[]
  oauth2Bearer?: string
}

const log = (...args: any[]) => console.log('[DynamicMultiMcpServer]', ...args)
const logStderr = (...args: any[]) =>
  console.error('[DynamicMultiMcpServer]', ...args)

const noneLogger: Logger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
}

const getLogger = (logLevel: string): Logger => {
  if (logLevel === 'none') {
    return noneLogger
  }

  return {
    info: log,
    error: logStderr,
    warn: logStderr,
    debug: log,
  }
}

interface ServerProcess {
  name: string
  config: Required<McpServerConfig>
  baseUrl: string
  process?: Promise<any>
}

async function startSingleServer(
  name: string,
  config: McpServerConfig,
  logger: Logger,
): Promise<ServerProcess> {
  const configWithDefaults = getServerConfigDefaults(config)
  const baseUrl = `http://localhost:${configWithDefaults.port}`

  logger.info(`启动服务器 ${name} 在端口 ${configWithDefaults.port}`)
  logger.info(
    `  - 输入模式: ${configWithDefaults.stdio ? 'stdio' : configWithDefaults.sse ? 'sse' : 'api'}`,
  )
  logger.info(`  - 输出传输: ${configWithDefaults.outputTransport}`)
  logger.info(`  - 访问路径: ${baseUrl}${configWithDefaults.httpPath}`)

  const argsWithDefaults = {
    cors: configWithDefaults.cors,
    header: configWithDefaults.header,
    healthEndpoint: configWithDefaults.healthEndpoint,
    oauth2Bearer: configWithDefaults.oauth2Bearer,
  }

  let serverProcess: Promise<any>

  try {
    if (configWithDefaults.stdio) {
      if (configWithDefaults.outputTransport === 'streamable-http') {
        serverProcess = stdioToStreamableHttp({
          stdioCmd: configWithDefaults.stdio,
          port: configWithDefaults.port,
          baseUrl: configWithDefaults.baseUrl,
          httpPath: configWithDefaults.httpPath,
          logger,
          corsOrigin: corsOrigin({ argv: argsWithDefaults }),
          healthEndpoints: argsWithDefaults.healthEndpoint,
          headers: headers({
            argv: argsWithDefaults,
            logger,
          }),
        })
      } else if (configWithDefaults.outputTransport === 'sse') {
        serverProcess = stdioToSse({
          stdioCmd: configWithDefaults.stdio,
          port: configWithDefaults.port,
          baseUrl: configWithDefaults.baseUrl,
          ssePath: configWithDefaults.ssePath,
          messagePath: configWithDefaults.messagePath,
          logger,
          corsOrigin: corsOrigin({ argv: argsWithDefaults }),
          healthEndpoints: argsWithDefaults.healthEndpoint,
          headers: headers({
            argv: argsWithDefaults,
            logger,
          }),
        })
      } else {
        throw new Error(
          `服务器 ${name}: stdio模式不支持输出传输 ${configWithDefaults.outputTransport}`,
        )
      }
    } else if (configWithDefaults.sse) {
      if (configWithDefaults.outputTransport === 'streamable-http') {
        serverProcess = sseToStreamableHttp({
          sseUrl: configWithDefaults.sse,
          port: configWithDefaults.port,
          httpPath: configWithDefaults.httpPath,
          logger,
          corsOrigin: corsOrigin({ argv: argsWithDefaults }),
          healthEndpoints: argsWithDefaults.healthEndpoint,
          headers: headers({
            argv: argsWithDefaults,
            logger,
          }),
        })
      } else {
        throw new Error(
          `服务器 ${name}: sse模式不支持输出传输 ${configWithDefaults.outputTransport}`,
        )
      }
    } else if (configWithDefaults.api) {
      if (configWithDefaults.outputTransport === 'streamable-http') {
        serverProcess = apiToStreamableHttp({
          mcpTemplateFile: configWithDefaults.api,
          apiHost: configWithDefaults.apiHost,
          port: configWithDefaults.port,
          httpPath: configWithDefaults.httpPath,
          logger,
          corsOrigin: corsOrigin({ argv: argsWithDefaults }),
          healthEndpoints: argsWithDefaults.healthEndpoint,
          headers: headers({
            argv: argsWithDefaults,
            logger,
          }),
          ignoreHeader: configWithDefaults.ignoreHeader,
        })
      } else if (configWithDefaults.outputTransport === 'sse') {
        serverProcess = apiToSse({
          mcpTemplateFile: configWithDefaults.api,
          apiHost: configWithDefaults.apiHost,
          port: configWithDefaults.port,
          ssePath: configWithDefaults.ssePath,
          messagePath: configWithDefaults.messagePath,
          logger,
          corsOrigin: corsOrigin({ argv: argsWithDefaults }),
          healthEndpoints: argsWithDefaults.healthEndpoint,
          headers: headers({
            argv: argsWithDefaults,
            logger,
          }),
          ignoreHeader: configWithDefaults.ignoreHeader,
        })
      } else {
        throw new Error(
          `服务器 ${name}: api模式不支持输出传输 ${configWithDefaults.outputTransport}`,
        )
      }
    } else {
      throw new Error(`服务器 ${name}: 未知的输入模式`)
    }

    return {
      name,
      config: configWithDefaults,
      baseUrl,
      process: serverProcess,
    }
  } catch (error) {
    logger.error(
      `服务器 ${name} 启动过程出现错误:`,
      error instanceof Error ? error.message : error,
    )
    throw error
  }
}

async function main() {
  const args = yargs(hideBin(process.argv))
    .option('config', {
      type: 'string',
      alias: 'c',
      demandOption: true,
      description: 'MCP服务器配置文件路径或远程URL',
    })
    .option('port', {
      type: 'number',
      alias: 'p',
      default: 80,
      description: '对外暴露的统一端口（Nginx端口）',
    })
    .option('routerPort', {
      type: 'number',
      alias: 'r',
      default: 80,
      description: '动态路由器服务端口',
    })
    .option('logLevel', {
      type: 'string',
      choices: ['info', 'none'] as const,
      default: 'info',
      description: '日志级别',
    })
    .option('cors', {
      type: 'array',
      description: '启用CORS，允许的源',
    })
    .option('healthEndpoint', {
      type: 'array',
      default: [],
      description: '健康检查端点',
    })
    .option('header', {
      type: 'array',
      default: [],
      description: '请求头',
    })
    .option('oauth2Bearer', {
      type: 'string',
      description: 'OAuth2 Bearer token',
    })
    .help()
    .parseSync() as Args

  const logger = getLogger(args.logLevel || 'info')

  try {
    logger.info('开始启动动态多MCP服务器...')
    logger.info(`配置文件: ${args.config}`)
    logger.info(`统一端口: ${args.port} (对外)`)
    logger.info(`路由器端口: ${args.routerPort}`)

    // 加载配置
    const config = await loadMcpServersConfig(args.config)
    const serverProcesses: ServerProcess[] = []

    // 启动所有MCP服务器
    logger.info('\n📡 启动MCP服务器...')
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        const serverProcess = await startSingleServer(
          name,
          serverConfig,
          logger,
        )
        serverProcesses.push(serverProcess)

        // 给服务器一些启动时间
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        if (error instanceof Error && error.message.includes('EADDRINUSE')) {
          logger.error(
            `⚠️ 端口冲突 - 服务器 ${name}: 端口 ${serverConfig.port} 已被占用`,
          )
          logger.error(
            `💡 提示: 请检查是否有其他进程在使用该端口，或修改配置文件中的端口号`,
          )
        } else {
          logger.error(
            `❌ 启动服务器 ${name} 失败:`,
            error instanceof Error ? error.message : error,
          )
        }
        logger.error(`跳过服务器 ${name}，继续启动其他服务器...`)
      }
    }

    if (serverProcesses.length === 0) {
      logger.error('没有成功启动任何MCP服务器')
      process.exit(1)
    }

    logger.info(`\n✅ 成功启动 ${serverProcesses.length} 个MCP服务器`)

    // 启动动态路由器
    logger.info('\n🔀 启动动态路由器...')
    const dynamicRouter = new DynamicRouter({
      configFile: args.config,
      port: args.routerPort || 80,
      logLevel: args.logLevel || 'info',
      cors: args.cors,
      healthEndpoint: args.healthEndpoint,
    })

    await dynamicRouter.start()

    logger.info('\n🎉 所有服务已启动完成!')
    const unifiedPort = args.port || 80
    const routerPort = args.routerPort || 80

    logger.info('\n📋 服务信息:')
    logger.info(`  🌐 统一入口: http://localhost:${routerPort}`)
    logger.info(`  📊 服务器状态: http://localhost:${routerPort}/servers`)
    logger.info(`  💚 健康检查: http://localhost:${routerPort}/health`)

    logger.info('\n🔗 访问路径:')
    serverProcesses.forEach((server) => {
      if (server.config.outputTransport === 'streamable-http') {
        logger.info(
          `  - ${server.name}: http://localhost:${routerPort}/${server.name}${server.config.httpPath}`,
        )
      } else if (server.config.outputTransport === 'sse') {
        logger.info(
          `  - ${server.name} (SSE): http://localhost:${routerPort}/${server.name}${server.config.ssePath}`,
        )
        logger.info(
          `  - ${server.name} (MSG): http://localhost:${routerPort}/${server.name}${server.config.messagePath}`,
        )
      }
    })

    logger.info('\n📝 说明:')
    logger.info('  - 配置文件会被自动监听，修改后无需重启服务')
    logger.info('  - 所有请求通过统一端口进入，自动路由到对应的MCP服务器')
    logger.info('  - 服务器不可用时会自动检测并返回相应错误')
    logger.info('  - 按 Ctrl+C 停止所有服务')

    // 等待进程信号
    await new Promise(() => {
      // 保持进程运行
    })
  } catch (error) {
    logger.error('启动动态多MCP服务器失败:', error)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
