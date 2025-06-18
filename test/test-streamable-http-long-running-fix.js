#!/usr/bin/env node

import fetch from 'node-fetch'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Test configuration
const TEST_PORT = 9997
const HTTP_PATH = '/mcp'
const TEST_URL = `http://localhost:${TEST_PORT}${HTTP_PATH}`

// Test OpenAPI specification for simulating the user's issue
const testOpenAPISpec = {
  openapi: '3.0.1',
  info: {
    title: 'Test API for Long Running',
    version: '1.0.0',
  },
  servers: [
    {
      url: 'http://localhost:8998',
    },
  ],
  paths: {
    '/test/company/find': {
      get: {
        operationId: 'getTestCompanyFind',
        summary: 'Find test companies',
        parameters: [
          {
            name: 'search_text',
            in: 'query',
            required: true,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'page_size',
            in: 'query',
            required: false,
            schema: {
              type: 'integer',
              default: 10,
            },
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

  // Mock the API endpoint that returns business data format (with code, msg, data)
  app.get('/test/company/find', (req, res) => {
    console.log('Mock API received request:', req.query)

    // Return business format (similar to user's real API)
    res.json({
      code: 0,
      msg: 'success',
      data: {
        total: 5,
        page_size: parseInt(req.query.page_size) || 10,
        page_num: 1,
        search_text: req.query.search_text,
        data: [
          {
            id: 'TEST001',
            name: `Test Company for ${req.query.search_text}`,
            type: '测试公司',
          },
        ],
      },
    })
  })

  return app
}

// Test function
async function testLongRunningStreamableHttp() {
  console.log('🧪 Testing StreamableHTTP long-running tool call fix...')

  // Create test OpenAPI specification file
  const testSpecPath = path.join(__dirname, 'test-long-running-spec.json')
  await fs.promises.writeFile(
    testSpecPath,
    JSON.stringify(testOpenAPISpec, null, 2),
  )
  console.log(`✅ Created test OpenAPI spec: ${testSpecPath}`)

  // Start mock API server
  const mockApp = await createMockServer()
  const mockServer = mockApp.listen(8998, () => {
    console.log('✅ Mock API server started on port 8998')
  })

  // Start supergateway server
  const gateway = spawn(
    'node',
    [
      'dist/cmd/mcpgateway.js',
      '--api',
      testSpecPath,
      '--apiHost',
      'http://localhost:8998',
      '--outputTransport',
      'streamable-http',
      '--port',
      TEST_PORT.toString(),
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  gateway.stdout.on('data', (data) => {
    console.log(`[Gateway] ${data.toString().trim()}`)
  })

  gateway.stderr.on('data', (data) => {
    console.error(`[Gateway Error] ${data.toString().trim()}`)
  })

  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 3000))
  console.log('✅ Gateway server started')

  try {
    console.log('\\n📋 Testing scenarios:')

    // Test 1: Initial tool call (should work)
    console.log('\\n1️⃣ Testing initial tool call...')
    const initialResult = await testToolCall('initial test')
    if (initialResult.success) {
      console.log('✅ Initial tool call succeeded')
    } else {
      console.log('❌ Initial tool call failed:', initialResult.error)
      throw new Error('Initial test failed')
    }

    // Test 2: Multiple tool calls to simulate usage
    console.log('\\n2️⃣ Testing multiple tool calls...')
    for (let i = 1; i <= 5; i++) {
      console.log(`  Testing call ${i}/5...`)
      const result = await testToolCall(`test batch ${i}`)
      if (!result.success) {
        console.log(`❌ Tool call ${i} failed:`, result.error)
        throw new Error(`Batch test ${i} failed`)
      }
      // Small delay between calls
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    console.log('✅ All batch tool calls succeeded')

    // Test 3: Wait and test after some time (simulate long running)
    console.log('\\n3️⃣ Waiting 10 seconds to simulate long running...')
    await new Promise((resolve) => setTimeout(resolve, 10000))

    // Test 4: Tool call after wait (this is where the bug occurred)
    console.log('\\n4️⃣ Testing tool call after waiting (critical test)...')
    const afterWaitResult = await testToolCall('after wait test')
    if (afterWaitResult.success) {
      console.log('✅ Tool call after waiting succeeded - BUG FIXED!')
    } else {
      console.log('❌ Tool call after waiting failed:', afterWaitResult.error)
      throw new Error('After-wait test failed - bug still exists')
    }

    // Test 5: More calls to ensure stability
    console.log('\\n5️⃣ Testing stability with more calls...')
    for (let i = 1; i <= 3; i++) {
      console.log(`  Stability test ${i}/3...`)
      const result = await testToolCall(`stability test ${i}`)
      if (!result.success) {
        console.log(`❌ Stability test ${i} failed:`, result.error)
        throw new Error(`Stability test ${i} failed`)
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    console.log('✅ All stability tests succeeded')

    console.log('\\n🎉 All tests passed! Long-running bug appears to be fixed.')
  } finally {
    // Cleanup
    console.log('\\n🧹 Cleaning up...')

    gateway.kill('SIGTERM')
    mockServer.close()

    try {
      await fs.promises.unlink(testSpecPath)
      console.log('✅ Cleaned up test files')
    } catch (err) {
      console.log('⚠️ Warning: Could not clean up test files:', err.message)
    }
  }
}

// Helper function to test tool call
async function testToolCall(searchText) {
  try {
    const requestBody = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'getTestCompanyFind',
        arguments: {
          search_text: searchText,
          page_size: 5,
        },
      },
      id: Math.floor(Math.random() * 1000),
    }

    console.log(`    Making request for: "${searchText}"`)
    const startTime = Date.now()

    const response = await fetch(TEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      timeout: 15000, // 15 second timeout
    })

    const duration = Date.now() - startTime

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    const result = await response.json()
    console.log(`    Response received in ${duration}ms`)

    // Check for the specific error that indicates the bug
    if (
      result.error &&
      result.error.message &&
      result.error.message.includes('Invalid literal value, expected "2.0"')
    ) {
      return {
        success: false,
        error:
          'BUG DETECTED: API response data being treated as JSON-RPC message!',
      }
    }

    // Check for successful result
    if (result.result || (result.jsonrpc === '2.0' && !result.error)) {
      return { success: true, result }
    }

    return {
      success: false,
      error: `Unexpected response format: ${JSON.stringify(result)}`,
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || String(error),
    }
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testLongRunningStreamableHttp()
    .then(() => {
      console.log(
        '\\n🎉 Long-running StreamableHTTP test completed successfully!',
      )
      process.exit(0)
    })
    .catch((error) => {
      console.error('\\n💥 Test failed:', error)
      process.exit(1)
    })
}

export { testLongRunningStreamableHttp }
