#!/usr/bin/env node

import fetch from 'node-fetch'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Test configuration
const TEST_PORT = 9998
const HTTP_PATH = '/mcp'
const TEST_URL = `http://localhost:${TEST_PORT}${HTTP_PATH}`

// Test OpenAPI specification for simulating the user's issue
const testOpenAPISpec = {
  openapi: '3.0.1',
  info: {
    title: 'Test API',
    version: '1.0.0',
  },
  servers: [
    {
      url: 'https://gfinsttest.gf.com.cn/api/bsp/admin/1.0.0',
    },
  ],
  paths: {
    '/bsp-admin/company/cpCompany/findPublic': {
      get: {
        operationId: 'getBsp_admin_company_cpCompany_findPublic',
        summary: 'Find public companies',
        parameters: [
          {
            name: 'page_size',
            in: 'query',
            schema: {
              type: 'integer',
            },
            required: true,
          },
          {
            name: 'page_num',
            in: 'query',
            schema: {
              type: 'integer',
            },
            required: true,
          },
          {
            name: 'page_order',
            in: 'query',
            schema: {
              type: 'integer',
            },
            required: true,
          },
          {
            name: 'search_text',
            in: 'query',
            schema: {
              type: 'string',
            },
            required: true,
          },
        ],
        responses: {
          200: {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                },
              },
            },
          },
        },
      },
    },
  },
}

// Mock server to simulate the API endpoint
async function createMockServer() {
  const express = (await import('express')).default
  const app = express()

  app.use(express.json())

  // Mock the exact endpoint from user's issue
  app.get(
    '/api/bsp/admin/1.0.0/bsp-admin/company/cpCompany/findPublic',
    (req, res) => {
      console.log(`[MockAPI] Received request with query:`, req.query)

      // Simulate the response from user's logs
      const mockResponse = {
        code: 0,
        msg: 'success',
        data: {
          total: 0,
          page_size: parseInt(req.query.page_size) || 10,
          page_num: parseInt(req.query.page_num) || 1,
          page_order: req.query.page_order || '1',
          search_text: req.query.search_text || '',
          data: [
            {
              credit_no: '91440000126335439C',
              ecif_uid: null,
              en_name: 'GfSecuritiesCo.,Ltd.',
              full_name: '广发证券股份有限公司',
              id: 'EU011025074031552546226',
              org_no: '126335439',
              reg_no: '222400000001337',
            },
            {
              credit_no: '',
              ecif_uid: null,
              en_name: '',
              full_name: '广发证券股份有限公司',
              id: 'EU007263067341865914758',
              org_no: '',
              reg_no: '440000000015257',
            },
          ],
        },
      }

      // Add some delay to simulate network latency
      setTimeout(() => {
        res.json(mockResponse)
      }, 100)
    },
  )

  return app
}

