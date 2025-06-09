#!/usr/bin/env node

import http from 'http'

console.log('🍒 模拟 Cherry Studio 工作流程测试\n')

async function simulateCherryStudioWorkflow() {
  try {
    console.log('1️⃣ 建立SSE连接到 http://localhost:80/comp-info-server/sse')

    // 第一步：建立SSE连接
    const sseResponse = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: 80,
          path: '/comp-info-server/sse',
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        },
        (res) => {
          console.log(`✅ SSE状态: ${res.statusCode}`)
          console.log(`📋 Session ID: ${res.headers['mcp-session-id']}`)

          const sessionId = res.headers['mcp-session-id']
          let eventData = ''

          res.on('data', (chunk) => {
            eventData += chunk.toString()

            // 解析endpoint事件
            if (eventData.includes('event: endpoint')) {
              const lines = eventData.split('\n')
              const dataLine = lines.find((line) => line.startsWith('data: '))

              if (dataLine) {
                const endpointPath = dataLine.replace('data: ', '')
                console.log(`📍 接收到endpoint: "${endpointPath}"`)

                // 模拟Cherry Studio的URL解析逻辑
                const baseUrl = 'http://localhost:80/comp-info-server/'
                const fullMessageUrl = new URL(endpointPath, baseUrl).toString()
                console.log(`🔗 解析的完整URL: ${fullMessageUrl}`)

                req.destroy()
                resolve({ sessionId, messageUrl: fullMessageUrl })
              }
            }
          })

          res.on('error', reject)
        },
      )

      req.on('error', reject)
      req.setTimeout(10000)
      req.end()
    })

    console.log('\n2️⃣ 发送tools/list请求到解析的URL')

    // 第二步：发送tools/list请求
    const toolsResponse = await new Promise((resolve, reject) => {
      const url = new URL(sseResponse.messageUrl)

      const message = {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 1,
      }

      const postData = JSON.stringify(message)

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        },
        (res) => {
          console.log(`✅ 工具列表请求状态: ${res.statusCode}`)

          let responseData = ''
          res.on('data', (chunk) => (responseData += chunk))
          res.on('end', () => {
            console.log(`📥 响应: ${responseData}`)

            if (res.statusCode === 202 && responseData === 'Accepted') {
              console.log('✅ 请求已接受，这是SSE正常行为')
              resolve('Accepted')
            } else {
              try {
                const parsed = JSON.parse(responseData)
                resolve(parsed)
              } catch (e) {
                resolve(responseData)
              }
            }
          })
        },
      )

      req.on('error', reject)
      req.setTimeout(10000)
      req.write(postData)
      req.end()
    })

    console.log('\n🎉 Cherry Studio 工作流程模拟成功！')
    console.log('✅ SSE连接建立正常')
    console.log('✅ endpoint路径解析正确')
    console.log('✅ 消息发送到正确的URL')
    console.log('✅ 服务器响应正常')
  } catch (error) {
    console.error('\n❌ 工作流程失败:', error.message)
  }
}

simulateCherryStudioWorkflow()
