FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 设置npm镜像源（使用中国镜像加速）
RUN npm config set registry https://registry.npmmirror.com/

# 复制package文件
COPY package*.json ./

# 禁用husky钩子（在Docker中不需要）
RUN echo '#!/bin/sh\nexit 0' > /usr/local/bin/husky && chmod +x /usr/local/bin/husky

# 安装依赖
RUN npm ci --only=production --ignore-scripts

# 复制编译后的代码和配置文件
COPY dist/ ./dist/
COPY README.md LICENSE ./
COPY health-check.sh docker-entrypoint.sh ./

# 全局安装当前包，使命令行工具可用
RUN npm link --ignore-scripts

# 创建数据目录
RUN mkdir -p /data /config

# 设置环境变量
ENV NODE_ENV=production
ENV PATH=/app/node_modules/.bin:$PATH

# 暴露端口范围（支持单个和多个服务器）
EXPOSE 8000-8010 80 9001

# 设置脚本执行权限
RUN chmod +x /app/docker-entrypoint.sh /app/health-check.sh

# 智能健康检查（动态端口检测）
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD /app/health-check.sh

# 设置入口点
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# 默认显示帮助信息
CMD ["--help"]
