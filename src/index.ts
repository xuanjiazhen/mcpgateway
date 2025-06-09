#!/usr/bin/env node
/**
 * index.ts
 *
 * Run MCP stdio servers over SSE, convert between stdio, SSE, WS.
 *
 * Usage:
 *   # stdio→SSE
 *   npx -y mcpgateway --stdio "npx -y @modelcontextprotocol/server-filesystem /" \
 *                       --port 8000 --baseUrl http://localhost:8000 --ssePath /sse --messagePath /message
 *
 *   # SSE→stdio
 *   npx -y mcpgateway --sse "https://mcp-server-ab71a6b2-cd55-49d0-adba-562bc85956e3.supermachine.app"
 *
 *   # stdio→WS
 *   npx -y mcpgateway --stdio "npx -y @modelcontextprotocol/server-filesystem /" --outputTransport ws
 *
 *   # stdio→Streamable HTTP
 *   npx -y mcpgateway --stdio "npx -y @modelcontextprotocol/server-filesystem /" --outputTransport streamable-http --httpPath /mcp
 *
 *   # SSE→Streamable HTTP
 *   npx -y mcpgateway --sse "https://mcp-server-ab71a6b2-cd55-49d0-adba-562bc85956e3.supermachine.app" --outputTransport streamable-http --httpPath /mcp
 */

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { Logger } from './types.js'
import { stdioToSse } from './gateways/stdioToSse.js'
import { sseToStdio } from './gateways/sseToStdio.js'
import { stdioToWs } from './gateways/stdioToWs.js'
import { stdioToStreamableHttp } from './gateways/stdioToStreamableHttp.js'
import { sseToStreamableHttp } from './gateways/sseToStreamableHttp.js'
import { headers } from './lib/headers.js'
import { corsOrigin } from './lib/corsOrigin.js'
import { apiToStreamableHttp } from './gateways/apiToStreamableHttp.js'
import { apiToSse } from './gateways/apiToSse.js'
import { parseArgs } from './lib/parseArgs.js'

const log = (...args: any[]) => console.log('[mcpgateway]', ...args)
const logStderr = (...args: any[]) => console.error('[mcpgateway]', ...args)

const noneLogger: Logger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
}

const getLogger = ({
  logLevel,
  outputTransport,
}: {
  logLevel: string
  outputTransport: string
}): Logger => {
  if (logLevel === 'none') {
    return noneLogger
  }

  if (outputTransport === 'stdio') {
    return {
      info: logStderr,
      error: logStderr,
      warn: logStderr,
      debug: logStderr,
    }
  }

  return {
    info: log,
    error: logStderr,
    warn: logStderr,
    debug: log,
  }
}

/**
 * 处理命令拆分，确保正确启动子进程
 */
function parseCommand(cmdString: string): { command: string; args: string[] } {
  const parts = cmdString.split(/\s+/).filter((part) => part.length > 0)
  return {
    command: parts[0],
    args: parts.slice(1),
  }
}

interface Args {
  stdio?: string
  sse?: string
  config?: string
  outputTransport?: string
  port?: number
  baseUrl?: string
  ssePath?: string
  messagePath?: string
  httpPath?: string
  logLevel?: 'info' | 'none'
  cors?: string[]
  healthEndpoint?: string[]
  header?: string[]
  oauth2Bearer?: string
  api?: string
  apiHost?: string
  ignoreHeader?: boolean
}

