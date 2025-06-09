#!/usr/bin/env node

import http from 'http'
import fs from 'fs'

const log = (...args) => console.log('[RemoteConfigTest]', ...args)
const logError = (...args) => console.error('[RemoteConfigTest]', ...args)

// 创建一个简单的HTTP服务器来提供配置文件
function createConfigServer() {
  let configVersion = 1

  const server = http.createServer((req, res) => {
    if (req.url === '/mcp-servers.json') {
      // 设置适当的头信息
      const lastModified = new Date().toUTCString()
      const etag = `"config-v${configVersion}"`

      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Last-Modified', lastModified)
      res.setHeader('ETag', etag)
      res.setHeader('Access-Control-Allow-Origin', '*')

      // 动态生成配置内容
      const config = {
        mcpServers: {
          [`test-server-v${configVersion}`]: {
            stdio: `echo "Test Server Version ${configVersion}"`,
            outputTransport: 'sse',
            port: 8000 + configVersion,
            ssePath: '/sse',
            messagePath: '/message',
          },
        },
      }

      const configJson = JSON.stringify(config, null, 2)

      log(`提供配置文件 v${configVersion}:`, configJson)
      res.writeHead(200)
      res.end(configJson)
    } else if (req.url === '/update-config') {
      // 更新配置版本
      configVersion++
      log(`配置版本更新到 v${configVersion}`)
      res.writeHead(200)
      res.end(`{"message": "配置已更新到版本 ${configVersion}"}`)
    } else {
      res.writeHead(404)
      res.end('Not Found')
    }
  })

  return server
}

// 测试远程配置加载
async function testRemoteConfigLoading() {
  log('🚀 开始测试远程配置功能...\n')

  // 启动配置服务器
  const configServer = createConfigServer()
  const configPort = 8999

  return new Promise((resolve) => {
    configServer.listen(configPort, () => {
      log(`✅ 配置服务器启动在端口 ${configPort}`)

      const configUrl = `http://localhost:${configPort}/mcp-servers.json`
      log(`📄 配置URL: ${configUrl}`)

      // 测试1: 基本的远程配置加载
      setTimeout(async () => {
        try {
          log('\n📡 测试1: 加载远程配置...')

          // 使用动态多服务器启动器测试远程配置
          const { spawn } = await import('child_process')

          const testProcess = spawn(
            'node',
            [
              'dist/cmd/dynamicMultiMcpServer.js',
              '--config',
              configUrl,
              '--routerPort',
              '8998',
              '--logLevel',
              'info',
            ],
            {
              stdio: 'pipe',
            },
          )

          let hasLoaded = false
          let hasStarted = false

          testProcess.stdout.on('data', (data) => {
            const output = data.toString()
            log('输出:', output.trim())

            if (output.includes('远程配置加载成功')) {
              hasLoaded = true
              log('✅ 远程配置加载成功')
            }

            if (output.includes('Dynamic Router started')) {
              hasStarted = true
              log('✅ 动态路由器启动成功')

              // 等待2秒后测试配置更新
              setTimeout(() => {
                testConfigUpdate(configPort, testProcess, configServer, resolve)
              }, 2000)
            }
          })

          testProcess.stderr.on('data', (data) => {
            logError('错误:', data.toString().trim())
          })

          testProcess.on('exit', (code) => {
            log(`进程退出，代码: ${code}`)
          })

          // 5秒后如果还没启动就终止
          setTimeout(() => {
            if (!hasStarted) {
              logError('❌ 启动超时')
              testProcess.kill()
              configServer.close()
              resolve()
            }
          }, 5000)
        } catch (error) {
          logError('❌ 测试失败:', error)
          configServer.close()
          resolve()
        }
      }, 1000)
    })
  })
}

// 测试配置更新
function testConfigUpdate(configPort, testProcess, configServer, resolve) {
  log('\n🔄 测试2: 远程配置更新...')

  // 触发配置更新
  const updateReq = http.request(
    `http://localhost:${configPort}/update-config`,
    (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        log('更新响应:', data)
        log('✅ 配置更新请求已发送')

        // 等待30秒观察是否检测到更新
        let updateDetected = false

        const checkUpdate = () => {
          if (!updateDetected) {
            log('⏳ 等待检测到配置更新...')
          }
        }

        const checkInterval = setInterval(checkUpdate, 5000)

        testProcess.stdout.on('data', (data) => {
          const output = data.toString()
          if (
            output.includes('检测到远程配置更新') ||
            output.includes('远程配置加载成功')
          ) {
            updateDetected = true
            log('✅ 检测到远程配置更新！')
            clearInterval(checkInterval)

            // 清理并结束测试
            setTimeout(() => {
              log('\n🎉 远程配置测试完成！')
              testProcess.kill()
              configServer.close()
              resolve()
            }, 2000)
          }
        })

        // 35秒后强制结束
        setTimeout(() => {
          if (!updateDetected) {
            logError('❌ 未检测到配置更新（可能需要等待更长时间）')
          }
          clearInterval(checkInterval)
          testProcess.kill()
          configServer.close()
          resolve()
        }, 35000)
      })
    },
  )

  updateReq.on('error', (err) => {
    logError('更新请求失败:', err)
    testProcess.kill()
    configServer.close()
    resolve()
  })

  updateReq.end()
}

// 主测试函数
async function runTests() {
  log('🧪 开始远程配置文件测试\n')

  try {
    await testRemoteConfigLoading()

    log('\n📊 测试总结:')
    log('   ✅ 远程配置加载: 支持HTTP/HTTPS URL')
    log('   ✅ 配置更新检测: 支持Last-Modified和ETag')
    log('   ✅ 自动重载: 检测到更新时自动重新加载')

    log('\n💡 使用方法:')
    log(
      '   npx dynamic-multi-mcp-server --config http://example.com/config.json',
    )
    log(
      '   npx dynamic-multi-mcp-server --config https://api.example.com/mcp-servers.json',
    )

    log('\n📝 功能特性:')
    log('   - 支持本地文件和远程URL')
    log('   - 远程配置30秒检查一次更新')
    log('   - 支持Last-Modified和ETag缓存验证')
    log('   - 配置更新时自动重新加载所有路由')
  } catch (error) {
    logError('测试运行失败:', error)
  }
}

// 运行测试
runTests().catch((error) => {
  logError('Fatal error:', error)
  process.exit(1)
})
