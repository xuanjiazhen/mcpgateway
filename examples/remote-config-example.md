# 远程配置使用示例

## 概述

McpGateway现在支持从远程URL加载配置文件，并自动监控配置变化。这使得配置管理更加灵活和集中化。

## 基本使用

### 1. 准备远程配置文件

在您的Web服务器上创建一个`mcp-servers.json`文件：

```json
{
  "mcpServers": {
    "feedback-server": {
      "api": "https://api.example.com/openapi.json",
      "apiHost": "https://api.example.com",
      "outputTransport": "streamable-http",
      "port": 8000,
      "httpPath": "/mcp",
      "ignoreHeader": true
    },
    "filesystem-server": {
      "stdio": "npx -y @modelcontextprotocol/server-filesystem /data",
      "outputTransport": "sse",
      "port": 8001,
      "ssePath": "/sse",
      "messagePath": "/message"
    }
  }
}
```

### 2. 启动动态多服务器

```bash
# 使用远程配置启动
npx dynamic-multi-mcp-server --config https://your-server.com/mcp-servers.json --routerPort 80
```

### 3. 访问服务

```bash
# 访问反馈服务器
curl http://localhost:80/feedback-server/mcp

# 访问文件系统服务器
curl http://localhost:80/filesystem-server/sse

# 查看所有服务器状态
curl http://localhost:80/servers

# 健康检查
curl http://localhost:80/health
```

## 高级功能

### 配置更新监控

系统会每30秒检查一次远程配置文件的更新：

1. **缓存验证**: 使用HTTP头部`Last-Modified`和`ETag`进行高效的缓存验证
2. **自动重载**: 检测到配置更新时，自动重新加载所有路由
3. **零停机**: 配置更新过程中服务保持可用

### 错误处理

- **网络错误**: 如果无法访问远程配置，系统会记录错误但继续使用当前配置
- **格式错误**: 配置文件格式错误时会显示详细的错误信息
- **服务器离线**: 单个MCP服务器离线不会影响其他服务器

## 实际部署示例

### 使用CDN托管配置

```bash
# 将配置文件上传到CDN
# 例如：https://cdn.example.com/configs/production-mcp-servers.json

# 启动服务
npx dynamic-multi-mcp-server \
  --config https://cdn.example.com/configs/production-mcp-servers.json \
  --routerPort 80
```

### 使用API服务器动态配置

```bash
# 配置API端点返回JSON格式的配置
# 例如：https://api.example.com/v1/mcp/config

# 启动服务
npx dynamic-multi-mcp-server \
  --config https://api.example.com/v1/mcp/config \
  --routerPort 80
```

### Docker部署

```yaml
# docker-compose.yml
version: '3.8'
services:
  mcp-gateway:
    image: your-registry/mcp-gateway:latest
    ports:
      - '80:80'
    environment:
      - CONFIG_URL=https://config.example.com/mcp-servers.json
    command: >
      npx dynamic-multi-mcp-server 
      --config $CONFIG_URL 
      --routerPort 80
```

## 配置文件服务器要求

### HTTP头部支持

为了获得最佳性能，您的配置文件服务器应该支持：

```http
# 响应头部示例
HTTP/1.1 200 OK
Content-Type: application/json
Last-Modified: Wed, 09 Jan 2025 12:00:00 GMT
ETag: "config-v1.2.3"
Cache-Control: max-age=30

{
  "mcpServers": {
    ...
  }
}
```

### CORS支持（如果需要）

如果配置服务器和MCP网关在不同域名：

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD
Access-Control-Allow-Headers: Content-Type
```

## 监控和调试

### 查看配置加载日志

```bash
# 启动时会显示配置加载信息
[ConfigLoader] 从远程URL加载配置: https://api.example.com/config.json
[ConfigLoader] 远程配置加载成功，大小: 1024 字节

# 配置更新时会显示
[DynamicRouter] 检测到远程配置更新，重新加载路由...
[DynamicRouter] Loaded 3 server routes
```

### 健康检查API

```bash
# 获取详细的服务器状态
curl -s http://localhost:80/servers | jq
```

```json
{
  "servers": [
    {
      "name": "feedback-server",
      "port": 8000,
      "httpPath": "/mcp",
      "outputTransport": "streamable-http",
      "isAvailable": true,
      "url": "http://localhost:8000/mcp"
    }
  ],
  "totalServers": 1,
  "availableServers": 1
}
```

## 最佳实践

1. **配置版本控制**: 在配置文件中包含版本信息
2. **渐进式更新**: 逐步更新配置，避免一次性大幅改动
3. **监控告警**: 监控配置加载失败和服务器健康状态
4. **备份策略**: 保持配置文件的备份和回滚能力
5. **安全考虑**: 使用HTTPS确保配置文件传输安全

## 故障排除

### 常见问题

1. **配置文件无法访问**

   ```
   错误: 加载配置文件失败: HTTP 404: Not Found
   解决: 检查URL是否正确，服务器是否可访问
   ```

2. **配置格式错误**

   ```
   错误: 配置文件JSON格式错误: Unexpected token
   解决: 验证JSON格式，使用在线JSON验证工具
   ```

3. **网络超时**
   ```
   错误: 请求超时
   解决: 检查网络连接，考虑增加超时时间
   ```

### 调试命令

```bash
# 测试配置文件可访问性
curl -I https://your-server.com/mcp-servers.json

# 验证配置文件格式
curl -s https://your-server.com/mcp-servers.json | jq

# 检查服务器响应时间
time curl -s https://your-server.com/mcp-servers.json > /dev/null
```
