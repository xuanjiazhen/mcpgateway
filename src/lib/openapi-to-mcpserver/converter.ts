import fs from 'fs/promises'
import path from 'path'
import { OpenAPIV3 } from 'openapi-types'
import yaml from 'js-yaml'

import {
  McpServerConfig,
  McpTool,
  ToolArg,
  ParameterLocation,
  ParameterSchema,
  PropertyDescription,
  ResponseDescription,
  ConverterOptions,
} from './types.js'
import { Logger } from '../../types.js'

/**
 * OpenAPI to MCP Server converter
 */
export class Converter {
  private document: OpenAPIV3.Document | null = null
  private serverName: string
  private toolPrefix: string
  private logger: Logger
  private ignoreHeader: boolean

  /**
   * Create a new converter instance
   * @param options Converter options
   * @param logger Logger instance
   */
  constructor(
    private options: ConverterOptions,
    logger: Logger,
  ) {
    this.serverName = options.serverName || 'openapi-server'
    this.toolPrefix = options.toolPrefix || ''
    this.logger = logger
    this.ignoreHeader = options.ignoreHeader || false
  }

  /**
   * Load OpenAPI document from file or use provided document
   */
  async loadDocument(): Promise<void> {
    try {
      if (typeof this.options.input === 'string') {
        const content = await fs.readFile(this.options.input, 'utf-8')
        if (this.options.input.endsWith('.json')) {
          this.document = JSON.parse(content) as OpenAPIV3.Document
        } else {
          this.document = yaml.load(content) as OpenAPIV3.Document
        }
      } else {
        this.document = this.options.input
      }

      if (this.options.validate) {
        this.validateDocument()
      }
    } catch (error) {
      this.logger.error(
        `Error loading OpenAPI document: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw error
    }
  }

  /**
   * Validate the OpenAPI document
   */
  private validateDocument(): void {
    if (!this.document) {
      throw new Error('No OpenAPI document loaded')
    }

    // Minimal validation
    if (!this.document.openapi) {
      throw new Error('Invalid OpenAPI document: missing openapi field')
    }

    if (!this.document.paths) {
      throw new Error('Invalid OpenAPI document: missing paths field')
    }
  }

  /**
   * Convert OpenAPI document to MCP server configuration
   */
  async convert(): Promise<McpServerConfig> {
    if (!this.document) {
      await this.loadDocument()
    }

    if (!this.document) {
      throw new Error('Failed to load OpenAPI document')
    }

    const tools: McpTool[] = []

    // Process each path
    for (const [path, pathItem] of Object.entries(this.document.paths || {})) {
      if (!pathItem) continue

      // Skip reference objects for now
      if ('$ref' in pathItem) continue

      // Process operations (HTTP methods)
      const operations = [
        'get',
        'post',
        'put',
        'delete',
        'options',
        'head',
        'patch',
        'trace',
      ] as const

      for (const method of operations) {
        const operation = pathItem[method]
        if (!operation) continue

        const tool = this.convertOperation(path, method, operation)
        tools.push(tool)
      }
    }

    // Create MCP server configuration
    const config: McpServerConfig = {
      server: {
        name: this.serverName,
        version: this.document.info?.version,
      },
      tools,
    }

    return config
  }

  /**
   * Convert an OpenAPI operation to an MCP tool
   */
  private convertOperation(
    path: string,
    method: string,
    operation: OpenAPIV3.OperationObject,
  ): McpTool {
    // Get operation ID or generate one
    const operationId =
      operation.operationId || this.generateOperationId(path, method)

    // Create tool name with optional prefix
    const toolName = this.toolPrefix
      ? `${this.toolPrefix}_${operationId}`
      : operationId

    // Get operation description
    const description =
      operation.description ||
      operation.summary ||
      `${method.toUpperCase()} ${path}`

    // Process parameters
    const parameters = this.getParameters(path, method, operation)

    // Convert parameters to tool args
    const args = this.convertParameters(parameters)

    // Create request template
    const requestTemplate = {
      url: path,
      method: method.toUpperCase(),
      headers: operation.requestBody
        ? [{ key: 'Content-Type', value: 'application/json' }]
        : undefined,
    }

    // Create response template with prependBody
    const responseTemplate = {
      prependBody: this.generateResponseTemplate(operation),
    }

    return {
      name: toolName,
      description,
      args,
      requestTemplate,
      responseTemplate,
    }
  }

  /**
   * Generate an operation ID from path and method
   */
  private generateOperationId(path: string, method: string): string {
    // Convert path format like /users/{id} to users_id
    const pathPart = path
      .replace(/^\//, '')
      .replace(/\/$/, '')
      .replace(/\//g, '_')
      .replace(/[{}]/g, '')
      .replace(/-/g, '_')

    return `${method}${pathPart.charAt(0).toUpperCase() + pathPart.slice(1)}`
  }

  /**
   * Get parameters from an OpenAPI operation
   */
  private getParameters(
    path: string,
    method: string,
    operation: OpenAPIV3.OperationObject,
  ): ParameterSchema[] {
    const parameters: ParameterSchema[] = []

    // Add path parameters
    const pathParams = this.extractPathParameters(path)
    const operationParameters = operation.parameters || []

    // Process regular parameters (path, query, header)
    for (const param of operationParameters) {
      // Handle reference objects
      let resolvedParam: OpenAPIV3.ParameterObject
      if ('$ref' in param) {
        const resolved = this.resolveRef<OpenAPIV3.ParameterObject>(param.$ref)
        if (!resolved) {
          this.logger.warn(
            `Failed to resolve parameter reference: ${param.$ref}`,
          )
          continue
        }
        resolvedParam = resolved
      } else {
        resolvedParam = param
      }

      if (this.ignoreHeader && resolvedParam.in === 'header') {
        continue
      }

      parameters.push({
        name: resolvedParam.name,
        description: resolvedParam.description,
        schema: resolvedParam.schema || { type: 'string' },
        required: resolvedParam.required || false,
        location: resolvedParam.in as ParameterLocation,
      })
    }

    // Process request body if present
    if (operation.requestBody) {
      // Handle reference objects for request body
      let resolvedRequestBody: OpenAPIV3.RequestBodyObject
      if ('$ref' in operation.requestBody) {
        const resolved = this.resolveRef<OpenAPIV3.RequestBodyObject>(
          operation.requestBody.$ref,
        )
        if (!resolved) {
          this.logger.warn(
            `Failed to resolve request body reference: ${operation.requestBody.$ref}`,
          )
          return parameters
        }
        resolvedRequestBody = resolved
      } else {
        resolvedRequestBody = operation.requestBody
      }

      const content = resolvedRequestBody.content || {}
      const jsonSchema = content['application/json']?.schema

      if (jsonSchema) {
        // Resolve schema if it's a reference
        const resolvedSchema = this.resolveSchema(jsonSchema)
        if (resolvedSchema && resolvedSchema.properties) {
          for (const [propName, propSchema] of Object.entries(
            resolvedSchema.properties,
          )) {
            // Resolve property schema if needed
            let resolvedPropSchema: OpenAPIV3.SchemaObject | null
            if (typeof propSchema === 'object' && '$ref' in propSchema) {
              resolvedPropSchema = this.resolveSchema(propSchema)
            } else if (typeof propSchema === 'object') {
              resolvedPropSchema = propSchema
            } else {
              continue
            }

            if (resolvedPropSchema) {
              parameters.push({
                name: propName,
                description: resolvedPropSchema.description,
                schema: resolvedPropSchema,
                required: resolvedSchema.required?.includes(propName) || false,
                location: 'body',
              })
            }
          }
        }
      }
    }

    return parameters
  }

  /**
   * Extract path parameters from a path template
   */
  private extractPathParameters(path: string): string[] {
    const matches = path.match(/\{([^}]+)\}/g) || []
    return matches.map((match) => match.slice(1, -1))
  }

  /**
   * Convert parameters to tool args
   */
  private convertParameters(parameters: ParameterSchema[]): ToolArg[] {
    return parameters.map((param) => {
      let type = 'string'

      // Get type from schema if available
      if ('type' in param.schema) {
        type = param.schema.type as string
      }

      return {
        name: param.name,
        description: param.description || param.name,
        type,
        required: param.required,
        position: this.mapParameterLocation(param.location),
      }
    })
  }

  /**
   * Map OpenAPI parameter location to MCP position
   */
  private mapParameterLocation(
    location: ParameterLocation,
  ): ToolArg['position'] {
    switch (location) {
      case 'path':
        return 'path'
      case 'query':
        return 'query'
      case 'header':
        return 'header'
      case 'cookie':
        return 'header' // Map cookies to headers
      case 'body':
        return 'body'
      default:
        return 'query' // Default to query
    }
  }

  /**
   * Generate response template with field descriptions
   */
  private generateResponseTemplate(
    operation: OpenAPIV3.OperationObject,
  ): string {
    // Get successful response (200, 201, etc.)
    const responses = operation.responses || {}
    const successResponses = [
      '200',
      '201',
      '202',
      '203',
      '204',
      '205',
      '206',
      '207',
      '208',
      '226',
    ]

    let responseDescription: ResponseDescription | null = null

    // Find first successful response with content
    for (const statusCode of successResponses) {
      const response = responses[statusCode]
      if (!response) continue

      // Handle reference objects
      let resolvedResponse: OpenAPIV3.ResponseObject
      if ('$ref' in response) {
        const resolved = this.resolveRef<OpenAPIV3.ResponseObject>(
          response.$ref,
        )
        if (!resolved) {
          this.logger.warn(
            `Failed to resolve response reference: ${response.$ref}`,
          )
          continue
        }
        resolvedResponse = resolved
      } else {
        resolvedResponse = response
      }

      const content = resolvedResponse.content || {}
      const jsonContent = content['application/json']

      if (jsonContent?.schema) {
        // Resolve schema if it's a reference
        const resolvedSchema = this.resolveSchema(jsonContent.schema)
        if (resolvedSchema) {
          responseDescription = {
            contentType: 'application/json',
            schema: resolvedSchema,
            statusCode,
            description: resolvedResponse.description || '',
          }
          break
        }
      }
    }

    if (!responseDescription) {
      return '' // No suitable response found
    }

    // Generate response template
    return this.generateResponseDocumentation(responseDescription)
  }

  /**
   * Generate response documentation from a response description
   */
  private generateResponseDocumentation(response: ResponseDescription): string {
    let template = '# API Response Information\n\n'
    template +=
      "Below is the response from an API call. To help you understand the data, I've provided:\n\n"
    template +=
      '1. A detailed description of all fields in the response structure\n'
    template += '2. The complete API response\n\n'

    template += '## Response Structure\n\n'
    template += `> Content-Type: ${response.contentType}\n\n`

    // Add property descriptions
    const propertyDescriptions = this.generatePropertyDescriptions(
      response.schema,
    )
    for (const prop of propertyDescriptions) {
      template += `- **${prop.path}**: ${prop.description || ''} (Type: ${prop.type})\n`
    }

    template += '\n## Original Response\n\n'

    return template
  }

  /**
   * Generate property descriptions from a schema
   */
  private generatePropertyDescriptions(
    schema: OpenAPIV3.SchemaObject,
    parentPath = '',
  ): PropertyDescription[] {
    const descriptions: PropertyDescription[] = []

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const path = parentPath ? `${parentPath}.${propName}` : propName

        // Resolve reference if needed
        let resolvedSchema: OpenAPIV3.SchemaObject | null
        if (typeof propSchema === 'object' && '$ref' in propSchema) {
          resolvedSchema = this.resolveSchema(propSchema)
          if (!resolvedSchema) {
            this.logger.warn(
              `Failed to resolve property schema reference: ${propSchema.$ref}`,
            )
            continue
          }
        } else if (typeof propSchema === 'object') {
          resolvedSchema = propSchema
        } else {
          continue
        }

        descriptions.push({
          path,
          type: resolvedSchema.type || 'object',
          description: resolvedSchema.description,
        })

        // Recursively process nested objects
        if (resolvedSchema.type === 'object' && resolvedSchema.properties) {
          descriptions.push(
            ...this.generatePropertyDescriptions(resolvedSchema, path),
          )
        }

        // Process array items
        if (
          resolvedSchema.type === 'array' &&
          resolvedSchema.items &&
          typeof resolvedSchema.items === 'object'
        ) {
          let arrayItemSchema: OpenAPIV3.SchemaObject | null
          if ('$ref' in resolvedSchema.items) {
            arrayItemSchema = this.resolveSchema(resolvedSchema.items)
          } else {
            arrayItemSchema = resolvedSchema.items
          }

          if (
            arrayItemSchema &&
            arrayItemSchema.type === 'object' &&
            arrayItemSchema.properties
          ) {
            descriptions.push(
              ...this.generatePropertyDescriptions(
                arrayItemSchema,
                `${path}[]`,
              ),
            )
          }
        }
      }
    }

    return descriptions
  }

  /**
   * Resolve a $ref reference to its actual object
   */
  private resolveRef<T = any>(ref: string): T | null {
    if (!this.document || !ref.startsWith('#/')) {
      return null
    }

    const path = ref.substring(2).split('/')
    let current: any = this.document

    try {
      for (const segment of path) {
        current = current[segment]
        if (current === undefined) {
          this.logger.error(
            `Cannot resolve $ref: ${ref} - segment '${segment}' not found`,
          )
          return null
        }
      }
      return current as T
    } catch (error) {
      this.logger.error(
        `Error resolving $ref: ${ref} - ${error instanceof Error ? error.message : String(error)}`,
      )
      return null
    }
  }

  /**
   * Resolve schema object, handling $ref references
   */
  private resolveSchema(
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  ): OpenAPIV3.SchemaObject | null {
    if ('$ref' in schema) {
      const resolved = this.resolveRef<OpenAPIV3.SchemaObject>(schema.$ref)
      if (!resolved) {
        this.logger.warn(`Failed to resolve schema reference: ${schema.$ref}`)
        return null
      }
      return resolved
    }
    return schema
  }
}
