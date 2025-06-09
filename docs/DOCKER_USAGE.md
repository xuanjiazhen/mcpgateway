# Docker 使用指南

## 概述

本项目提供了统一的Docker镜像，支持智能的单一 `mcpgateway` 命令，可根据参数自动选择单个MCP服务器运行或多个MCP服务器的动态路由系统。

## 镜像特性

### 🚀 **统一命令架构**

- 基于 `node:20-alpine` 轻量级镜像
- 内置智能的 `mcpgateway` 命令
- 基于参数自动检测运行模式

### 🧠 **智能模式检测**

- **单服务器模式**: 自动检测 `--stdio`, `--sse`, `--api` 等参数
- **多服务器模式**: 自动检测 `--config`, `.json` 文件等参数
- **简洁明了**: 无需记忆模式关键字，智能检测运行模式

### 🛡️ **健壮性**

- 智能健康检查
- 自动重启机制
- 完善的错误处理

## 快速开始

### 1. 构建镜像

```bash
# 构建统一镜像
docker build -t mcp-gateway .
```

### 2. 运行模式

#### A. 多服务器模式（推荐）

```bash
# 使用docker-compose（推荐）
docker-compose up -d

# 或者直接运行
docker run -d \
  --name mcp-gateway-multi \
  -p 80:80 \
  -p 8000-8010:8000-8010 \
  -v $(pwd)/mcp-servers.json:/app/mcp-servers.json:ro \
  mcp-gateway
```

访问地址：

- 统一入口: http://localhost:80
- 服务器状态: http://localhost:80/servers
- 健康检查: http://localhost:80/health

#### B. 单服务器模式

```bash
# 启用单服务器profile
docker-compose --profile single up mcp-gateway-single

# 或者直接运行（自动检测单服务器模式）
docker run -d \
  --name mcp-gateway-single \
  -p 8001:8000 \
  -v mcp-data:/data \
  mcp-gateway \
  --stdio "npx -y @modelcontextprotocol/server-filesystem /data" \
  --output-transport streamable-http \
  --port 8000
```

访问地址：

- 服务端点: http://localhost:8001/mcp

## 配置方式

### 多服务器配置文件

创建 `mcp-servers.json` 配置文件：

```json
{
  "mcpServers": {
    "feedback-server": {
      "api": "https://api.example.com/openapi.json",
      "apiHost": "https://api.example.com",
      "outputTransport": "streamable-http",
      "port": 8000,
      "httpPath": "/mcp"
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

### 环境变量

```bash
# 生产环境
NODE_ENV=production

# 日志级别
LOG_LEVEL=info

# 自定义端口（可选）
PORT=8000
ROUTER_PORT=80
```

## Docker Compose 详解

### 主配置文件 (docker-compose.yml)

```yaml
version: '3.8'

services:
  # 多服务器模式（默认）
  mcp-gateway-multi:
    build: .
    ports:
      - '80:80'
      - '8000-8010:8000-8010'
    volumes:
      - ./mcp-servers.json:/app/mcp-servers.json:ro
    command: ['--config', 'mcp-servers.json'] # 自动检测多服务器模式

  # 单服务器模式（可选）
  mcp-gateway-single:
    build: .
    ports:
      - '8001:8000'
    profiles: ['single']
    command: [
        '--stdio',
        'npx -y @modelcontextprotocol/server-filesystem /data',
        '--port',
        '8000',
      ] # 自动检测单服务器模式
```

### 运行命令

```bash
# 启动多服务器模式
docker-compose up -d

# 启动单服务器模式
docker-compose --profile single up -d mcp-gateway-single

# 同时启动两种模式
docker-compose --profile single up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## 高级用法

### 1. 自定义启动命令

```bash
# 多服务器模式（自动检测）
docker run mcp-gateway --config /custom/config.json

# 单服务器模式（自动检测）
docker run mcp-gateway --api "https://api.example.com" --port 8000
docker run mcp-gateway --stdio "npx server" --port 8000
docker run mcp-gateway --sse "https://server.com" --outputTransport streamable-http

# 更多示例
docker run mcp-gateway /path/to/config.json  # 直接指定配置文件
docker run mcp-gateway --sse "https://sse-server.com" --outputTransport sse

# 查看帮助和版本
docker run mcp-gateway --help
docker run mcp-gateway --version
```

### 2. 挂载自定义配置

```bash
# 挂载配置目录
docker run -d \
  -v $(pwd)/config:/config \
  -v $(pwd)/data:/data \
  mcp-gateway \
  --config /config/mcp-servers.json
```

### 3. 网络配置

```bash
# 使用自定义网络
docker network create mcp-network
docker run -d --network mcp-network mcp-gateway
```

### 4. 健康检查和监控

```bash
# 检查容器健康状态
docker inspect --format='{{.State.Health.Status}}' mcp-gateway-multi

# 查看健康检查日志
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' mcp-gateway-multi

# 手动健康检查
docker exec mcp-gateway-multi curl -f http://localhost:80/health
```

## 故障排除

### 1. 端口冲突

如果端口被占用，修改端口映射：

```bash
# 修改外部端口
docker run -p 8080:80 mcp-gateway
```

### 2. 配置文件问题

```bash
# 验证配置文件
docker run --rm -v $(pwd)/mcp-servers.json:/app/test.json mcp-gateway \
  node -e "console.log(JSON.parse(require('fs').readFileSync('/app/test.json')))"
```

### 3. 权限问题

```bash
# 确保配置文件可读
chmod 644 mcp-servers.json

# 检查挂载目录权限
ls -la ./data
```

### 4. 查看详细日志

```bash
# 运行时查看日志
docker logs -f mcp-gateway-multi

# 启动时显示详细日志
docker run --rm mcp-gateway dynamic-multi-mcp-server --config mcp-servers.json --logLevel info
```

## 性能优化

### 1. 资源限制

```yaml
services:
  mcp-gateway-multi:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'
```

### 2. 缓存优化

```dockerfile
# 在构建时启用npm缓存
RUN npm ci --only=production --cache /tmp/.npm-cache
```

### 3. 健康检查优化

```yaml
healthcheck:
  test: ['CMD', 'curl', '-f', 'http://localhost:80/health']
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

## 安全建议

1. **不要在生产环境中暴露所有端口范围**
2. **使用只读挂载配置文件**
3. **定期更新基础镜像**
4. **限制容器资源使用**
5. **使用非root用户运行容器**

```dockerfile
# 添加非root用户
RUN addgroup -g 1001 -S mcp && \
    adduser -S mcp -u 1001 -G mcp
USER mcp
```
