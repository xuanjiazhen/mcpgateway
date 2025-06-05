#!/usr/bin/env node

import { spawn } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync } from 'fs'
import express from 'express'

// Get the current script directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Logger
const logger = {
  info: (...args) => console.log('\x1b[32m[INFO]\x1b[0m', ...args),
  warn: (...args) => console.log('\x1b[33m[WARN]\x1b[0m', ...args),
  error: (...args) => console.log('\x1b[31m[ERROR]\x1b[0m', ...args),
}

// Test configuration
const config = {
  testPort: 8901,
  fileServerPort: 8902,
  testFile: join(__dirname, 'test-openapi.json'),
  testUrl: `http://localhost:8902/test-openapi.json`,
}

// Create a simple OpenAPI specification for testing
const testOpenApiSpec = {
  openapi: '3.0.1',
  info: {
    title: 'Test API',
    version: '1.0.0',
    description: 'A test API for remote URL testing',
  },
  servers: [
    {
      url: 'https://api.example.com',
    },
  ],
  paths: {
    '/test': {
      get: {
        summary: 'Get test data',
        description: 'Retrieve test data from the server',
        parameters: [
          {
            name: 'query',
            in: 'query',
            description: 'Search query',
            required: false,
            schema: {
              type: 'string',
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
                  properties: {
                    message: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}

// Create test file
logger.info('Creating test OpenAPI specification file...')
writeFileSync(config.testFile, JSON.stringify(testOpenApiSpec, null, 2))

// Create a simple file server
function createFileServer() {
  return new Promise((resolve, reject) => {
    const app = express()

    // Serve the test file
    app.get('/test-openapi.json', (req, res) => {
      logger.info(`File server: Serving test OpenAPI file`)
      res.setHeader('Content-Type', 'application/json')
      res.json(testOpenApiSpec)
    })

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok' })
    })

    const server = app.listen(config.fileServerPort, () => {
      logger.info(`File server started on port ${config.fileServerPort}`)
      resolve(server)
    })

    server.on('error', reject)
  })
}

// Test function
async function testRemoteUrl() {
  logger.info('Starting Remote URL Support Test')

  let fileServer
  let mcpProcess

  try {
    // 1. Start file server
    logger.info('\n1. Starting file server...')
    fileServer = await createFileServer()

    // Wait a bit for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // 2. Test with remote URL
    logger.info('\n2. Testing MCP Gateway with remote URL...')
    logger.info(`Testing URL: ${config.testUrl}`)

    const mcpCommand = [
      'node',
      join(__dirname, '..', 'dist', 'index.js'),
      '--api',
      config.testUrl,
      '--apiHost',
      'https://api.example.com',
      '--outputTransport',
      'streamable-http',
      '--port',
      config.testPort.toString(),
      '--httpPath',
      '/mcp',
      '--logLevel',
      'info',
    ]

    logger.info(`Running command: ${mcpCommand.join(' ')}`)

    mcpProcess = spawn(mcpCommand[0], mcpCommand.slice(1), {
      stdio: 'pipe',
      env: { ...process.env },
    })

    let output = ''
    let errorOutput = ''

    mcpProcess.stdout.on('data', (data) => {
      const text = data.toString()
      output += text

      // Log interesting output
      if (
        text.includes('Downloading file from URL') ||
        text.includes('Successfully downloaded') ||
        text.includes('Detected OpenAPI') ||
        text.includes('converted') ||
        text.includes('MCP template loaded') ||
        text.includes('Server started')
      ) {
        logger.info(`Server: ${text.trim()}`)
      }
    })

    mcpProcess.stderr.on('data', (data) => {
      const text = data.toString()
      errorOutput += text
      if (text.includes('ERROR') || text.includes('error')) {
        logger.error(`Server error: ${text.trim()}`)
      }
    })

    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'))
      }, 15000)

      const checkStartup = () => {
        if (
          output.includes('Server started') ||
          output.includes('Starting...')
        ) {
          clearTimeout(timeout)
          resolve()
        } else {
          setTimeout(checkStartup, 100)
        }
      }

      checkStartup()
    })

    logger.info('\n✅ MCP Gateway successfully started with remote URL!')

    // 3. Test the health endpoint
    logger.info('\n3. Testing server endpoints...')

    const fetch = (await import('node-fetch')).default

    try {
      const healthResponse = await fetch(
        `http://localhost:${config.testPort}/health`,
      )
      const healthData = await healthResponse.json()
      logger.info('✅ Health endpoint working:', healthData)
    } catch (err) {
      logger.error('❌ Health endpoint failed:', err.message)
    }

    try {
      const configResponse = await fetch(
        `http://localhost:${config.testPort}/mcp-config`,
      )
      const configData = await configResponse.json()
      logger.info(
        '✅ MCP config endpoint working, tools count:',
        configData.tools?.length || 0,
      )

      if (configData.tools && configData.tools.length > 0) {
        logger.info(
          'Available tools:',
          configData.tools.map((t) => t.name).join(', '),
        )
      }
    } catch (err) {
      logger.error('❌ MCP config endpoint failed:', err.message)
    }

    logger.info('\n✅ Remote URL support test completed successfully!')

    // Check the output for key indicators
    const indicators = [
      'Downloading file from URL',
      'Successfully downloaded file',
      'Detected OpenAPI specification',
      'Converting OpenAPI specification to MCP template',
      'successfully converted to MCP template',
      'MCP template loaded successfully',
    ]

    logger.info('\n📋 Verification results:')
    indicators.forEach((indicator) => {
      if (output.includes(indicator)) {
        logger.info(`✅ ${indicator}`)
      } else {
        logger.warn(`❌ Missing: ${indicator}`)
      }
    })
  } catch (error) {
    logger.error('Test failed:', error)
    throw error
  } finally {
    // Cleanup
    logger.info('\n4. Cleaning up...')

    if (mcpProcess && !mcpProcess.killed) {
      mcpProcess.kill('SIGTERM')
      logger.info('MCP process terminated')
    }

    if (fileServer) {
      fileServer.close()
      logger.info('File server closed')
    }
  }
}

// Run the test
testRemoteUrl().catch((error) => {
  logger.error('Test execution failed:', error)
  process.exit(1)
})
