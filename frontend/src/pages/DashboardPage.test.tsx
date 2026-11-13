import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import DashboardPage from './DashboardPage'

describe('DashboardPage', () => {
  it('presents all four product areas and the Testnet guardrail', () => {
    const html = renderToStaticMarkup(<DashboardPage navigate={vi.fn()} />)
    expect(html).toContain('Wallet Explorer')
    expect(html).toContain('Escrow Studio')
    expect(html).toContain('Contract Library')
    expect(html).toContain('RPC Directory')
    expect(html).toContain('Testnet only')
  })
})
