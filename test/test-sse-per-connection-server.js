import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function assertCreatesServerNearConnect(source, serverClassName) {
  const connectIndex = source.indexOf('.connect(sseTransport)')
  assert.notEqual(connectIndex, -1, 'expected SSE transport connect call')

  const precedingBlock = source.slice(
    Math.max(0, connectIndex - 500),
    connectIndex,
  )
  assert.match(
    precedingBlock,
    new RegExp(`new\\s+${serverClassName}\\s*\\(`),
    `expected a fresh ${serverClassName} to be created for each SSE connection`,
  )
}

{
  const source = readSource('src/gateways/stdioToSse.ts')
  assertCreatesServerNearConnect(source, 'Server')
}

{
  const source = readSource('src/gateways/apiToSse.ts')
  assert.match(
    source,
    /function\s+createMcpServer\s*\(\)\s*\{/,
    'apiToSse must expose a per-connection McpServer factory',
  )
  assert.match(
    source,
    /const\s+mcpServer\s*=\s*createMcpServer\s*\(\)\s*\n\s*await\s+mcpServer\.connect\(sseTransport\)/,
    'apiToSse must create a fresh McpServer immediately before connecting each SSE transport',
  )
  assert.match(
    source,
    /function\s+createMcpServer\s*\(\)\s*\{[\s\S]*?new\s+McpServer\s*\(/,
    'apiToSse factory must create a new McpServer instance',
  )
}

console.log(
  'SSE gateways create one MCP server/protocol instance per connection',
)
