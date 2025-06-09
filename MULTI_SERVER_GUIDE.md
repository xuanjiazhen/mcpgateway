# 多MCP服务器部署指南

本指南介绍如何在Docker内运行多个MCP服务器，通过JSON配置文件管理，对外只暴露一个端口，使用服务器名称作为路由前缀。

## 功能特性

- 🚀 **统一配置管理**: 通过JSON文件管理多个MCP服务器
- 🔀 **路由分发**: 使用服务器名称作为路由前缀
- 🐳 **Docker支持**: 完整的容器化部署方案
- 🔧 **配置验证**: 自动验证配置文件格式和内容
- 📊 **多种传输**: 支持stdio、sse、api输入模式
- 🌐 **Nginx集成**: 通过反向代理实现统一入口

## 配置文件格式

创建 `mcp-servers.json` 配置文件：

```json
{
  "mcpServers": {
    "mcp-server-feedback": {
      "api": "https://test.com.cn/api/bsp/admin/1.0.0/bsp-admin/files/mcp/feedback.json",
      "apiHost": "https://test.com.cn/api/bsp/admin/1.0.0",
      "outputTransport": "streamable-http",
      "port": 8000,
      "httpPath": "/mcp",
      "ignoreHeader": true
    },
    "server-filesystem": {
      "stdio": "npx -y @modelcontextprotocol/server-filesystem /data",
      "outputTransport": "sse",
      "port": 8001,
      "ssePath": "/sse",
      "messagePath": "/message"
    },
    "comp-info-server": {
      "api": "/data/ibsp.openapi2.json",
      "apiHost": "https://test.com.cn/api/bsp/admin/1.0.0",
      "outputTransport": "sse",
      "port": 8002,
      "ssePath": "/sse",
      "messagePath": "/message"
    }
  }
}
```

### 配置参数说明

#### 输入模式（三选一）

- `stdio`: 运行stdio命令的MCP服务器
- `sse`: 连接到SSE URL的MCP服务器
- `api`: 基于OpenAPI文档或MCP模板的API服务器

#### 输出传输

- `streamable-http`: HTTP流式传输
- `sse`: Server-Sent Events
- `ws`: WebSocket（仅stdio模式支持）

#### 通用参数

- `port`: 服务器端口（必须唯一）
- `logLevel`: 日志级别（info/none）
- `cors`: CORS配置
- `healthEndpoint`: 健康检查端点
- `header`: 自定义请求头
- `oauth2Bearer`: OAuth2 Bearer token

#### 路径配置

- `httpPath`: Streamable HTTP路径（默认：/mcp）
- `ssePath`: SSE订阅路径（默认：/sse）
- `messagePath`: 消息路径（默认：/message）

#### API模式特有参数

- `apiHost`: API服务器基础URL（必需）
- `ignoreHeader`: 忽略OpenAPI中的header参数（默认：false）

## 使用方法

### 1. 本地运行

```bash
# 安装依赖
npm install -g @michlyn/mcpgateway

# 启动多服务器
npx multi-mcp-server --config mcp-servers.json

# 或者使用已安装的命令
multi-mcp-server --config mcp-servers.json

# 指定日志级别
multi-mcp-server --config mcp-servers.json --logLevel info
```

### 2. Docker部署

#### 使用Docker Compose（推荐）

```bash
# 构建并启动
docker-compose -f docker-compose.multi.yml up --build

# 后台运行
docker-compose -f docker-compose.multi.yml up -d --build

# 停止服务
docker-compose -f docker-compose.multi.yml down
```

#### 手动Docker构建

```bash
# 构建镜像
docker build -f Dockerfile.multi -t multi-mcp-server .

# 运行容器
docker run -d \
  --name multi-mcp-server \
  -p 8000:8000 \
  -p 8001:8001 \
  -p 8002:8002 \
  -v $(pwd)/mcp-servers.json:/app/mcp-servers.json:ro \
  -v $(pwd)/data:/data \
  multi-mcp-server
```

## 访问路径

### 直接访问各服务器

根据配置文件中的服务器配置，直接访问路径为：

- **mcp-server-feedback**: http://localhost:8000/mcp
- **server-filesystem**: http://localhost:8001/sse (SSE端点)
- **comp-info-server**: http://localhost:8002/sse (SSE端点)

### 通过Nginx统一入口

当使用Docker Compose部署时，通过Nginx反向代理统一访问：

- **网关入口**: http://localhost:9000
- **服务器路由**:
  - http://localhost:9000/mcp-server-feedback/mcp
  - http://localhost:9000/server-filesystem/sse
  - http://localhost:9000/comp-info-server/sse

## 路由规则

