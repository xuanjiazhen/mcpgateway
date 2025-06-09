# Streamable-HTTP 服务使用指南

## 概述

Streamable-HTTP是MCP Gateway支持的一种传输协议，它将MCP服务器包装为HTTP API，同时支持JSON和Server-Sent Events (SSE)响应。

## 基本要求

### Accept头要求

streamable-http服务**严格要求**客户端的Accept头必须同时包含：

```
Accept: application/json, text/event-stream
```

❌ **错误示例**:

```
Accept: text/event-stream
Accept: application/json
```

✅ **正确示例**:

```
Accept: application/json, text/event-stream
```

### Content-Type要求

对于POST请求，必须设置正确的Content-Type：

```
Content-Type: application/json
```

## 配置示例

在`mcp-servers.json`中配置streamable-http服务：

```json
{
  "mcpServers": {
    "mcp-server-feedback": {
      "api": "https://example.com/api/openapi.json",
      "apiHost": "https://example.com/api",
      "outputTransport": "streamable-http",
      "port": 8000,
      "httpPath": "/mcp",
      "ignoreHeader": true
    }
  }
}
```

## 访问方式

### 通过动态多MCP服务器系统

```
http://localhost:80/{server-name}/mcp
```

例如：

```
http://localhost:80/mcp-server-feedback/mcp
```

## 工具调用示例

### JavaScript/Node.js

```javascript
const message = {
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name: 'getBsp_admin_feedback_fbFeedback',
    arguments: {
      page_size: 5, // 注意：数字类型
      page_num: 1, // 注意：数字类型
      page_order: 1, // 注意：数字类型，不是字符串
      start_date: '1717200000000', // 字符串类型
      end_date: '1727712000000', // 字符串类型
    },
  },
  id: 1,
}

const response = await fetch('http://localhost:80/mcp-server-feedback/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream', // 关键：两种类型都要包含
  },
  body: JSON.stringify(message),
})
```

### cURL

```bash
curl -X POST http://localhost:80/mcp-server-feedback/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "getBsp_admin_feedback_fbFeedback",
      "arguments": {
        "page_size": 5,
        "page_num": 1,
        "page_order": 1,
        "start_date": "1717200000000",
        "end_date": "1727712000000"
      }
    },
    "id": 1
  }'
```

## 响应格式

### 成功响应

streamable-http服务返回SSE格式的响应：

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

event: message
data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"..."}]}}

```

### 错误响应

#### Accept头错误 (406)

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Not Acceptable: Client must accept both application/json and text/event-stream"
  },
  "id": null
}
```

#### 参数类型错误 (200 with error)

```
event: message
data: {"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"MCP error -32602: Invalid arguments for tool getBsp_admin_feedback_fbFeedback: [...]"}}
```

## 常见问题

### Q: 为什么收到406 Not Acceptable错误？

A: 检查Accept头是否同时包含`application/json`和`text/event-stream`。

### Q: 为什么工具调用参数验证失败？

A: 检查参数类型，特别注意：

- 数字参数不要用字符串
- 字符串参数要用引号
- 布尔参数用true/false

### Q: 如何处理SSE响应？

A: SSE响应格式为：

```
event: message
data: {JSON数据}
```

解析时需要：

1. 按行分割
2. 找到以`data: `开头的行
3. 提取JSON数据并解析

## 测试工具

使用项目提供的测试脚本验证服务：

```bash
# 测试streamable-http服务
node test/test-streamable-http-fix.js

# 检查服务器状态
curl http://localhost:80/servers
```

## 调试技巧

1. **检查服务器状态**：访问`/servers`端点查看服务器是否正常运行
2. **查看详细日志**：启动时使用`--logLevel info`查看详细日志
3. **验证配置**：确保`mcp-servers.json`中的配置正确
4. **端口检查**：使用`lsof -i :端口号`检查端口是否被占用

## 最佳实践

1. **总是包含正确的Accept头**
2. **验证参数类型**：特别注意数字和字符串的区别
3. **处理SSE响应**：正确解析event-stream格式
4. **错误处理**：检查HTTP状态码和JSON错误信息
5. **超时设置**：设置合理的请求超时时间（建议30秒）
