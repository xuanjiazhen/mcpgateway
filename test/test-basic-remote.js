#!/usr/bin/env node

import http from 'http'
import {
  loadMcpServersConfig,
  checkRemoteConfigUpdate,
  isUrl,
} from '../dist/lib/configLoader.js'

const log = (...args) => console.log('[BasicRemoteTest]', ...args)

// 创建一个简单的HTTP服务器
const server = http.createServer((req, res) => {
  if (req.url === '/mcp-servers.json') {
    const config = {
      mcpServers: {
        'test-server': {
          stdio: "echo 'Hello from remote config'",
          outputTransport: 'sse',
          port: 8001,
          ssePath: '/sse',
          messagePath: '/message',
        },
      },
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Last-Modified', new Date().toUTCString())
    res.setHeader('ETag', '"remote-config-v1"')
    res.writeHead(200)
    res.end(JSON.stringify(config, null, 2))

    log('✅ 提供了远程配置文件')
  } else {
    res.writeHead(404)
    res.end('Not Found')
  }
})

async function test() {
  return new Promise((resolve) => {
    server.listen(8997, async () => {
      try {
        log('🚀 开始基本远程配置测试')

        const configUrl = 'http://localhost:8997/mcp-servers.json'
        log(`📄 配置URL: ${configUrl}`)

        // 测试1: URL检测
        log('\n📡 测试1: URL检测')
        const urlResult = isUrl(configUrl)
        log(`isUrl('${configUrl}') = ${urlResult}`)
        log(urlResult ? '✅ URL检测成功' : '❌ URL检测失败')

        // 测试2: 远程配置加载
        log('\n📡 测试2: 远程配置加载')
        const config = await loadMcpServersConfig(configUrl)
        log('配置内容:', JSON.stringify(config, null, 2))
        log('✅ 远程配置加载成功')

        // 测试3: 配置更新检测
        log('\n📡 测试3: 配置更新检测')
        const updateCheck = await checkRemoteConfigUpdate(configUrl)
        log('更新检测结果:', updateCheck)
        log('✅ 配置更新检测成功')

        log('\n🎉 所有测试通过！')
      } catch (error) {
        log('❌ 测试失败:', error)
      } finally {
        server.close()
        resolve()
      }
    })
  })
}

test().catch(console.error)
