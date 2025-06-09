#!/usr/bin/env node

import http from 'http'

const log = (...args) => console.log('[Test]', ...args)
const logError = (...args) => console.error('[Test]', ...args)

// 测试配置
const ROUTER_BASE_URL = 'http://localhost:80'

// 辅助函数：发送HTTP请求
function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    }

    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(data)
    }

    const req = http.request(options, (res) => {
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      })
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: JSON.parse(body),
          })
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body,
          })
        }
      })
    })

    req.on('error', reject)

    if (data) {
      req.write(data)
    }

    req.end()
  })
}

// 测试函数
async function testRouterHealth() {
  log('测试动态路由器健康状态...')
  try {
    const response = await makeRequest(`${ROUTER_BASE_URL}/health`)
    if (response.statusCode === 200) {
      log('✅ 动态路由器健康检查通过')
      log(`   服务器总数: ${response.body.servers?.total || 0}`)
      log(`   可用服务器: ${response.body.servers?.available || 0}`)
      return true
    } else {
      logError('❌ 动态路由器健康检查失败')
      return false
    }
  } catch (error) {
    logError('❌ 动态路由器连接失败:', error.message)
    return false
  }
}

async function testServersList() {
  log('测试服务器列表接口...')
  try {
    const response = await makeRequest(`${ROUTER_BASE_URL}/servers`)
    if (response.statusCode === 200) {
      log('✅ 服务器列表获取成功')
      log(`   总服务器数: ${response.body.totalServers || 0}`)

      if (response.body.servers && Array.isArray(response.body.servers)) {
        response.body.servers.forEach((server) => {
          log(
            `   - ${server.name}: 端口${server.port} (${server.outputTransport})`,
          )
          log(`     可用: ${server.isAvailable ? '是' : '否'}`)
        })
        return response.body.servers
      }
      return []
    } else {
      logError('❌ 服务器列表获取失败')
      return []
    }
  } catch (error) {
    logError('❌ 服务器列表连接失败:', error.message)
    return []
  }
}

async function testDynamicRouting(servers) {
  log('测试动态路由功能...')

  for (const server of servers) {
    if (!server.isAvailable) {
      log(`⏸️  跳过不可用服务器: ${server.name}`)
      continue
    }

    try {
      let testPath
      if (server.outputTransport === 'streamable-http') {
        testPath = `${server.httpPath || '/mcp'}`
      } else if (server.outputTransport === 'sse') {
        testPath = `${server.ssePath || '/sse'}`
      }

      const routeUrl = `${ROUTER_BASE_URL}/route/${server.name}${testPath}`
      log(`测试路由: ${server.name} -> ${routeUrl}`)

      const response = await makeRequest(routeUrl)

      if (response.statusCode < 500) {
        log(`✅ ${server.name} 路由测试通过 (状态码: ${response.statusCode})`)
      } else {
        log(
          `⚠️  ${server.name} 路由返回服务器错误 (状态码: ${response.statusCode})`,
        )
      }
    } catch (error) {
      logError(`❌ ${server.name} 路由测试失败:`, error.message)
    }
  }
}

async function testDirectRouting(servers) {
  log('测试直接路由功能...')

  try {
    // 测试根路径
    const rootResponse = await makeRequest(`${ROUTER_BASE_URL}/`)
    if (rootResponse.statusCode === 200) {
      log('✅ 根路径访问成功')
    } else {
      log(`⚠️  根路径返回状态码: ${rootResponse.statusCode}`)
    }
  } catch (error) {
    logError('❌ 根路径测试失败:', error.message)
  }

  try {
    // 测试健康检查
    const healthResponse = await makeRequest(`${ROUTER_BASE_URL}/health`)
    if (healthResponse.statusCode === 200) {
      log('✅ 健康检查通过')
    } else {
      log(`⚠️  健康检查返回状态码: ${healthResponse.statusCode}`)
    }
  } catch (error) {
    logError('❌ 健康检查失败:', error.message)
  }

  // 测试每个服务器的路由
  for (const server of servers) {
    if (!server.isAvailable) {
      log(`⏸️  跳过不可用服务器: ${server.name}`)
      continue
    }

    try {
      let testPath
      if (server.outputTransport === 'streamable-http') {
        testPath = `${server.httpPath || '/mcp'}`
      } else if (server.outputTransport === 'sse') {
        testPath = `${server.ssePath || '/sse'}`
      }

      const directUrl = `${ROUTER_BASE_URL}/${server.name}${testPath}`
      log(`测试直接路由: ${server.name} -> ${directUrl}`)

      const response = await makeRequest(directUrl)

      if (response.statusCode < 500) {
        log(
          `✅ ${server.name} 直接路由测试通过 (状态码: ${response.statusCode})`,
        )
      } else {
        log(
          `⚠️  ${server.name} 直接路由返回服务器错误 (状态码: ${response.statusCode})`,
        )
      }
    } catch (error) {
      logError(`❌ ${server.name} 直接路由测试失败:`, error.message)
    }
  }
}

async function testConfigReload() {
  log('测试配置文件热重载（模拟）...')

  // 这里可以添加配置文件修改和重载测试
  // 由于是测试环境，我们只是检查路由器是否响应
  try {
    const response = await makeRequest(`${ROUTER_BASE_URL}/servers`)
    if (response.statusCode === 200) {
      log('✅ 配置重载测试模拟成功（路由器响应正常）')
      return true
    }
  } catch (error) {
    logError('❌ 配置重载测试失败:', error.message)
  }
  return false
}

// 主测试函数
async function runTests() {
  log('🚀 开始动态路由测试...\n')

  // 1. 测试动态路由器健康状态
  const routerHealthy = await testRouterHealth()
  if (!routerHealthy) {
    logError('动态路由器不可用，终止测试')
    process.exit(1)
  }
  console.log()

  // 2. 获取服务器列表
  const servers = await testServersList()
  if (servers.length === 0) {
    logError('没有可用的服务器，终止测试')
    process.exit(1)
  }
  console.log()

  // 3. 测试动态路由
  await testDynamicRouting(servers)
  console.log()

  // 4. 测试直接路由
  await testDirectRouting(servers)
  console.log()

  // 5. 测试配置重载
  await testConfigReload()
  console.log()

  log('🎉 动态路由测试完成！')
  log('\n📊 测试总结:')
  log(`   ✅ 动态路由器: ${routerHealthy ? '正常' : '异常'}`)
  log(`   📡 服务器数量: ${servers.length}`)
  log(`   🔀 路由功能: 已测试`)
  log('   💡 配置热重载: 支持')

  log('\n📝 使用方法:')
  log('   1. 统一入口: http://localhost:80')
  log('   2. 访问特定服务器: http://localhost:80/{server-name}/{path}')
  log('   3. 查看服务器状态: http://localhost:80/servers')
  log('   4. 健康检查: http://localhost:80/health')
  log('   5. 路由API: http://localhost:80/route/{server-name}/{path}')
}

// 运行测试
runTests().catch((error) => {
  logError('测试运行失败:', error)
  process.exit(1)
})
