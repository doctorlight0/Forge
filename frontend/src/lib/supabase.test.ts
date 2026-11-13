import { describe, expect, it, vi } from 'vitest'
import { classifySupabaseFailure, validateSupabaseConfig, verifySupabaseConnection } from './supabase'

describe('Supabase browser configuration', () => {
  it('requires both publishable values', () => {
    expect(validateSupabaseConfig('', '')).toContain('not configured')
  })

  it('accepts a Supabase HTTPS URL and publishable key', () => {
    expect(validateSupabaseConfig('https://forge-example.supabase.co', 'sb_publishable_example')).toBeNull()
  })

  it('rejects non-Supabase URLs and privileged keys', () => {
    expect(validateSupabaseConfig('http://localhost:54321', 'sb_publishable_example')).toContain('valid Supabase HTTPS')
    expect(validateSupabaseConfig('https://forge-example.supabase.co', 'service_role_example')).toContain('must never')
    expect(validateSupabaseConfig('https://forge-example.supabase.co', 'sb_secret_example')).toContain('must never')
  })
})

describe('Supabase connection diagnostics', () => {
  it('confirms initialization and reports anonymous-auth availability', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ external: { anonymous_users: false } }), { status: 200 })) as unknown as typeof fetch
    await expect(verifySupabaseConnection('https://forge-example.supabase.co', 'sb_publishable_example', fetcher))
      .resolves.toEqual({ anonymousSignInsEnabled: false })
  })

  it('distinguishes rejected credentials from network failures', async () => {
    const unauthorized = vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
    await expect(verifySupabaseConnection('https://forge-example.supabase.co', 'bad-publishable-key', unauthorized))
      .rejects.toMatchObject({ kind: 'authentication' })

    const offline = vi.fn(async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    await expect(verifySupabaseConnection('https://forge-example.supabase.co', 'sb_publishable_example', offline))
      .rejects.toMatchObject({ kind: 'network' })
  })

  it('classifies anonymous auth, missing tables, expired sessions and RLS failures', () => {
    expect(classifySupabaseFailure({ status: 422, message: 'Anonymous sign-ins are disabled' }).kind).toBe('authentication')
    expect(classifySupabaseFailure({ code: 'PGRST205', message: 'not in schema cache' }).kind).toBe('schema')
    expect(classifySupabaseFailure({ status: 401, message: 'JWT expired' }).kind).toBe('authentication')
    expect(classifySupabaseFailure({ code: '42501', message: 'row-level security policy violation' }).kind).toBe('authorization')
  })
})
