#!/usr/bin/env node

import http from 'http'

console.log('🧪 测试 comp-info-server 的SSE连接...\n')

function testSSEConnection() {
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
        console.log(`🌐 连接类型: ${res.headers['content-type']}`)

        const sessionId = res.headers['mcp-session-id']
        let eventData = ''
        let eventCount = 0

        res.on('data', (chunk) => {
          const data = chunk.toString()
          eventData += data

          if (data.includes('event:')) {
            eventCount++
            console.log(`📨 接收到事件 #${eventCount}:`)
            console.log(`   ${data.trim()}`)
          }

          // 如果收到endpoint事件，我们就知道连接已建立
          if (data.includes('event: endpoint')) {
            console.log('\n✅ SSE连接完全建立！')
            console.log(`📊 总共接收到 ${eventCount} 个事件`)

            // 现在测试消息发送
            setTimeout(() => {
              testMessageSending(sessionId, req, res)
            }, 1000)
          }
        })

        res.on('end', () => {
          console.log('🔚 SSE连接结束')
          resolve()
        })

        res.on('error', (error) => {
          console.error('❌ SSE连接错误:', error)
          reject(error)
        })
      },
    )

    req.on('error', (error) => {
      console.error('❌ 请求错误:', error)
      reject(error)
    })

    req.setTimeout(30000, () => {
      console.log('⏰ 测试完成（30秒超时）')
      req.destroy()
      resolve()
    })

    req.end()
  })
}

function testMessageSending(sessionId, sseReq, sseRes) {
  console.log('\n💬 测试消息发送...')

  const message = {
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: 1,
  }

  const postData = JSON.stringify(message)

  const messageReq = http.request(
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
    (messageRes) => {
      console.log(`📤 消息发送状态: ${messageRes.statusCode}`)

      let responseData = ''
      messageRes.on('data', (chunk) => (responseData += chunk))
      messageRes.on('end', () => {
        console.log(`📥 消息响应: ${responseData}`)

        // 等待一下看SSE是否有响应
        setTimeout(() => {
          console.log('\n🏁 关闭连接...')
          sseReq.destroy()
        }, 5000)
      })
    },
  )

  messageReq.on('error', (error) => {
    console.error('❌ 消息发送错误:', error)
  })

  messageReq.write(postData)
  messageReq.end()
}

console.log('🚀 开始测试...')
testSSEConnection().catch(console.error)
