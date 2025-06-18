#!/usr/bin/env node

/**
 * 测试时间戳日志功能
 */

import {
  logger,
  createPrefixedLogger,
  createTimestampedLog,
  createTimestampedErrorLog,
} from '../dist/logger.js'

console.log('Testing timestamp logger functionality...\n')

// 测试基本logger
console.log('1. Testing basic logger:')
logger.info('This is an info message')
logger.warn('This is a warning message')
logger.error('This is an error message')
logger.debug('This is a debug message')

console.log('\n2. Testing prefixed logger:')
const mcpLogger = createPrefixedLogger('[MCP-Gateway]')
mcpLogger.info('MCP Gateway starting up')
mcpLogger.warn('This is a warning from MCP Gateway')
mcpLogger.error('This is an error from MCP Gateway')

console.log('\n3. Testing timestamped log functions:')
const log = createTimestampedLog('[TestApp]')
const logError = createTimestampedErrorLog('[TestApp]')

log('Application started successfully')
log('Processing request...')
logError('An error occurred during processing')

console.log('\n4. Testing with different components:')
const configLoader = createPrefixedLogger('[ConfigLoader]')
const dynamicRouter = createPrefixedLogger('[DynamicRouter]')
const webSocket = createTimestampedLog('[WebSocket]')

configLoader.info('Loading configuration from file')
dynamicRouter.warn('Server health check failed')
webSocket('WebSocket connection established')

console.log('\nTimestamp logger test completed!')
