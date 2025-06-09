#!/bin/sh
set -e

# 显示Docker容器启动信息
echo "🐳 McpGateway Docker Container"

# 处理帮助和版本
if [ "$1" = "--help" ] || [ "$1" = "-h" ] || [ "$1" = "--version" ] || [ "$1" = "-v" ]; then
    echo ""
    echo "This container uses the unified 'mcpgateway' command that automatically"
    echo "detects whether to run in single-server or multi-server mode."
    echo ""
    echo "Examples:"
    echo "  # Single server mode (auto-detected)"
    echo "  docker run mcpgateway --stdio 'npx server' --port 8000"
    echo "  docker run mcpgateway --sse 'https://server.com' --outputTransport streamable-http"
    echo ""
    echo "  # Multi-server mode (auto-detected)"
    echo "  docker run mcpgateway --config mcp-servers.json"
    echo "  docker run mcpgateway mcp-servers.json"
    echo ""
    exec mcpgateway --help
fi

# 默认：使用统一的mcpgateway命令
echo "🚀 Starting McpGateway..."
exec mcpgateway "$@" 