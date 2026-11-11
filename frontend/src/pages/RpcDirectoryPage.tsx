import { useMemo, useState } from 'react'
import { checkEndpoint } from '../near/rpc'
import { RPC_PROVIDERS } from '../data/rpcProviders'

type CheckState = { ok: boolean; latencyMs?: number; error?: string; blockHeight?: number }

export default function RpcDirectoryPage() {
  const [checks, setChecks] = useState<Record<string, CheckState | 'loading'>>({})
  const [filter, setFilter] = useState<'all' | 'mainnet' | 'testnet' | 'archival' | 'indexer' | 'explorer' | 'faucet' | 'sdk'>('all')

  const items = useMemo(() => {
    if (filter === 'all') return RPC_PROVIDERS
    if (filter === 'mainnet') return RPC_PROVIDERS.filter(p => p.network === 'mainnet' && p.type === 'rpc')
    if (filter === 'testnet') return RPC_PROVIDERS.filter(p => p.network === 'testnet' && p.type === 'rpc')
    if (filter === 'archival') return RPC_PROVIDERS.filter(p => p.archival)
    if (filter === 'indexer') return RPC_PROVIDERS.filter(p => p.type === 'indexer')
    if (filter === 'explorer') return RPC_PROVIDERS.filter(p => p.type === 'explorer')
    if (filter === 'faucet') return RPC_PROVIDERS.filter(p => p.type === 'faucet')
    if (filter === 'sdk') return RPC_PROVIDERS.filter(p => p.type === 'sdk')
    return RPC_PROVIDERS
  }, [filter])

  async function runCheck(id: string, url: string) {
    setChecks(c => ({ ...c, [id]: 'loading' }))
    const res = await checkEndpoint(url)
    setChecks(c => ({ ...c, [id]: res }))
  }

  async function checkAllVisible() {
    const targets = items.filter(i => i.checkable && i.url.startsWith('http'))
    for (const t of targets) {
      setChecks(c => ({ ...c, [t.id]: 'loading' }))
    }
    await Promise.all(targets.map(async t => {
      const res = await checkEndpoint(t.url)
      setChecks(c => ({ ...c, [t.id]: res }))
    }))
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-lg font-semibold">RPC & Infrastructure Directory</h2>
        <p className="text-sm text-slate-400 mt-1">Documented NEAR infrastructure endpoints/tools with on-demand connectivity checks (real JSON-RPC <code>block</code> probe). Endpoints, pricing, and stats are not invented — where details vary by plan, marked as "see provider docs".</p>
        <div className="flex flex-wrap gap-2 mt-3 items-center">
          <select value={filter} onChange={e => setFilter(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm">
            <option value="all">All</option>
            <option value="mainnet">Mainnet RPCs</option>
            <option value="testnet">Testnet RPCs</option>
            <option value="archival">Archival RPCs</option>
            <option value="indexer">Indexers / APIs</option>
            <option value="explorer">Explorers</option>
            <option value="faucet">Faucets</option>
            <option value="sdk">SDKs / Tools</option>
          </select>
          <button onClick={checkAllVisible} className="px-3 py-1.5 rounded bg-cyan-700 hover:bg-cyan-600 text-sm font-medium">Run connectivity checks (visible)</button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map(item => {
          const st = checks[item.id]
          return (
            <section key={item.id} className="rounded-xl border border-slate-800 p-4 bg-slate-900/30">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{item.name}</h3>
                  <div className="text-xs text-slate-400 mt-0.5">{item.type.toUpperCase()} · {item.network || 'multi-network'} {item.archival ? '· Archival' : ''}</div>
                </div>
                {item.checkable && item.url.startsWith('http') && (
                  <button onClick={() => runCheck(item.id, item.url)} className="text-xs px-2 py-1 rounded border border-slate-700 hover:bg-slate-800">Check</button>
                )}
              </div>
              <div className="mt-2 text-sm break-all"><span className="text-slate-400">Endpoint/URL: </span>{item.url.startsWith('http') ? <a className="text-cyan-400 hover:underline" href={item.url} target="_blank" rel="noreferrer">{item.url}</a> : <span>{item.url}</span>}</div>
              <p className="text-sm text-slate-300 mt-2">{item.description}</p>
              <dl className="text-xs text-slate-400 mt-2 space-y-1">
                <div><dt className="inline">Docs: </dt><dd className="inline">{item.docsUrl ? <a className="text-cyan-400 hover:underline" href={item.docsUrl} target="_blank" rel="noreferrer">{item.docsUrl}</a> : 'See provider site'}</dd></div>
                <div><dt className="inline">Auth: </dt><dd className="inline">{item.auth || 'See provider docs'}</dd></div>
                <div><dt className="inline">Rate limits: </dt><dd className="inline">{item.rateLimit || 'See provider docs / plan-dependent'}</dd></div>
                {item.notes && <div><dt className="inline">Notes: </dt><dd className="inline">{item.notes}</dd></div>}
              </dl>
              {st && (
                <div className={`mt-3 text-xs rounded p-2 border ${st === 'loading' ? 'border-slate-700 text-slate-300' : st.ok ? 'border-emerald-800 text-emerald-300 bg-emerald-950/20' : 'border-red-800 text-red-300 bg-red-950/20'}`}>
                  {st === 'loading' ? 'Checking connectivity…' : st.ok ? `Reachable · latency ${st.latencyMs}ms${st.blockHeight ? ` · block ${st.blockHeight}` : ''}` : `Unreachable/error · ${st.error || 'unknown'}${st.latencyMs ? ` · ${st.latencyMs}ms` : ''}`}
                </div>
              )}
              {!item.checkable && <div className="mt-3 text-xs text-slate-500">Connectivity check: not applicable (non-RPC/tooling link).</div>}
            </section>
          )
        })}
      </div>
    </div>
  )
}
