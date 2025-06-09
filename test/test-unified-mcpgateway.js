#!/usr/bin/env node

import { spawn } from 'child_process'
import { setTimeout } from 'timers/promises'

// 测试场景配置
const testScenarios = [
  {
    name: '单服务器模式 - stdio参数',
    command: 'mcpgateway',
    args: ['--stdio', 'echo test', '--port', '8000', '--help'],
    expectedMode: 'single-server',
    timeout: 3000,
  },
  {
    name: '单服务器模式 - sse参数',
    command: 'mcpgateway',
    args: [
      '--sse',
      'https://example.com',
      '--outputTransport',
      'streamable-http',
      '--help',
    ],
    expectedMode: 'single-server',
    timeout: 3000,
  },
  {
    name: '单服务器模式 - api参数',
    command: 'mcpgateway',
    args: ['--api', 'openapi.json', '--apiHost', 'https://api.com', '--help'],
    expectedMode: 'single-server',
    timeout: 3000,
  },
  {
    name: '多服务器模式 - config参数',
    command: 'mcpgateway',
    args: ['--config', 'mcp-servers.json', '--help'],
    expectedMode: 'multi-server',
    timeout: 3000,
  },
  {
    name: '多服务器模式 - json文件',
    command: 'mcpgateway',
    args: ['mcp-servers.json', '--help'],
    expectedMode: 'multi-server',
    timeout: 3000,
  },
  {
    name: '多服务器模式 - routerPort参数',
    command: 'mcpgateway',
    args: ['--routerPort', '80', '--help'],
    expectedMode: 'multi-server',
    timeout: 3000,
  },
  {
    name: '版本检查',
    command: 'mcpgateway',
    args: ['--version'],
    expectedMode: 'version',
    timeout: 3000,
  },
  {
    name: '帮助信息',
    command: 'mcpgateway',
    args: ['--help'],
    expectedMode: 'help',
    timeout: 3000,
  },
  {
    name: '无参数默认模式',
    command: 'mcpgateway',
    args: [],
    expectedMode: 'help',
    timeout: 3000,
  },
  {
    name: '混合参数（单+多）优先多服务器',
    command: 'mcpgateway',
    args: ['--stdio', 'echo test', '--config', 'config.json', '--help'],
    expectedMode: 'multi-server',
    timeout: 3000,
  },
]

// Docker测试场景
const dockerScenarios = [
  {
    name: 'Docker - 统一命令单服务器',
    command: 'docker',
    args: [
      'run',
      '--rm',
      'mcpgateway',
      '--stdio',
      'echo test',
      '--port',
      '8000',
      '--help',
    ],
    expectedMode: 'single-server',
    timeout: 10000,
  },
  {
    name: 'Docker - 统一命令多服务器',
    command: 'docker',
    args: [
      'run',
      '--rm',
      'mcpgateway',
      '--config',
      'mcp-servers.json',
      '--help',
    ],
    expectedMode: 'multi-server',
    timeout: 10000,
  },
  {
    name: 'Docker - 向后兼容single关键字',
    command: 'docker',
    args: [
      'run',
      '--rm',
      'mcpgateway',
      'single',
      '--stdio',
      'echo test',
      '--help',
    ],
    expectedMode: 'single-server',
    timeout: 10000,
  },
  {
    name: 'Docker - 向后兼容multi关键字',
    command: 'docker',
    args: [
      'run',
      '--rm',
      'mcpgateway',
      'multi',
      '--config',
      'config.json',
      '--help',
    ],
    expectedMode: 'multi-server',
    timeout: 10000,
  },
]

// 颜色输出函数
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
}

