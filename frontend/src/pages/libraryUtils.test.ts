import { describe, expect, it } from 'vitest'
import { filterLibraryMethods, type LibraryMethod } from './libraryUtils'

const methods: LibraryMethod[] = [
  ['create_escrow', 'write', 'Create terms and participants.'],
  ['fund_escrow', 'payable', 'Buyer attaches exact total.'],
  ['get_escrow / get_milestones / get_history', 'view', 'Read-only state.'],
]

describe('Library method filtering', () => {
  it('returns all methods when no filters are active', () => {
    expect(filterLibraryMethods(methods, '', 'all')).toHaveLength(3)
  })

  it('filters by method type', () => {
    expect(filterLibraryMethods(methods, '', 'payable').map((m) => m[0])).toEqual(['fund_escrow'])
    expect(filterLibraryMethods(methods, '', 'view')).toHaveLength(1)
  })

  it('searches across name, type, and behavior (case-insensitive, trimmed)', () => {
    expect(filterLibraryMethods(methods, '  CREATE ', 'all').map((m) => m[0])).toEqual(['create_escrow'])
    expect(filterLibraryMethods(methods, 'payable', 'all').map((m) => m[0])).toEqual(['fund_escrow'])
    expect(filterLibraryMethods(methods, 'read-only', 'all')).toHaveLength(1)
  })

  it('combines search and type filter', () => {
    expect(filterLibraryMethods(methods, 'escrow', 'write').map((m) => m[0])).toEqual(['create_escrow'])
    expect(filterLibraryMethods(methods, 'escrow', 'view')).toHaveLength(1)
  })

  it('returns empty for no matches', () => {
    expect(filterLibraryMethods(methods, 'nonexistent', 'all')).toEqual([])
  })
})