async function main() {
  const args = parseArgs<Args>({
    stdio: {
      type: String,
      description: 'Command to run an MCP server over Stdio',
    },
    sse: {
      type: String,
      description: 'SSE URL to connect to',
    },
    config: {
      type: String,
      description: 'Multi-server configuration file (JSON format)',
    },
    outputTransport: {
      type: String,
      choices: ['stdio', 'sse', 'ws', 'streamable-http'],
      default: () => {
        const argv = hideBin(process.argv)

        if (argv.includes('--stdio')) return 'sse'
        if (argv.includes('--sse')) return 'stdio'

        return undefined
      },
      description:
        'Transport for output. Default is "sse" when using --stdio and "stdio" when using --sse. API supports "streamable-http" and "sse".',
    },
    port: {
      type: Number,
      default: 8000,
      description:
        '(stdio→SSE/WS/Streamable-HTTP, SSE→Streamable-HTTP) Port for output MCP server',
    },
    baseUrl: {
      type: String,
      default: '',
      description: '(stdio→SSE/Streamable-HTTP) Base URL for output MCP server',
    },
    ssePath: {
      type: String,
      default: '/sse',
      description: '(stdio→SSE, api→SSE) Path for SSE subscriptions',
    },
    messagePath: {
      type: String,
      default: '/message',
      description: '(stdio→SSE/WS, api→SSE) Path for messages',
    },
    httpPath: {
      type: String,
      default: '/mcp',
      description:
        '(stdio→Streamable-HTTP, SSE→Streamable-HTTP) Path for Streamable HTTP',
    },
    logLevel: {
      type: String,
      choices: ['info', 'none'] as const,
      default: 'info',
      description: 'Logging level',
    },
    cors: {
      type: Array,
      description:
        'Enable CORS. Use --cors with no values to allow all origins, or supply one or more allowed origins (e.g. --cors "http://example.com" or --cors "/example\\.com$/" for regex matching).',
    },
    healthEndpoint: {
      type: Array,
      default: [],
      description:
        'One or more endpoints returning "ok", e.g. --healthEndpoint /healthz --healthEndpoint /readyz',
    },
    header: {
      type: Array,
      default: [],
      description:
        'Headers to be added to the request headers, e.g. --header "x-user-id: 123"',
    },
    oauth2Bearer: {
      type: String,
      description:
        'Authorization header to be added, e.g. --oauth2Bearer "some-access-token" adds "Authorization: Bearer some-access-token"',
    },
    api: {
      type: String,
      description:
        'MCP模板文件路径（JSON或YAML格式）或远程文件URL（支持http://和https://）',
    },
    apiHost: {
      type: String,
      description: 'API 服务的基础 URL',
    },
    ignoreHeader: {
      type: Boolean,
      default: false,
      description:
        '忽略OpenAPI接口文档中定义的header参数，不进行转换（默认：false）',
    },
  })

  const hasStdio = Boolean(args.stdio)
  const hasSse = Boolean(args.sse)
  const hasApi = Boolean(args.api)
  const hasConfig = Boolean(args.config)

  // 检查输入参数
  const inputCount = [hasStdio, hasSse, hasApi, hasConfig].filter(
    Boolean,
  ).length
  if (inputCount > 1) {
    logStderr('Error: 只能指定 --stdio、--sse、--api 或 --config 中的一个参数')
    process.exit(1)
  }
  if (inputCount === 0) {
    logStderr('Error: 必须指定 --stdio、--sse、--api 或 --config 参数之一')
    process.exit(1)
  }

  if (hasApi && !args.apiHost) {
    logStderr('Error: 使用 --api 时必须指定 --apiHost 参数')
    process.exit(1)
  }

  const logger = getLogger({
    logLevel: args.logLevel as string,
    outputTransport: args.outputTransport as string,
  })

  logger.info('Starting...')
  logger.info('@michlyn/mcpgateway is supported by michlyn@qq.com')
  logger.info(`  - outputTransport: ${args.outputTransport}`)

  const argsWithDefaults = {
    ...args,
    cors: args.cors || [],
    header: args.header || [],
    healthEndpoint: args.healthEndpoint || [],
  }

  try {
    if (hasStdio) {
      if (args.outputTransport === 'sse') {
        await stdioToSse({
          stdioCmd: args.stdio!,
          port: args.port!,
          baseUrl: args.baseUrl || '',
          ssePath: args.ssePath || '',
          messagePath: args.messagePath || '',
          logger,
          corsOrigin: corsOrigin({ argv: argsWithDefaults }),
          healthEndpoints: argsWithDefaults.healthEndpoint,
          headers: headers({
            argv: argsWithDefaults,
            logger,
          }),
        })
      } else if (args.outputTransport === 'ws') {
        await stdioToWs({
          stdioCmd: args.stdio!,
          port: args.port!,
          messagePath: args.messagePath || '',
          logger,
          corsOrigin: corsOrigin({ argv: argsWithDefaults }),
          healthEndpoints: argsWithDefaults.healthEndpoint,
        })
      } else if (args.outputTransport === 'streamable-http') {
        await stdioToStreamableHttp({
          stdioCmd: args.stdio!,
          port: args.port!,
          baseUrl: args.baseUrl || '',
          httpPath: args.httpPath || '',
          logger,
          corsOrigin: corsOrigin({ argv: argsWithDefaults }),
          healthEndpoints: argsWithDefaults.healthEndpoint,
          headers: headers({
            argv: argsWithDefaults,
            logger,
          }),
        })
      } else {
        logStderr(`Error: stdio→${args.outputTransport} not supported`)
        process.exit(1)
      }
    } else if (hasSse) {
      if (args.outputTransport === 'stdio') {
        await sseToStdio({
          sseUrl: args.sse!,
          logger,
          headers: headers({
            argv: argsWithDefaults,
            logger,
          }),
        })
      } else if (args.outputTransport === 'streamable-http') {
        await sseToStreamableHttp({
          sseUrl: args.sse!,
          port: args.port!,
          httpPath: args.httpPath || '',
          logger,
          corsOrigin: corsOrigin({ argv: argsWithDefaults }),
          healthEndpoints: argsWithDefaults.healthEndpoint,
          headers: headers({
            argv: argsWithDefaults,
            logger,
          }),
        })
      } else {
        logStderr(`Error: sse→${args.outputTransport} not supported`)
        process.exit(1)
      }
    } else if (args.api) {
      if (args.outputTransport === 'streamable-http') {
        await apiToStreamableHttp({
          mcpTemplateFile: args.api,
          apiHost: args.apiHost!,
          port: args.port || 8000,
          httpPath: args.httpPath || '/mcp',
          logger,
          corsOrigin: corsOrigin({ argv: argsWithDefaults }),
          healthEndpoints: argsWithDefaults.healthEndpoint,
          headers: headers({
            argv: argsWithDefaults,
            logger,
          }),
          ignoreHeader: args.ignoreHeader || false,
        })
      } else if (args.outputTransport === 'sse') {
        await apiToSse({
          mcpTemplateFile: args.api,
          apiHost: args.apiHost!,
          port: args.port || 8000,
          ssePath: args.ssePath || '/sse',
          messagePath: args.messagePath || '/message',
          logger,
          corsOrigin: corsOrigin({ argv: argsWithDefaults }),
          healthEndpoints: argsWithDefaults.healthEndpoint,
          headers: headers({
            argv: argsWithDefaults,
            logger,
          }),
          ignoreHeader: args.ignoreHeader || false,
        })
      } else {
        throw new Error('API 模式只支持 streamable-http 和 sse 输出传输方式')
      }
    } else if (hasConfig) {
      logStderr('Error: 多服务器配置模式请使用 multi-mcp-server 命令')
      logStderr('用法: npx multi-mcp-server --config mcp-servers.json')
      process.exit(1)
    } else {
      logStderr('Error: Invalid input transport')
      process.exit(1)
    }
  } catch (err) {
    logStderr('Fatal error:', err)
    process.exit(1)
  }
}

main()
