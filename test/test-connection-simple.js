#!/usr/bin/env node

import http from 'http'

console.log('Testing connection to http://localhost:80/mcp-server-feedback/mcp')

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
  console.log(`状态码: ${res.statusCode}`)
  console.log(`响应头:`, JSON.stringify(res.headers, null, 2))

  let data = ''
  res.on('data', (chunk) => {
    data += chunk
    console.log('收到数据块:', chunk.toString())
  })

  res.on('end', () => {
    console.log('✅ 连接成功！')
    console.log('完整响应:', data)
    process.exit(0)
  })
})

req.on('error', (error) => {
  console.error('❌ 连接错误:', error)
  process.exit(1)
})

req.setTimeout(15000, () => {
  console.log('⏰ 请求超时（15秒）')
  req.destroy()
  process.exit(1)
})

console.log('发送请求...')
req.write(postData)
req.end()
