import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import { readFileSync } from 'fs'
import { createTimestampedErrorLog } from '../logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function getVersion(): string {
  try {
    const packageJsonPath = join(__dirname, '../../package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    return packageJson.version || '1.0.0'
  } catch (err) {
    const logError = createTimestampedErrorLog('[mcpgateway]')
    logError('Unable to retrieve version:', err)
    return 'unknown'
  }
}
