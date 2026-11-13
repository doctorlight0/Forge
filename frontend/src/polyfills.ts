import { Buffer } from 'buffer'

const browserGlobal = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer
  process?: { env?: Record<string, string | undefined>; browser?: boolean }
}

browserGlobal.Buffer ??= Buffer
if (typeof browserGlobal.process === 'undefined') {
  browserGlobal.process = { env: {}, browser: true }
} else if (!browserGlobal.process.env) {
  browserGlobal.process.env = {}
}
