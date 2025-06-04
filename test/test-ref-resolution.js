import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// Sample OpenAPI spec with $ref references
const sampleOpenApiWithRefs = {
  openapi: '3.0.1',
  info: {
    title: 'Test API with $ref',
    version: '1.0.0',
  },
  paths: {
    '/feedback': {
      get: {
        operationId: 'getFeedback',
        summary: 'Get feedback list',
        description: 'Retrieve a list of feedback items',
        parameters: [
          {
            $ref: '#/components/parameters/PageParam',
          },
        ],
        responses: {
          200: {
            $ref: '#/components/responses/FeedbackListResponse',
          },
        },
      },
      post: {
        operationId: 'createFeedback',
        summary: 'Create feedback',
        requestBody: {
          $ref: '#/components/requestBodies/FeedbackRequest',
        },
        responses: {
          201: {
            description: 'Created',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/FeedbackItem',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    parameters: {
      PageParam: {
        name: 'page',
        in: 'query',
        description: 'Page number',
        required: false,
        schema: {
          type: 'integer',
          default: 1,
        },
      },
    },
    requestBodies: {
      FeedbackRequest: {
        description: 'Feedback creation request',
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/FeedbackInput',
            },
          },
        },
      },
    },
    responses: {
      FeedbackListResponse: {
        description: 'List of feedback items',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/FeedbackListResp',
            },
          },
        },
      },
    },
    schemas: {
      FeedbackListResp: {
        type: 'object',
        properties: {
          code: {
            type: 'integer',
            description: 'Response code',
          },
          message: {
            type: 'string',
            description: 'Response message',
          },
          data: {
            type: 'object',
            properties: {
              total: {
                type: 'integer',
                description: 'Total number of items',
              },
              items: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/FeedbackItem',
                },
                description: 'List of feedback items',
              },
            },
          },
        },
      },
      FeedbackItem: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Feedback ID',
          },
          title: {
            type: 'string',
            description: 'Feedback title',
          },
          content: {
            type: 'string',
            description: 'Feedback content',
          },
          user: {
            $ref: '#/components/schemas/User',
          },
        },
      },
      FeedbackInput: {
        type: 'object',
        required: ['title', 'content'],
        properties: {
          title: {
            type: 'string',
            description: 'Feedback title',
          },
          content: {
            type: 'string',
            description: 'Feedback content',
          },
        },
      },
      User: {
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
          email: {
            type: 'string',
            description: 'User email',
          },
        },
      },
    },
  },
}

async function testRefResolution() {
  console.log('🔍 Testing $ref resolution in OpenAPI to MCP conversion...\n')

  try {
    // Write test OpenAPI spec to temporary file
    const testFile = join(projectRoot, 'test-openapi-with-refs.json')
    await fs.writeFile(testFile, JSON.stringify(sampleOpenApiWithRefs, null, 2))

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

    // Convert OpenAPI to MCP template
    console.log('📄 Converting OpenAPI spec with $ref references...')
    const converter = new Converter(
      {
        input: testFile,
        serverName: 'test-ref-server',
        toolPrefix: 'test',
        validate: false,
      },
      logger,
    )

    const mcpConfig = await converter.convert()

    console.log('✅ Conversion completed successfully!\n')

    // Analyze the results
    console.log('📊 Analysis of converted tools:')
    console.log(`Number of tools generated: ${mcpConfig.tools.length}\n`)

    for (const tool of mcpConfig.tools) {
      console.log(`🔧 Tool: ${tool.name}`)
      console.log(`   Description: ${tool.description}`)
      console.log(`   Arguments: ${tool.args.length}`)

      // Check if response template contains resolved schema information
      if (tool.responseTemplate?.prependBody) {
        const responseBody = tool.responseTemplate.prependBody
        console.log(
          `   Response template length: ${responseBody.length} characters`,
        )

        // Check for specific resolved properties
        const hasResolvedProps = [
          'code',
          'message',
          'data.total',
          'data.items',
          'id',
          'title',
          'content',
          'user.name',
          'user.email',
        ].some((prop) => responseBody.includes(prop))

        if (hasResolvedProps) {
          console.log(
            '   ✅ Response template contains resolved $ref properties',
          )
        } else {
          console.log(
            '   ❌ Response template may not have resolved $ref properties',
          )
        }
      }

      console.log('   Arguments:')
      tool.args.forEach((arg) => {
        console.log(`     - ${arg.name} (${arg.type}): ${arg.description}`)
      })
      console.log('')
    }

    // Check specific resolved content
    const getFeedbackTool = mcpConfig.tools.find(
      (t) => t.name === 'test_getFeedback',
    )
    if (getFeedbackTool) {
      console.log('🔍 Detailed analysis of getFeedback tool:')

      // Check if page parameter was resolved
      const pageParam = getFeedbackTool.args.find((arg) => arg.name === 'page')
      if (pageParam) {
        console.log('   ✅ Parameter from $ref resolved: page parameter found')
        console.log(
          `      Type: ${pageParam.type}, Description: ${pageParam.description}`,
        )
      } else {
        console.log(
          '   ❌ Parameter from $ref NOT resolved: page parameter missing',
        )
      }

      // Check response template for resolved schemas
      if (getFeedbackTool.responseTemplate?.prependBody) {
        const responseTemplate = getFeedbackTool.responseTemplate.prependBody
        console.log('   Response template preview:')
        console.log('   ' + responseTemplate.substring(0, 200) + '...')

        // Check for deeply nested resolved properties
        const deepProps = ['data.items', 'user.name', 'user.email']
        const resolvedDeepProps = deepProps.filter((prop) =>
          responseTemplate.includes(prop),
        )

        if (resolvedDeepProps.length > 0) {
          console.log(
            `   ✅ Deep $ref resolution working: ${resolvedDeepProps.join(', ')}`,
          )
        } else {
          console.log('   ❌ Deep $ref resolution may not be working')
        }
      }
    }

    // Clean up test file
    await fs.unlink(testFile)

    console.log('\n🎉 $ref resolution test completed!')
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
    process.exit(1)
  }
}

testRefResolution()