async function testStreamableHttpTimeout() {
  console.log('=== Testing apiToStreamableHttp Timeout Fix ===\n')

  // Create test OpenAPI file
  const testDir = path.join(__dirname, 'temp')
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true })
  }

  const openApiFile = path.join(testDir, 'test-openapi.json')
  fs.writeFileSync(openApiFile, JSON.stringify(testOpenAPISpec, null, 2))
  console.log(`✅ Created test OpenAPI file: ${openApiFile}`)

  // Start mock API server
  const mockApp = await createMockServer()
  const mockServer = mockApp.listen(8999, () => {
    console.log('✅ Mock API server started on port 8999')
  })

  // Start supergateway with apiToStreamableHttp
  console.log('🚀 Starting Supergateway with apiToStreamableHttp...')
  const gateway = spawn(
    'node',
    [
      path.join(__dirname, '../dist/index.js'),
      '--api',
      openApiFile,
      '--apiHost',
      'http://localhost:8999',
      '--outputTransport',
      'streamable-http',
      '--port',
      TEST_PORT.toString(),
      '--httpPath',
      HTTP_PATH,
      '--logLevel',
      'info',
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  let gatewayReady = false
  let gatewayOutput = ''

  gateway.stdout.on('data', (data) => {
    const output = data.toString()
    gatewayOutput += output
    console.log(`[Gateway] ${output.trim()}`)

    if (output.includes('Server started successfully')) {
      gatewayReady = true
    }
  })

  gateway.stderr.on('data', (data) => {
    console.log(`[Gateway Error] ${data.toString().trim()}`)
  })

  // Wait for gateway to be ready
  await new Promise((resolve) => {
    const checkReady = setInterval(() => {
      if (gatewayReady) {
        clearInterval(checkReady)
        resolve()
      }
    }, 100)

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkReady)
      if (!gatewayReady) {
        console.error('❌ Gateway failed to start within 10 seconds')
        process.exit(1)
      }
    }, 10000)
  })

  console.log('✅ Supergateway is ready')

  // Test multiple concurrent requests to simulate timeout scenario
  console.log('\n🧪 Testing concurrent requests...')

  const testConcurrentRequests = async (numRequests = 5) => {
    const promises = []

    for (let i = 0; i < numRequests; i++) {
      const promise = testToolCall(i + 1)
      promises.push(promise)
    }

    try {
      const results = await Promise.all(promises)
      console.log(
        `✅ All ${numRequests} concurrent requests completed successfully`,
      )
      return results
    } catch (error) {
      console.error(`❌ Concurrent requests failed:`, error)
      throw error
    }
  }

  // Individual test function
  async function testToolCall(requestId) {
    const startTime = Date.now()

    try {
      // Initialize session
      const initResponse = await fetch(TEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
          jsonrpc: '2.0',
          id: 0,
        }),
      })

      if (!initResponse.ok) {
        throw new Error(
          `HTTP ${initResponse.status}: ${initResponse.statusText}`,
        )
      }

      const initResult = await initResponse.json()
      console.log(`[Request ${requestId}] Initialized session`)

      // Get session ID from response headers
      const sessionId =
        initResponse.headers.get('mcp-session-id') ||
        initResponse.headers.get('x-session-id')

      // Send notifications/initialized
      await fetch(TEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionId && { 'mcp-session-id': sessionId }),
        },
        body: JSON.stringify({
          method: 'notifications/initialized',
          jsonrpc: '2.0',
        }),
      })

      // Call the problematic tool (similar to user's issue)
      const toolCallResponse = await fetch(TEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionId && { 'mcp-session-id': sessionId }),
        },
        body: JSON.stringify({
          method: 'tools/call',
          params: {
            name: 'getBsp_admin_company_cpCompany_findPublic',
            arguments: {
              page_size: 10,
              page_num: 1,
              page_order: 1,
              search_text: '广发证券',
            },
          },
          jsonrpc: '2.0',
          id: 5,
        }),
        timeout: 30000, // 30 second timeout
      })

      if (!toolCallResponse.ok) {
        throw new Error(
          `HTTP ${toolCallResponse.status}: ${toolCallResponse.statusText}`,
        )
      }

      const toolResult = await toolCallResponse.json()
      const duration = Date.now() - startTime

      console.log(
        `[Request ${requestId}] ✅ Tool call completed in ${duration}ms`,
      )

      if (toolResult.error) {
        throw new Error(`Tool call error: ${toolResult.error.message}`)
      }

      return { requestId, duration, success: true }
    } catch (error) {
      const duration = Date.now() - startTime
      console.log(
        `[Request ${requestId}] ❌ Failed after ${duration}ms:`,
        error.message,
      )
      return { requestId, duration, success: false, error: error.message }
    }
  }

  // Run tests
  try {
    // Test single request first
    console.log('\n1. Testing single request...')
    await testToolCall(0)

    // Test concurrent requests
    console.log('\n2. Testing 3 concurrent requests...')
    await testConcurrentRequests(3)

    console.log('\n3. Testing 5 concurrent requests...')
    await testConcurrentRequests(5)

    console.log('\n✅ All timeout tests passed!')
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...')

    gateway.kill('SIGTERM')
    mockServer.close()

    // Remove test files
    try {
      fs.unlinkSync(openApiFile)
      fs.rmdirSync(testDir)
    } catch (e) {
      // Ignore cleanup errors
    }

    console.log('✅ Cleanup completed')
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testStreamableHttpTimeout()
    .then(() => {
      console.log(
        '\n🎉 StreamableHTTP timeout fix verification completed successfully!',
      )
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error)
      process.exit(1)
    })
}

export { testStreamableHttpTimeout }
