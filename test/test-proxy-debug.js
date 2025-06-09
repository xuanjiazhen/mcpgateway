#!/usr/bin/env node

import http from 'http'

console.log('Testing proxy response handling...')

// 先直接测试底层服务器
function testDirectConnection() {
  return new Promise((resolve, reject) => {
    console.log('\n=== 测试直接连接到底层服务器 ===')

    const postData = JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 1,
    })

    const options = {
      hostname: 'localhost',
      port: 8000,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(postData),
      },
    }

    const req = http.request(options, (res) => {
      console.log(`直接连接状态码: ${res.statusCode}`)
      console.log(`直接连接响应头:`, res.headers)

      let data = ''
      res.on('data', (chunk) => {
        data += chunk
        console.log(
          `直接连接收到数据: ${chunk.toString().substring(0, 100)}...`,
        )
      })

      res.on('end', () => {
        console.log('✅ 直接连接成功')
        console.log(`完整响应长度: ${data.length}`)
        resolve(data)
      })
    })

    req.on('error', (error) => {
      console.error('❌ 直接连接错误:', error)
      reject(error)
    })

    req.setTimeout(10000)
    req.write(postData)
    req.end()
  })
}

// 然后测试通过代理
function testProxyConnection() {
  return new Promise((resolve, reject) => {
    console.log('\n=== 测试通过代理连接 ===')

    const postData = JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 1,
    })

    const options = {
      hostname: 'localhost',
      port: 80,
      path: '/mcp-server-feedback/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(postData),
      },
    }

    const req = http.request(options, (res) => {
      console.log(`代理连接状态码: ${res.statusCode}`)
      console.log(`代理连接响应头:`, res.headers)

      let data = ''
      res.on('data', (chunk) => {
        data += chunk
        console.log(
          `代理连接收到数据: ${chunk.toString().substring(0, 100)}...`,
        )
      })

      res.on('end', () => {
        console.log('✅ 代理连接成功')
        console.log(`完整响应长度: ${data.length}`)
        resolve(data)
      })
    })

    req.on('error', (error) => {
      console.error('❌ 代理连接错误:', error)
      reject(error)
    })

    req.setTimeout(10000, () => {
      console.log('⏰ 代理连接超时')
      req.destroy()
      reject(new Error('Proxy timeout'))
    })

    req.write(postData)
    req.end()
  })
}

async function runTests() {
  try {
    await testDirectConnection()
    await new Promise((resolve) => setTimeout(resolve, 2000)) // 等待2秒
    await testProxyConnection()
    console.log('\n🎉 所有测试完成')
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
  }
}

runTests()