路由规则基于配置文件中的服务器名称：

```
/{server-name}/{original-path}
```

例如：

- 服务器名称：`mcp-server-feedback`
- 原始路径：`/mcp`
- 最终路由：`/mcp-server-feedback/mcp`

## 配置验证

系统会自动验证配置文件：

### 必需验证

- ✅ 配置文件必须包含 `mcpServers` 对象
- ✅ 至少包含一个服务器配置
- ✅ 每个服务器必须指定一种输入模式（stdio/sse/api）
- ✅ 每个服务器必须指定输出传输方式
- ✅ API模式必须指定 `apiHost`

### 冲突检查

- ✅ 端口不能重复
- ✅ 路径格式必须以 `/` 开头

### 错误示例

```json
{
  "mcpServers": {
    "invalid-server": {
      // ❌ 错误：没有指定输入模式
      "outputTransport": "streamable-http",
      "port": 8000
    },
    "duplicate-port": {
      "stdio": "echo hello",
      "outputTransport": "sse",
      "port": 8000 // ❌ 错误：端口重复
    }
  }
}
```

## 测试和验证

### 验证配置文件

```bash
# 运行验证脚本
node test/verify-multi-server.js
```

### 测试多服务器功能

```bash
# 运行测试脚本
npm run test:multi-server
```

### 健康检查

```bash
# 检查各服务器状态
curl http://localhost:8000/health
curl http://localhost:8001/health
curl http://localhost:8002/health

# 通过Nginx检查
curl http://localhost:9000/health
```

## 故障排除

### 常见问题

1. **端口冲突**

   ```
   Error: 端口冲突: 服务器 server1 和 server2 都使用端口 8000
   ```

   解决：为每个服务器配置不同的端口

2. **配置文件格式错误**

   ```
   Error: 配置文件JSON格式错误
   ```

   解决：检查JSON语法，确保所有括号和引号正确

3. **API模式缺少apiHost**

   ```
   Error: 服务器 api-server: 使用 API 模式时必须指定 apiHost
   ```

   解决：为API模式的服务器添加 `apiHost` 参数

4. **Docker容器启动失败**
   ```
   Error: 配置文件不存在
   ```
   解决：确保 `mcp-servers.json` 文件存在且挂载正确

### 日志查看

```bash
# Docker Compose日志
docker-compose -f docker-compose.multi.yml logs -f

# 单个容器日志
docker logs multi-mcp-server

# 实时日志
docker logs -f multi-mcp-server
```

## 性能优化

### 资源配置

```yaml
# docker-compose.multi.yml
services:
  multi-mcp-gateway:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Nginx优化

```nginx
# nginx.conf
worker_processes auto;
worker_connections 2048;

# 启用gzip压缩
gzip on;
gzip_types text/plain application/json;

# 缓存配置
proxy_cache_path /tmp/nginx_cache levels=1:2 keys_zone=my_cache:10m;
```

## 扩展配置

### 添加新服务器

1. 在 `mcp-servers.json` 中添加新的服务器配置
2. 确保端口不冲突
3. 重启服务

```json
{
  "mcpServers": {
    // ... 现有服务器 ...
    "new-server": {
      "stdio": "npx -y @modelcontextprotocol/server-memory",
      "outputTransport": "streamable-http",
      "port": 8003,
      "httpPath": "/mcp"
    }
  }
}
```

### 环境变量支持

可以通过环境变量覆盖配置：

```bash
export MCP_CONFIG_FILE=/custom/path/mcp-servers.json
export MCP_LOG_LEVEL=debug
multi-mcp-server --config $MCP_CONFIG_FILE --logLevel $MCP_LOG_LEVEL
```

## 安全考虑

### 网络安全

- 🔒 使用HTTPS代理
- 🔒 配置防火墙规则
- 🔒 限制访问IP范围

### 认证授权

```json
{
  "mcpServers": {
    "secure-server": {
      "api": "https://api.example.com/openapi.json",
      "apiHost": "https://api.example.com",
      "outputTransport": "streamable-http",
      "port": 8000,
      "oauth2Bearer": "your-access-token",
      "header": ["Authorization: Bearer token", "X-API-Key: key"]
    }
  }
}
```

## 监控和日志

### 日志级别

- `info`: 详细信息（默认）
- `none`: 静默模式

### 监控指标

- 服务器启动状态
- 端口监听状态
- 请求响应时间
- 错误率统计

## 总结

多MCP服务器功能提供了一个完整的解决方案，用于在单个Docker容器中运行多个MCP服务器，通过统一的配置文件管理和Nginx反向代理实现路由分发。这种架构简化了部署和管理，同时保持了各服务器的独立性和可扩展性。
