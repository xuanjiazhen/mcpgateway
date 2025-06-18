export interface Logger {
  info: (...args: any[]) => void
  error: (...args: any[]) => void
  warn: (...args: any[]) => void
  debug: (...args: any[]) => void
}

/**
 * 格式化时间戳
 */
function formatTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`
}

/**
 * 创建带时间戳的日志函数
 */
function createLoggerWithTimestamp(
  originalFn: Function,
  level: string,
): (...args: any[]) => void {
  return (...args: any[]) => {
    const timestamp = formatTimestamp()
    originalFn(`[${timestamp}] [${level}]`, ...args)
  }
}

export const logger: Logger = {
  info: createLoggerWithTimestamp(console.info.bind(console), 'INFO'),
  error: createLoggerWithTimestamp(console.error.bind(console), 'ERROR'),
  warn: createLoggerWithTimestamp(console.warn.bind(console), 'WARN'),
  debug: createLoggerWithTimestamp(console.debug.bind(console), 'DEBUG'),
}

/**
 * 创建带时间戳和自定义前缀的日志函数
 * @param prefix 日志前缀，如 '[mcpgateway]', '[DynamicRouter]' 等
 */
export function createPrefixedLogger(prefix: string): Logger {
  return {
    info: (...args: any[]) => {
      const timestamp = formatTimestamp()
      console.info(`[${timestamp}] [INFO] ${prefix}`, ...args)
    },
    error: (...args: any[]) => {
      const timestamp = formatTimestamp()
      console.error(`[${timestamp}] [ERROR] ${prefix}`, ...args)
    },
    warn: (...args: any[]) => {
      const timestamp = formatTimestamp()
      console.warn(`[${timestamp}] [WARN] ${prefix}`, ...args)
    },
    debug: (...args: any[]) => {
      const timestamp = formatTimestamp()
      console.debug(`[${timestamp}] [DEBUG] ${prefix}`, ...args)
    },
  }
}

/**
 * 创建带时间戳的简单日志函数（保持原有格式但添加时间戳）
 * @param prefix 日志前缀
 */
export function createTimestampedLog(prefix: string): (...args: any[]) => void {
  return (...args: any[]) => {
    const timestamp = formatTimestamp()
    console.log(`[${timestamp}] ${prefix}`, ...args)
  }
}

/**
 * 创建带时间戳的错误日志函数
 * @param prefix 日志前缀
 */
export function createTimestampedErrorLog(
  prefix: string,
): (...args: any[]) => void {
  return (...args: any[]) => {
    const timestamp = formatTimestamp()
    console.error(`[${timestamp}] ${prefix}`, ...args)
  }
}