// 执行单个测试
async function runTest(scenario) {
  return new Promise((resolve) => {
    console.log(colors.blue(`\n📋 测试: ${scenario.name}`))
    console.log(
      colors.blue(`📋 命令: ${scenario.command} ${scenario.args.join(' ')}`),
    )

    const startTime = Date.now()
    const child = spawn(scenario.command, scenario.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let isResolved = false

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    // 设置超时
    const timeout = setTimeout(() => {
      if (!isResolved) {
        child.kill()
        resolve({
          success: false,
          error: `测试超时 (${scenario.timeout}ms)`,
          duration: Date.now() - startTime,
        })
        isResolved = true
      }
    }, scenario.timeout)

    child.on('close', (code) => {
      if (isResolved) return
      isResolved = true
      clearTimeout(timeout)

      const duration = Date.now() - startTime
      const output = stdout + stderr

      // 验证结果
      let success = false
      let message = ''

      if (scenario.expectedMode === 'single-server') {
        success =
          output.includes('single-server mode') ||
          output.includes('Single Server Mode')
        message = success
          ? '✅ 正确识别为单服务器模式'
          : '❌ 未正确识别为单服务器模式'
      } else if (scenario.expectedMode === 'multi-server') {
        success =
          output.includes('multi-server mode') ||
          output.includes('Multi Server Mode')
        message = success
          ? '✅ 正确识别为多服务器模式'
          : '❌ 未正确识别为多服务器模式'
      } else if (scenario.expectedMode === 'version') {
        success = /\d+\.\d+\.\d+/.test(output)
        message = success ? '✅ 版本信息正确显示' : '❌ 版本信息显示异常'
      } else if (scenario.expectedMode === 'help') {
        success = output.includes('McpGateway') && output.includes('Usage')
        message = success ? '✅ 帮助信息正确显示' : '❌ 帮助信息显示异常'
      }

      resolve({
        success,
        message,
        duration,
        output: output.substring(0, 200) + (output.length > 200 ? '...' : ''),
        code,
      })
    })

    child.on('error', (error) => {
      if (isResolved) return
      isResolved = true
      clearTimeout(timeout)

      resolve({
        success: false,
        error: `进程错误: ${error.message}`,
        duration: Date.now() - startTime,
      })
    })
  })
}

// 主测试函数
async function runTests() {
  console.log(colors.bold('🧪 McpGateway 统一命令测试'))
  console.log(colors.bold('=====================================\n'))

  let passedCount = 0
  let totalCount = 0

  // 运行npm命令测试
  console.log(colors.bold('📦 NPM命令测试'))
  console.log('---------------------------')

  for (const scenario of testScenarios) {
    totalCount++
    const result = await runTest(scenario)

    if (result.success) {
      console.log(colors.green(`✅ ${result.message} (${result.duration}ms)`))
      passedCount++
    } else {
      console.log(
        colors.red(
          `❌ ${result.error || result.message} (${result.duration}ms)`,
        ),
      )
      if (result.output) {
        console.log(colors.yellow(`   输出: ${result.output}`))
      }
    }
  }

  // 运行Docker测试（如果Docker可用）
  try {
    console.log(colors.bold('\n🐳 Docker测试'))
    console.log('---------------------------')

    for (const scenario of dockerScenarios) {
      totalCount++
      const result = await runTest(scenario)

      if (result.success) {
        console.log(colors.green(`✅ ${result.message} (${result.duration}ms)`))
        passedCount++
      } else {
        console.log(
          colors.red(
            `❌ ${result.error || result.message} (${result.duration}ms)`,
          ),
        )
        if (result.output) {
          console.log(colors.yellow(`   输出: ${result.output}`))
        }
      }
    }
  } catch (error) {
    console.log(colors.yellow(`⚠️  跳过Docker测试: ${error.message}`))
  }

  // 显示测试总结
  console.log(colors.bold('\n📊 测试总结'))
  console.log('==========================')
  console.log(`总测试数: ${totalCount}`)
  console.log(`通过数: ${colors.green(passedCount)}`)
  console.log(`失败数: ${colors.red(totalCount - passedCount)}`)
  console.log(
    `通过率: ${colors.bold(((passedCount / totalCount) * 100).toFixed(1))}%`,
  )

  if (passedCount === totalCount) {
    console.log(colors.green('\n🎉 所有测试通过！统一命令工作正常！'))
    process.exit(0)
  } else {
    console.log(colors.red('\n❌ 部分测试失败，请检查实现'))
    process.exit(1)
  }
}

// 启动测试
runTests().catch((error) => {
  console.error(colors.red(`测试运行错误: ${error.message}`))
  process.exit(1)
})
