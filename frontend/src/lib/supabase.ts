import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()

export type SupabaseFailureKind = 'configuration' | 'network' | 'authentication' | 'schema' | 'authorization' | 'unknown'

export type SupabaseFailure = {
  kind: SupabaseFailureKind
  message: string
  retryable: boolean
}

type ErrorLike = {
  message?: unknown
  code?: unknown
  status?: unknown
  name?: unknown
}

export class ForgeSupabaseError extends Error {
  constructor(public readonly kind: SupabaseFailureKind, message: string, public readonly retryable = true) {
    super(message)
    this.name = 'ForgeSupabaseError'
  }
}

export function validateSupabaseConfig(projectUrl: string, key: string) {
  if (!projectUrl || !key) return 'Supabase is not configured. Saved items will remain in this browser.'
  try {
    const parsed = new URL(projectUrl)
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) return 'VITE_SUPABASE_URL must be a valid Supabase HTTPS project URL.'
  } catch {
    return 'VITE_SUPABASE_URL is invalid.'
  }
  if (/^sb_secret_/i.test(key) || /service[_-]?role/i.test(key)) return 'A secret or service-role key must never be used in the browser.'
  return null
}

function errorFields(reason: unknown) {
  const value = reason && typeof reason === 'object' ? reason as ErrorLike : {}
  return {
    message: typeof value.message === 'string' ? value.message : reason instanceof Error ? reason.message : '',
    code: typeof value.code === 'string' ? value.code : '',
    status: typeof value.status === 'number' ? value.status : null,
    name: typeof value.name === 'string' ? value.name : reason instanceof Error ? reason.name : '',
  }
}

export function classifySupabaseFailure(reason: unknown): SupabaseFailure {
  if (reason instanceof ForgeSupabaseError) {
    return { kind: reason.kind, message: reason.message, retryable: reason.retryable }
  }

  const { message, code, status, name } = errorFields(reason)
  const normalized = `${code} ${message}`.toLowerCase()
  if (name === 'AbortError' || normalized.includes('failed to fetch') || normalized.includes('networkerror') || normalized.includes('load failed')) {
    return { kind: 'network', message: 'Forge Supabase could not be reached. Check your network connection and retry.', retryable: true }
  }
  if (code === 'PGRST205' || code === '42P01' || normalized.includes('schema cache') || normalized.includes('does not exist')) {
    return { kind: 'schema', message: 'Forge cloud tables are missing. Apply migration 202611120001_forge_saved_items.sql to the dedicated Forge project.', retryable: false }
  }
  if (code === '42501' || normalized.includes('row-level security') || normalized.includes('permission denied')) {
    return { kind: 'authorization', message: 'Forge Supabase rejected this operation under its database permissions or RLS policies.', retryable: true }
  }
  if (status === 401 || status === 403 || normalized.includes('anonymous sign-ins are disabled') || normalized.includes('jwt') || normalized.includes('session') || normalized.includes('not authenticated')) {
    const anonymousDisabled = normalized.includes('anonymous sign-ins are disabled')
    return {
      kind: 'authentication',
      message: anonymousDisabled
        ? 'Anonymous sign-ins are disabled in the Forge Supabase project. Cloud sync requires an authenticated session.'
        : 'Forge Supabase authentication failed or the saved session expired. Retry to refresh the session.',
      retryable: !anonymousDisabled,
    }
  }
  return {
    kind: 'unknown',
    message: message ? `Forge Supabase synchronization failed: ${message}` : 'Forge Supabase synchronization failed for an unknown reason.',
    retryable: true,
  }
}

export const supabaseConfigurationError = validateSupabaseConfig(url, publishableKey)
export const supabase = supabaseConfigurationError ? null : createClient<Database>(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  global: { headers: { 'X-Client-Info': 'forge-web' } },
})

export type SupabaseConnectionInfo = { anonymousSignInsEnabled: boolean | null }

export async function verifySupabaseConnection(
  projectUrl = url,
  key = publishableKey,
  fetcher: typeof fetch = fetch,
): Promise<SupabaseConnectionInfo> {
  const configurationError = validateSupabaseConfig(projectUrl, key)
  if (configurationError) throw new ForgeSupabaseError('configuration', configurationError, false)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetcher(`${projectUrl.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    })
    if (response.status === 401 || response.status === 403) {
      throw new ForgeSupabaseError('authentication', 'The Forge Supabase URL or publishable key was rejected.', false)
    }
    if (!response.ok) throw new ForgeSupabaseError('network', `Forge Supabase project returned HTTP ${response.status}.`)
    const settings = await response.json() as { external?: { anonymous_users?: boolean } }
    return { anonymousSignInsEnabled: typeof settings.external?.anonymous_users === 'boolean' ? settings.external.anonymous_users : null }
  } catch (reason) {
    if (reason instanceof ForgeSupabaseError) throw reason
    const failure = classifySupabaseFailure(reason)
    throw new ForgeSupabaseError(failure.kind, failure.message, failure.retryable)
  } finally {
    clearTimeout(timeout)
  }
}
