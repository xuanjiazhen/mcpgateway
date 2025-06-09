#!/usr/bin/env node

import http from 'http'

console.log('🔧 测试修复后的 Streamable HTTP 服务\n')

async function testStreamableHttpService() {
  try {
    console.log('1️⃣ 测试服务器状态检查')

    // 检查动态路由器状态
    const routerStatus = await checkRouterStatus()
    console.log(`✅ 路由器状态: ${routerStatus.status}`)
    console.log(
      `📊 可用服务器: ${routerStatus.availableServers}/${routerStatus.totalServers}`,
    )

    if (routerStatus.availableServers === 0) {
      console.log('❌ 没有可用的服务器，请先启动 dynamic-multi-mcp-server')
      return
    }

    console.log('\n2️⃣ 测试 mcp-server-feedback (streamable-http)')

    // 测试工具调用
    const toolResult = await testToolCall()
    console.log('✅ 工具调用测试结果:', toolResult)

    console.log('\n🎉 所有测试通过！')
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    console.error('详细错误:', error)
  }
}

async function checkRouterStatus() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 80,
        path: '/servers',
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          if (res.statusCode === 200) {
            const result = JSON.parse(data)
            resolve({
              status: 'ok',
              totalServers: result.totalServers,
              availableServers: result.servers.filter((s) => s.isAvailable)
                .length,
            })
          } else {
            reject(new Error(`Router status check failed: ${res.statusCode}`))
          }
        })
      },
    )

    req.on('error', reject)
    req.setTimeout(5000)
    req.end()
  })
}

async function testToolCall() {
  return new Promise((resolve, reject) => {
    // 构造一个简单的工具调用请求
    const message = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'getBsp_admin_feedback_fbFeedback',
        arguments: {
          page_size: 5,
          page_num: 1,
          start_date: '1717200000000', // 2024年6月1日
          end_date: '1727712000000', // 2024年10月1日
          page_order: 1, // 修正为数字类型
        },
      },
      id: 1,
    }

    const postData = JSON.stringify(message)

    const req = http.request(
      {
        hostname: 'localhost',
        port: 80,
        path: '/mcp-server-feedback/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        console.log(`📋 响应状态: ${res.statusCode} ${res.statusMessage}`)
        console.log(`📋 响应头:`, res.headers)

        let responseData = ''

        res.on('data', (chunk) => {
          responseData += chunk.toString()
          console.log(`📥 数据块: ${chunk.toString()}`)
        })

        res.on('end', () => {
          console.log(`📦 完整响应: ${responseData}`)

          // 检查是否是成功的SSE响应
          if (res.statusCode === 200) {
            if (res.headers['content-type']?.includes('text/event-stream')) {
              console.log('✅ 收到SSE响应')
              resolve({
                type: 'sse',
                data: responseData,
                status: 'success',
              })
            } else {
              // JSON响应
              try {
                const parsed = JSON.parse(responseData)
                resolve({
                  type: 'json',
                  data: parsed,
                  status: 'success',
                })
              } catch (e) {
                resolve({
                  type: 'text',
                  data: responseData,
                  status: 'success',
                })
              }
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`))
          }
        })
      },
    )

    req.on('error', (error) => {
      console.error('请求错误:', error)
      reject(error)
    })

    req.setTimeout(30000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    console.log(`📤 发送请求到: http://localhost:80/mcp-server-feedback/mcp`)
    console.log(`📤 请求数据: ${postData}`)

    req.write(postData)
    req.end()
  })
}

testStreamableHttpService()
