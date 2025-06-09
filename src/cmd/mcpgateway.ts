#!/usr/bin/env node

import { spawn } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ES模块中获取__dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 检测是否为多服务器模式的参数
function isMultiServerMode(args: string[]): boolean {
  // 检查是否有多服务器特有的参数
  const multiServerFlags = ['--config', '--routerPort']

  // 检查是否有 --config 参数
  const hasConfigFlag = args.some((arg) => multiServerFlags.includes(arg))
  if (hasConfigFlag) {
    return true
  }

  // 检查是否有配置文件路径（以 .json 结尾且不是其他参数的值）
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const prevArg = i > 0 ? args[i - 1] : ''

    // 如果是 .json 文件且前一个参数不是需要值的参数
    if (arg.endsWith('.json') && !prevArg.startsWith('--')) {
      return true
    }
  }

  return false
}

// 检测是否为单服务器模式的参数
function isSingleServerMode(args: string[]): boolean {
  const singleServerFlags = [
    '--stdio',
    '--sse',
    '--api',
    '--outputTransport',
    '--port',
    '--baseUrl',
    '--ssePath',
    '--messagePath',
    '--httpPath',
    '--apiHost',
    '--ignoreHeader',
    '--header',
    '--oauth2Bearer',
    '--cors',
    '--healthEndpoint',
    '--logLevel',
  ]

  return args.some((arg) => singleServerFlags.includes(arg))
}

// 主函数
async function main() {
  const args = process.argv.slice(2)

  // 如果没有参数或只有 help/version，显示帮助信息
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
McpGateway - Unified MCP Protocol Gateway

Usage:
  mcpgateway [options]

Single Server Mode:
  mcpgateway --stdio "command"                    # Run MCP stdio server
  mcpgateway --sse "url"                         # Connect to SSE server
  mcpgateway --api "spec.json" --apiHost "url"   # Convert OpenAPI to MCP

Multi Server Mode:
  mcpgateway --config config.json               # Run multiple servers
  mcpgateway config.json                        # Auto-detect config file

Options:
  --stdio "command"              Command to run MCP stdio server
  --sse "url"                    SSE URL to connect to
  --api "file/url"               OpenAPI spec or MCP template
  --config "file/url"            Multi-server configuration
  --outputTransport <type>       Output transport (sse|ws|streamable-http|stdio)
  --port <number>                Port to listen on (default: 8000)
  --routerPort <number>          Router port for multi-server (default: 80)
  --baseUrl "url"                Base URL for clients
  --apiHost "url"                API server base URL
  --ignoreHeader                 Ignore header parameters in OpenAPI
  --logLevel <level>             Logging level (info|none)
  --cors                         Enable CORS
  --help, -h                     Show this help
  --version, -v                  Show version

Examples:
  # Single server - stdio to SSE
  mcpgateway --stdio "npx @modelcontextprotocol/server-filesystem ." --port 8000
  
  # Single server - OpenAPI to Streamable HTTP
  mcpgateway --api openapi.json --apiHost https://api.example.com --outputTransport streamable-http
  
  # Multi server - config file
  mcpgateway --config mcp-servers.json
  
  # Multi server - auto-detect
  mcpgateway mcp-servers.json

For more information, visit: https://github.com/michlyn/mcpgateway
`)
    process.exit(0)
  }

  if (args.includes('--version') || args.includes('-v')) {
    // 读取package.json获取版本信息
    try {
      const fs = await import('fs')
      const path = await import('path')
      const { readFileSync } = fs
      const packagePath = path.resolve(__dirname, '../../package.json')
      const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
      console.log(pkg.version)
    } catch (error) {
      console.log('3.0.15') // fallback version
    }
    process.exit(0)
  }

  // 决定运行模式
  const isMultiMode = isMultiServerMode(args)
  const isSingleMode = isSingleServerMode(args)

  let targetScript: string
  let mode: string

  if (isMultiMode && !isSingleMode) {
    // 明确的多服务器模式
    targetScript = resolve(__dirname, 'dynamicMultiMcpServer.js')
    mode = 'multi-server'
  } else if (isSingleMode && !isMultiMode) {
    // 明确的单服务器模式
    targetScript = resolve(__dirname, '../index.js')
    mode = 'single-server'
  } else if (isMultiMode && isSingleMode) {
    // 参数冲突，优先多服务器模式
    console.log(
      '🔄 Detected both single and multi-server parameters, defaulting to multi-server mode',
    )
    targetScript = resolve(__dirname, 'dynamicMultiMcpServer.js')
    mode = 'multi-server'
  } else {
    // 无法确定模式，默认多服务器
    console.log(
      '🔄 Unable to determine mode from parameters, defaulting to multi-server mode',
    )
    targetScript = resolve(__dirname, 'dynamicMultiMcpServer.js')
    mode = 'multi-server'
  }

  console.log(`🚀 Starting McpGateway in ${mode} mode...`)

  // 启动对应的脚本
  const child = spawn('node', [targetScript, ...args], {
    stdio: 'inherit',
    env: process.env,
  })

  child.on('exit', (code) => {
    process.exit(code || 0)
  })

  child.on('error', (error) => {
    console.error('Failed to start McpGateway:', error)
    process.exit(1)
  })
}

// 处理信号
process.on('SIGINT', () => {
  console.log('\n👋 McpGateway shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n👋 McpGateway shutting down...')
  process.exit(0)
})

main()
