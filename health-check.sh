#!/bin/sh

# 智能健康检查脚本
# 根据运行模式动态检测正确的端口

# 检查进程参数来判断运行模式
PROCESSES=$(ps aux | grep mcpgateway | grep -v grep)

# 检查是否有多服务器模式（通常使用80端口的路由器）
if echo "$PROCESSES" | grep -q "\-\-config\|\-\-routerPort\|\.json"; then
    # 多服务器模式 - 检查路由器端口
    ROUTER_PORT=$(echo "$PROCESSES" | grep -o '\--routerPort [0-9]*' | cut -d' ' -f2)
    if [ -z "$ROUTER_PORT" ]; then
        ROUTER_PORT=80  # 默认路由器端口
    fi
    
    echo "Checking multi-server mode on port $ROUTER_PORT"
    if curl -f http://localhost:$ROUTER_PORT/health 2>/dev/null; then
        echo "Multi-server health check passed"
        exit 0
    fi
    
    # 如果/health不可用，尝试根路径
    if curl -f http://localhost:$ROUTER_PORT/ 2>/dev/null; then
        echo "Multi-server root check passed"
        exit 0
    fi
else
    # 单服务器模式 - 检查服务器端口
    SERVER_PORT=$(echo "$PROCESSES" | grep -o '\--port [0-9]*' | cut -d' ' -f2)
    if [ -z "$SERVER_PORT" ]; then
        SERVER_PORT=8000  # 默认服务器端口
    fi
    
    echo "Checking single-server mode on port $SERVER_PORT"
    if curl -f http://localhost:$SERVER_PORT/health 2>/dev/null; then
        echo "Single-server health check passed"
        exit 0
    fi
    
    # 如果/health不可用，尝试根路径
    if curl -f http://localhost:$SERVER_PORT/ 2>/dev/null; then
        echo "Single-server root check passed"
        exit 0
    fi
fi

echo "Health check failed"
exit 1 