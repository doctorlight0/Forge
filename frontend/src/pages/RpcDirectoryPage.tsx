import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState, PageIntro } from '../components/PageState'
import { RPC_PROVIDERS, type ProviderType } from '../data/rpcProviders'
import { checkEndpoint } from '../near/rpc'
import { filterRpcDirectory } from './rpcDirectoryUtils'

type Check = { ok: boolean; latencyMs?: number; error?: string; blockHeight?: number }
type Filter = 'all' | ProviderType

export default function RpcDirectoryPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [checks, setChecks] = useState<Record<string, Check | 'loading'>>({})
  const [checkingAll, setCheckingAll] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)

  const filtered = useMemo(() => filterRpcDirectory(RPC_PROVIDERS, query, filter), [filter, query])

  const selected = useMemo(() => RPC_PROVIDERS.find((p) => p.id === selectedId) ?? null, [selectedId])
  const checkableVisible = filtered.filter((item) => item.checkable)
  const hasFilters = query.trim().length > 0 || filter !== 'all'

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All resources' },
    { id: 'rpc', label: 'RPC' },
    { id: 'indexer', label: 'Indexers' },
    { id: 'explorer', label: 'Explorers' },
    { id: 'faucet', label: 'Faucets' },
    { id: 'sdk', label: 'SDKs' },
    { id: 'tool', label: 'Tools' },
  ]

  async function runCheck(id: string, url: string) {
    setChecks((current) => ({ ...current, [id]: 'loading' }))
    const result = await checkEndpoint(url)
    setChecks((current) => ({ ...current, [id]: result }))
  }

  async function checkVisible() {
    if (!checkableVisible.length) return
    setCheckingAll(true)
    setChecks((current) => ({ ...current, ...Object.fromEntries(checkableVisible.map((item) => [item.id, 'loading'])) }))
    await Promise.all(checkableVisible.map((item) => runCheck(item.id, item.url)))
    setCheckingAll(false)
  }

  async function copyUrl(providerId: string, url: string) {
    setCopyError(null)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable in this browser context.')
      await navigator.clipboard.writeText(url)
      setCopiedId(providerId)
      setTimeout(() => setCopiedId((current) => (current === providerId ? null : current)), 1600)
    } catch (reason) {
      setCopyError(reason instanceof Error ? reason.message : 'Unable to copy endpoint URL.')
      setCopiedId(null)
    }
  }

  function clearAll() {
    setQuery('')
    setFilter('all')
    setSelectedId(null)
  }

  return <div className="stack">
    <PageIntro eyebrow="Verified Testnet resources" title="RPC Directory" description="A curated Testnet-only catalog of RPCs, indexers, explorers, faucets, SDKs, and developer tools. Connectivity results are live checks—not stored uptime claims." actions={<button type="button" className="button primary" onClick={() => void checkVisible()} disabled={checkingAll || checkableVisible.length === 0}><Icon name="refresh" /> {checkingAll ? 'Checking…' : `Check visible RPCs${checkableVisible.length ? ` (${checkableVisible.length})` : ''}`}</button>} />

    <section className="panel enter">
      <div className="filter-bar" role="search" aria-label="Search RPC directory">
        <label className="field search-field">
          <span>Search resources</span>
          <div className="input-group"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setQuery('') }} placeholder="Search by name, URL, provider type, or purpose" aria-label="Search RPC directory" /></div>
        </label>
        <div className="field filter-actions">
          <span>&nbsp;</span>
          <button type="button" className="button secondary" onClick={clearAll} disabled={!hasFilters}>Clear all</button>
        </div>
      </div>
      <div className="filters" role="tablist" aria-label="Resource type" style={{ marginTop: 14 }}>
        {filters.map((item) => <button type="button" key={item.id} role="tab" aria-selected={filter === item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}
      </div>
      <div className="panel-subtitle" style={{ marginTop: 11 }} aria-live="polite">{filtered.length} of {RPC_PROVIDERS.length} resources shown. Archive, authentication, and rate-limit fields remain conservative where providers do not publish guarantees.</div>
      {copyError && <div className="notice error" style={{ marginTop: 12 }}><Icon name="alert" /><span><strong>Copy failed</strong>{copyError}</span></div>}
    </section>

    {selected && <section className="panel enter selected-resource" aria-label="Selected resource details">
      <div className="panel-header">
        <div className="panel-title"><span><Icon name="server" /></span><div><h2>{selected.name}</h2><div className="panel-subtitle">{selected.type.toUpperCase()} · NEAR Testnet</div></div></div>
        <div className="page-actions">
          <button type="button" className="button secondary compact" onClick={() => void copyUrl(selected.id, selected.url)}><Icon name={copiedId === selected.id ? 'check' : 'copy'} /> {copiedId === selected.id ? 'Copied URL' : 'Copy URL'}</button>
          <button type="button" className="icon-button" onClick={() => setSelectedId(null)} aria-label="Close selected resource details"><Icon name="close" /></button>
        </div>
      </div>
      <p className="panel-subtitle" style={{ fontSize: 11, lineHeight: 1.7 }}>{selected.purpose}</p>
      <div className="data-list" style={{ marginTop: 12 }}>
        <div className="data-row"><div className="data-main"><strong>Endpoint / resource</strong><span className="mono" style={{ overflowWrap: 'anywhere' }}>{selected.url}</span></div></div>
        <div className="data-row"><div className="data-main"><strong>Authentication</strong><span>{selected.auth}</span></div></div>
        <div className="data-row"><div className="data-main"><strong>Rate limits</strong><span>{selected.rateLimit}</span></div></div>
        <div className="data-row"><div className="data-main"><strong>Documentation</strong><span><a className="link" href={selected.docsUrl} target="_blank" rel="noreferrer">Open docs <Icon name="external" /></a></span></div></div>
      </div>
      <div className="check-result" style={{ marginTop: 12 }}>
        {selected.checkable ? <CheckStatus id={selected.id} url={selected.url} check={checks[selected.id]} onRun={runCheck} /> : <div className="notice info"><Icon name="alert" /><span><strong>Connectivity probe not applicable</strong>This resource is not a JSON-RPC block endpoint; open its documentation or URL directly for verification.</span></div>}
      </div>
    </section>}

    {filtered.length ? (
      <section className="provider-grid results-fade" key={`${filter}|${query.trim().toLowerCase()}`}>
        {filtered.map((provider, index) => {
          const check = checks[provider.id]
          const isSelected = selectedId === provider.id
          return <article className={`panel provider-card enter interactive-card ${isSelected ? 'selected-card' : ''}`} style={{ animationDelay: `${index * 35}ms` }} key={provider.id} role="button" tabIndex={0} aria-pressed={isSelected} aria-label={`Select ${provider.name} for details`} onClick={() => setSelectedId(provider.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(provider.id) } }}>
            <div className="panel-header">
              <div className="panel-title"><span><Icon name={provider.type === 'rpc' ? 'server' : provider.type === 'sdk' || provider.type === 'tool' ? 'code' : provider.type === 'faucet' ? 'spark' : 'cube'} /></span><div><h2>{provider.name}</h2><div className="panel-subtitle">{provider.type.toUpperCase()} · NEAR Testnet</div></div></div>
              <span className={`badge ${provider.archival === 'yes' ? '' : 'neutral'}`}>{provider.archival === 'yes' ? 'Archive' : provider.archival === 'plan-dependent' ? 'Archive varies' : provider.archival === 'no' ? 'Current state' : provider.type}</span>
            </div>
            <p className="panel-subtitle" style={{ fontSize: 10, lineHeight: 1.65 }}>{provider.purpose}</p>
            <div className="link mono" style={{ marginTop: 11, fontSize: 8, overflowWrap: 'anywhere', cursor: 'pointer' }}>{provider.url}</div>
            <dl className="provider-meta">
              <div><dt>Authentication</dt><dd>{provider.auth}</dd></div>
              <div><dt>Rate limits</dt><dd>{provider.rateLimit}</dd></div>
              <div><dt>Archive access</dt><dd>{provider.archival.replace('-', ' ')}</dd></div>
              <div><dt>Documentation</dt><dd><a className="link" href={provider.docsUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Official / provider docs <Icon name="external" /></a></dd></div>
            </dl>
            {provider.notes && <div className="notice info" style={{ marginTop: 12 }}><Icon name="alert" /><span>{provider.notes}</span></div>}
            <div className="check-result">
              <div className="inline-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <button type="button" className="button secondary compact" onClick={() => void copyUrl(provider.id, provider.url)}><Icon name={copiedId === provider.id ? 'check' : 'copy'} /> {copiedId === provider.id ? 'Copied' : 'Copy URL'}</button>
                <a className="button secondary compact" href={provider.url} target="_blank" rel="noreferrer"><Icon name="external" /> Open</a>
              </div>
              {provider.checkable ? <CheckStatus id={provider.id} url={provider.url} check={check} onRun={runCheck} /> : <span className="badge neutral" style={{ marginTop: 10 }}>Connectivity probe not applicable</span>}
            </div>
          </article>
        })}
      </section>
    ) : (
      <EmptyState icon="server" title="No resources match" detail="No Testnet resources match the current search and filter. Clear filters or try a different term." action={<button type="button" className="button secondary" onClick={clearAll}>Clear search and filters</button>} />
    )}
  </div>
}

function CheckStatus({ id, url, check, onRun }: { id: string; url: string; check?: Check | 'loading'; onRun: (id: string, url: string) => Promise<void> }) {
  if (!check) return <button type="button" className="button secondary" style={{ marginTop: 10, width: '100%' }} onClick={(e) => { e.stopPropagation(); void onRun(id, url) }}><Icon name="server" /> Run connectivity check</button>
  if (check === 'loading') return <div className="notice info" style={{ marginTop: 10 }}><Icon name="refresh" /><span><strong>Checking endpoint</strong>Waiting for a final block response…</span></div>
  return <div className={`notice ${check.ok ? 'success' : 'error'}`} style={{ marginTop: 10 }}>
    <Icon name={check.ok ? 'check' : 'alert'} />
    <span>
      <strong>{check.ok ? 'Reachable now' : 'Check failed'}</strong>
      {check.ok ? `${check.latencyMs} ms observed · final block ${check.blockHeight ?? 'not returned'}` : `${check.error || 'Unknown error'}${check.latencyMs ? ` · ${check.latencyMs} ms` : ''}`}
      <button type="button" className="link inline-link" onClick={(e) => { e.stopPropagation(); void onRun(id, url) }}>Check again</button>
    </span>
  </div>
}
