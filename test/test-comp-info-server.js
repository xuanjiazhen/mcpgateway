#!/usr/bin/env node

import http from 'http'

console.log('🧪 测试 comp-info-server 的独立性...\n')

// 建立SSE连接并获取session ID
function establishSSEConnection() {
  return new Promise((resolve, reject) => {
    console.log('📡 建立SSE连接到 comp-info-server...')

    const req = http.request(
      {
        hostname: 'localhost',
        port: 80,
        path: '/comp-info-server/sse',
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      },
      (res) => {
        console.log(`✅ SSE连接状态: ${res.statusCode}`)
        console.log(`📋 Session ID: ${res.headers['mcp-session-id']}`)

        const sessionId = res.headers['mcp-session-id']
        if (sessionId) {
          req.destroy() // 关闭SSE连接
          resolve(sessionId)
        } else {
          reject(new Error('未获取到session ID'))
        }
      },
    )

    req.on('error', reject)
    req.setTimeout(10000)
    req.end()
  })
}

// 使用session ID发送消息
function sendMessage(sessionId, message) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(message)

    console.log(
      `💬 发送消息到 comp-info-server (session: ${sessionId.substring(0, 8)}...)`,
    )
    console.log(`📤 消息内容: ${message.method}`)

    const req = http.request(
      {
        hostname: 'localhost',
        port: 80,
        path: `/comp-info-server/message?sessionId=${sessionId}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          console.log(`📥 响应状态: ${res.statusCode}`)
          try {
            const response = JSON.parse(data)
            resolve(response)
          } catch (error) {
            reject(new Error(`JSON解析失败: ${data}`))
          }
        })
      },
    )

    req.on('error', reject)
    req.setTimeout(10000)
    req.write(postData)
    req.end()
  })
}

async function testCompInfoServer() {
  try {
    // 1. 建立连接
    const sessionId = await establishSSEConnection()
    console.log(`\n🔗 连接成功，Session ID: ${sessionId}\n`)

    // 等待一秒确保连接建立
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // 2. 测试 tools/list
    console.log('🔧 测试工具列表...')
    const toolsResponse = await sendMessage(sessionId, {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 1,
    })

    console.log(`✅ 工具列表获取成功`)
    console.log(`📊 工具数量: ${toolsResponse.result?.tools?.length || 0}`)
    if (toolsResponse.result?.tools) {
      toolsResponse.result.tools.forEach((tool, index) => {
        console.log(`   ${index + 1}. ${tool.name} - ${tool.description}`)
      })
    }

    // 3. 测试一个具体的API调用
    console.log('\n🚀 测试API调用...')
    const apiResponse = await sendMessage(sessionId, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'getBsp_admin_feedback_fbFeedback',
        arguments: {
          page_size: 10,
          page_num: 1,
          start_date: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7天前
          end_date: Date.now(),
        },
      },
      id: 2,
    })

    if (apiResponse.result) {
      console.log('✅ API调用成功')
      console.log(
        `📄 响应数据长度: ${JSON.stringify(apiResponse.result).length} 字符`,
      )
    } else if (apiResponse.error) {
      console.log('⚠️  API调用返回错误:')
      console.log(`   错误码: ${apiResponse.error.code}`)
      console.log(`   错误信息: ${apiResponse.error.message}`)
    }

    console.log('\n🎉 comp-info-server 测试完成！')
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
  }
}

testCompInfoServer()
