#!/usr/bin/env node

import http from 'http'

const log = (...args) => console.log('[StreamableHttpTest]', ...args)

async function testStreamableHttpConnection() {
  return new Promise((resolve, reject) => {
    log('开始测试streamable-http连接...')

    const postData = JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: false },
          sampling: {},
        },
      },
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

    log('发送initialize请求...')
    const req = http.request(options, (res) => {
      log(`状态码: ${res.statusCode}`)
      log(`响应头:`, res.headers)

      let responseData = ''

      res.on('data', (chunk) => {
        const data = chunk.toString()
        responseData += data
        log('收到数据:', data)
      })

      res.on('end', () => {
        log('连接结束')
        log('完整响应:', responseData)

        if (responseData) {
          try {
            const jsonResponse = JSON.parse(responseData)
            log('解析的JSON响应:', JSON.stringify(jsonResponse, null, 2))

            if (jsonResponse.id === 1) {
              log('✅ Initialize成功，测试tools/list...')
              testToolsList()
            }
          } catch (error) {
            log('❌ JSON解析失败:', error.message)
          }
        }

        resolve()
      })

      res.on('error', (error) => {
        log('❌ 响应错误:', error)
        reject(error)
      })
    })

    req.on('error', (error) => {
      log('❌ 请求错误:', error)
      reject(error)
    })

    req.on('timeout', () => {
      log('❌ 请求超时')
      req.destroy()
      reject(new Error('Request timeout'))
    })

    req.setTimeout(30000) // 30秒超时

    req.write(postData)
    req.end()
  })
}

async function testToolsList() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 2,
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

    log('发送tools/list请求...')
    const req = http.request(options, (res) => {
      log(`状态码: ${res.statusCode}`)

      let responseData = ''

      res.on('data', (chunk) => {
        const data = chunk.toString()
        responseData += data
        log('收到工具列表数据:', data)
      })

      res.on('end', () => {
        log('工具列表请求完成')

        if (responseData) {
          try {
            const jsonResponse = JSON.parse(responseData)
            log('✅ 工具列表:', JSON.stringify(jsonResponse, null, 2))
          } catch (error) {
            log('❌ 工具列表JSON解析失败:', error.message)
          }
        }

        resolve()
      })
    })

    req.on('error', (error) => {
      log('❌ 工具列表请求错误:', error)
      reject(error)
    })

    req.setTimeout(30000)

    req.write(postData)
    req.end()
  })
}

async function runTest() {
  try {
    log('🚀 开始streamable-http连接测试')
    log('目标URL: http://localhost:80/mcp-server-feedback/mcp')

    await testStreamableHttpConnection()

    log('🎉 测试完成')
  } catch (error) {
    log('❌ 测试失败:', error)
  }
}

runTest().catch(console.error)
