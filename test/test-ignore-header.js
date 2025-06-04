import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// Sample OpenAPI spec with header parameters
const sampleOpenApiWithHeaders = {
  openapi: '3.0.1',
  info: {
    title: 'Test API with Headers',
    version: '1.0.0',
  },
  paths: {
    '/users': {
      get: {
        operationId: 'getUsers',
        summary: 'Get user list',
        description: 'Retrieve a list of users',
        parameters: [
          {
            name: 'authorization',
            in: 'header',
            description: 'Authorization token',
            required: true,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'x-api-key',
            in: 'header',
            description: 'API key for authentication',
            required: false,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'page',
            in: 'query',
            description: 'Page number',
            required: false,
            schema: {
              type: 'integer',
              default: 1,
            },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Page size',
            required: false,
            schema: {
              type: 'integer',
              default: 10,
            },
          },
        ],
        responses: {
          200: {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    users: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                            description: 'User ID',
                          },
                          name: {
                            type: 'string',
                            description: 'User name',
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
      },
    },
  },
}

async function testIgnoreHeader() {
  console.log('🧪 Testing ignoreHeader parameter functionality...\n')

  try {
    // Write test OpenAPI spec to temporary file
    const testFile = join(projectRoot, 'test-openapi-with-headers.json')
    await fs.writeFile(
      testFile,
      JSON.stringify(sampleOpenApiWithHeaders, null, 2),
    )

    // Import converter module
    const { Converter } = await import(
      '../dist/lib/openapi-to-mcpserver/index.js'
    )

    // Create simple logger
    const logger = {
      info: (msg) => console.log(`[INFO] ${msg}`),
      warn: (msg) => console.log(`[WARN] ${msg}`),
      error: (msg) => console.log(`[ERROR] ${msg}`),
    }

    // Test 1: Convert with ignoreHeader = false (default behavior)
    console.log('📄 Test 1: Converting with ignoreHeader = false (default)...')
    const converterWithHeaders = new Converter(
      {
        input: testFile,
        serverName: 'test-headers-server',
        toolPrefix: 'test',
        validate: false,
        ignoreHeader: false,
      },
      logger,
    )

    const mcpConfigWithHeaders = await converterWithHeaders.convert()
    console.log('✅ Conversion completed successfully!\n')

    // Test 2: Convert with ignoreHeader = true
    console.log('📄 Test 2: Converting with ignoreHeader = true...')
    const converterIgnoreHeaders = new Converter(
      {
        input: testFile,
        serverName: 'test-ignore-headers-server',
        toolPrefix: 'test',
        validate: false,
        ignoreHeader: true,
      },
      logger,
    )

    const mcpConfigIgnoreHeaders = await converterIgnoreHeaders.convert()
    console.log('✅ Conversion completed successfully!\n')

    // Compare results
    console.log('📊 Comparison Results:')
    console.log('==========================================')

    const toolWithHeaders = mcpConfigWithHeaders.tools[0]
    const toolIgnoreHeaders = mcpConfigIgnoreHeaders.tools[0]

    console.log(`Tool name: ${toolWithHeaders.name}`)
    console.log(`Arguments with headers: ${toolWithHeaders.args.length}`)
    console.log(
      `Arguments ignoring headers: ${toolIgnoreHeaders.args.length}\n`,
    )

    console.log('🔧 Arguments with headers included:')
    toolWithHeaders.args.forEach((arg) => {
      console.log(
        `   - ${arg.name} (${arg.type}) [${arg.position}]: ${arg.description}`,
      )
    })

    console.log('\n🔧 Arguments with headers ignored:')
    toolIgnoreHeaders.args.forEach((arg) => {
      console.log(
        `   - ${arg.name} (${arg.type}) [${arg.position}]: ${arg.description}`,
      )
    })

    // Verify functionality
    console.log('\n✅ Verification:')

    const headerArgsWithHeaders = toolWithHeaders.args.filter(
      (arg) => arg.position === 'header',
    )
    const headerArgsIgnoreHeaders = toolIgnoreHeaders.args.filter(
      (arg) => arg.position === 'header',
    )

    console.log(
      `Header arguments with ignoreHeader=false: ${headerArgsWithHeaders.length}`,
    )
    console.log(
      `Header arguments with ignoreHeader=true: ${headerArgsIgnoreHeaders.length}`,
    )

    if (
      headerArgsWithHeaders.length > 0 &&
      headerArgsIgnoreHeaders.length === 0
    ) {
      console.log('🎉 ignoreHeader parameter is working correctly!')
      console.log(
        '   - With ignoreHeader=false: Header parameters are included',
      )
      console.log('   - With ignoreHeader=true: Header parameters are excluded')
    } else {
      console.log('❌ ignoreHeader parameter is not working as expected')
      console.log(
        `   Expected header args with ignoreHeader=false: > 0, got: ${headerArgsWithHeaders.length}`,
      )
      console.log(
        `   Expected header args with ignoreHeader=true: 0, got: ${headerArgsIgnoreHeaders.length}`,
      )
    }

    // Verify query parameters are still included
    const queryArgsWithHeaders = toolWithHeaders.args.filter(
      (arg) => arg.position === 'query',
    )
    const queryArgsIgnoreHeaders = toolIgnoreHeaders.args.filter(
      (arg) => arg.position === 'query',
    )

    console.log(
      `\nQuery arguments with ignoreHeader=false: ${queryArgsWithHeaders.length}`,
    )
    console.log(
      `Query arguments with ignoreHeader=true: ${queryArgsIgnoreHeaders.length}`,
    )

    if (
      queryArgsWithHeaders.length === queryArgsIgnoreHeaders.length &&
      queryArgsWithHeaders.length > 0
    ) {
      console.log(
        '✅ Query parameters are preserved correctly when ignoring headers',
      )
    } else {
      console.log('❌ Query parameters may be affected by ignoreHeader setting')
    }

    // Clean up test file
    await fs.unlink(testFile)

    console.log('\n🎉 ignoreHeader functionality test completed!')
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
    process.exit(1)
  }
}

testIgnoreHeader()
