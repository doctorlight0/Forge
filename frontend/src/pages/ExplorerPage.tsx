import { useState } from 'react'
import { useWallet } from '../near/WalletContext'
import { viewAccount, viewAccessKeys, viewAccountCode } from '../near/rpc'
import { getAccountTxns, getFtTokens, getNftTokens, getStakingPools } from '../near/indexer'

function yoctoToNear(yocto: string | number) {
  try {
    const y = BigInt(yocto)
    const whole = y / 10n ** 24n
    const frac = (y % 10n ** 24n).toString().padStart(24, '0').slice(0, 5)
    return `${whole}.${frac}`
  } catch { return String(yocto) }
}

export default function ExplorerPage() {
  const { network } = useWallet()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [account, setAccount] = useState<any>(null)
  const [keys, setKeys] = useState<any[]>([])
  const [contract, setContract] = useState<{ hasCode: boolean; codeHash?: string } | null>(null)
  const [txns, setTxns] = useState<{ data: any[] | null; error?: string; source?: string } | null>(null)
  const [fts, setFts] = useState<{ data: any[] | null; error?: string; source?: string } | null>(null)
  const [nfts, setNfts] = useState<{ data: any[] | null; error?: string; source?: string } | null>(null)
  const [staking, setStaking] = useState<{ data: any[] | null; error?: string; source?: string } | null>(null)
  const [page, setPage] = useState(1)

  async function search(p = 1) {
    const id = query.trim().toLowerCase()
    if (!id) { setError('Enter a named (e.g. alice.near) or implicit (64-char hex) account ID.'); return }
    const isImplicit = /^[0-9a-f]{64}$/.test(id)
    const isNamed = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(id)
    if (!isImplicit && !isNamed) { setError('Invalid account format. Use a named account or 64-char implicit hex account.'); return }
    setLoading(true); setError(null); setPage(p)
    try {
      const [a, k, c] = await Promise.all([
        viewAccount(network, id),
        viewAccessKeys(network, id).catch(() => ({ keys: [] })),
        viewAccountCode(network, id).catch(() => null),
      ])
      setAccount(a)
      setKeys(k?.keys || [])
      setContract(c ? { hasCode: (c.code_base64?.length || 0) > 0 && c.code_hash !== '11111111111111111111111111111111', codeHash: c.code_hash } : null)
      const [t, f, n, s] = await Promise.all([
        getAccountTxns(network, id, p, 25),
        getFtTokens(network, id),
        getNftTokens(network, id),
        getStakingPools(network, id),
      ])
      setTxns(t ? { data: t.data?.txns ?? null, error: t.error, source: t.source } : null)
      setFts(f); setNfts(n); setStaking(s)
    } catch (e: any) {
      setAccount(null); setKeys([]); setContract(null); setTxns(null); setFts(null); setNfts(null); setStaking(null)
      const msg = e?.message || 'Failed to load account'
      if (/does not exist/i.test(msg) || /UNKNOWN_ACCOUNT/i.test(msg)) setError('Account not found on this network.')
      else setError(msg)
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-lg font-semibold mb-2">Account Search</h2>
        <p className="text-sm text-slate-400 mb-3">Real on-chain data via NEAR RPC and documented indexers (NearBlocks public API where available). Network: <b>{network}</b>.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Named or implicit account (e.g. example.testnet)"
            className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2" />
          <button onClick={() => search(1)} disabled={loading} className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 font-medium">
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        {error && <div className="mt-3 p-3 rounded border border-red-800 bg-red-950/40 text-red-200 text-sm">{error}</div>}
      </section>

      {loading && <div className="text-slate-400 text-sm">Loading account, keys, transactions, tokens, NFTs, and staking…</div>}

      {account && !loading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-800 p-4 bg-slate-900/30">
            <h3 className="font-semibold mb-2">Account & Balance (RPC)</h3>
            <dl className="text-sm space-y-1">
              <div><dt className="inline text-slate-400">Account: </dt><dd className="inline">{query.trim().toLowerCase()}</dd></div>
              <div><dt className="inline text-slate-400">Amount: </dt><dd className="inline">{yoctoToNear(account.amount)} NEAR</dd></div>
              <div><dt className="inline text-slate-400">Locked: </dt><dd className="inline">{yoctoToNear(account.locked)} NEAR</dd></div>
              <div><dt className="inline text-slate-400">Storage used: </dt><dd className="inline">{account.storage_usage} bytes</dd></div>
              <div><dt className="inline text-slate-400">Code hash: </dt><dd className="inline break-all">{account.code_hash}</dd></div>
              <div><dt className="inline text-slate-400">Contract account: </dt><dd className="inline">{contract?.hasCode ? 'Yes (has deployed code)' : 'No (regular account)'}</dd></div>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-800 p-4 bg-slate-900/30">
            <h3 className="font-semibold mb-2">Access Keys (RPC)</h3>
            {keys.length === 0 ? <p className="text-sm text-slate-400">No access keys returned or unavailable.</p> : (
              <ul className="text-sm space-y-2 max-h-64 overflow-auto">
                {keys.map((k: any, i: number) => (
                  <li key={i} className="border border-slate-800 rounded p-2">
                    <div className="break-all text-slate-300">{k.public_key}</div>
                    <div className="text-slate-400">Permission: {typeof k.access_key?.permission === 'string' ? k.access_key.permission : `FunctionCall (${k.access_key?.permission?.FunctionCall?.receiver_id || 'scoped'})`}</div>
                    {k.access_key?.nonce != null && <div className="text-slate-500">Nonce: {k.access_key.nonce}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-800 p-4 bg-slate-900/30 lg:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Transaction History (Indexer: {txns?.source || 'n/a'})</h3>
              <div className="flex gap-2 text-sm">
                <button disabled={page <= 1 || loading} onClick={() => search(page - 1)} className="px-2 py-1 border border-slate-700 rounded disabled:opacity-40">Prev</button>
                <span className="px-2 py-1 text-slate-400">Page {page}</span>
                <button disabled={loading || (txns?.data?.length || 0) < 25} onClick={() => search(page + 1)} className="px-2 py-1 border border-slate-700 rounded disabled:opacity-40">Next</button>
              </div>
            </div>
            {txns?.error && <div className="text-amber-300 text-sm mb-2">Provider notice: {txns.error} {(txns.error.includes('429') || txns.error.includes('Rate')) ? '(rate limit — retry later or configure API key if supported)' : ''}</div>}
            {!txns?.data || txns.data.length === 0 ? <p className="text-sm text-slate-400">{txns?.error ? 'No transaction data available due to provider error.' : 'No transactions found (or empty page).'}</p> : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-slate-400 text-left"><tr><th className="py-1 pr-2">Hash</th><th className="py-1 pr-2">Signer</th><th className="py-1 pr-2">Receiver</th><th className="py-1 pr-2">Actions</th><th className="py-1">Status</th></tr></thead>
                  <tbody>
                    {txns.data.map((t: any, i: number) => {
                      const hash = t.transaction_hash || t.hash || t.tx_hash || '—'
                      const signer = t.signer_account_id || t.predecessor_account_id || t.signer_id || '—'
                      const receiver = t.receiver_account_id || t.receiver_id || '—'
                      const actions = Array.isArray(t.actions) ? t.actions.map((a: any) => a.action || a.method || a.type).join(', ') : '—'
                      const status = t.outcomes?.status ?? t.status ?? '—'
                      return <tr key={i} className="border-t border-slate-800"><td className="py-1 pr-2 font-mono text-xs break-all max-w-[220px]">{hash}</td><td className="py-1 pr-2">{signer}</td><td className="py-1 pr-2">{receiver}</td><td className="py-1 pr-2">{String(actions)}</td><td className="py-1">{typeof status === 'object' ? JSON.stringify(status) : String(status)}</td></tr>
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2">Transaction details are best-effort from indexer payloads; for authoritative per-tx status use RPC tx_status with sender account ID.</p>
          </section>

          <section className="rounded-xl border border-slate-800 p-4 bg-slate-900/30">
            <h3 className="font-semibold mb-2">NEP-141 Token Holdings (Indexer)</h3>
            {fts?.error && <div className="text-amber-300 text-sm mb-2">Provider notice: {fts.error}</div>}
            {!fts?.data || fts.data.length === 0 ? <p className="text-sm text-slate-400">{fts?.error ? 'Unavailable due to provider error.' : 'No fungible token holdings found.'}</p> : (
              <ul className="text-sm space-y-1 max-h-64 overflow-auto">{fts.data.map((t: any, i: number) => (
                <li key={i} className="border border-slate-800 rounded p-2">
                  <div className="font-medium">{t.ft_meta?.symbol || t.symbol || t.contract || t.token_id || 'Token'}</div>
                  <div className="text-slate-400 break-all">Contract: {t.contract || t.token_contract || '—'}</div>
                  <div className="text-slate-400">Balance: {t.amount || t.balance || '—'}</div>
                </li>
              ))}</ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-800 p-4 bg-slate-900/30">
            <h3 className="font-semibold mb-2">NFT Holdings (Indexer)</h3>
            {nfts?.error && <div className="text-amber-300 text-sm mb-2">Provider notice: {nfts.error}</div>}
            {!nfts?.data || nfts.data.length === 0 ? <p className="text-sm text-slate-400">{nfts?.error ? 'Unavailable due to provider error.' : 'No NFTs found.'}</p> : (
              <ul className="text-sm space-y-1 max-h-64 overflow-auto">{nfts.data.map((t: any, i: number) => (
                <li key={i} className="border border-slate-800 rounded p-2">
                  <div className="font-medium">{t.nft_meta?.title || t.title || t.token_id || 'NFT'}</div>
                  <div className="text-slate-400 break-all">Contract: {t.contract || t.nft_contract_id || '—'}</div>
                  <div className="text-slate-400">Token ID: {t.token_id || '—'}</div>
                </li>
              ))}</ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-800 p-4 bg-slate-900/30 lg:col-span-2">
            <h3 className="font-semibold mb-2">Staking Information (Indexer / best-effort)</h3>
            {staking?.error && <div className="text-amber-300 text-sm mb-2">Provider notice: {staking.error}. Staking visibility depends on indexer support; RPC validator/pool queries may be needed for full detail.</div>}
            {!staking?.data || staking.data.length === 0 ? <p className="text-sm text-slate-400">{staking?.error ? 'Staking data unavailable from configured indexer.' : 'No staking pools/positions found by indexer.'}</p> : (
              <ul className="text-sm space-y-1">{staking.data.map((p: any, i: number) => (
                <li key={i} className="border border-slate-800 rounded p-2">
                  <div className="font-medium break-all">{p.pool || p.pool_id || p.validator_id || 'Pool'}</div>
                  <div className="text-slate-400">Staked/Balance: {p.staked || p.deposit || p.amount || '—'}</div>
                </li>
              ))}</ul>
            )}
          </section>
        </div>
      )}

      {!account && !loading && !error && (
        <div className="text-sm text-slate-400 rounded-xl border border-dashed border-slate-800 p-6">Enter an account to view real on-chain balance, access keys, transactions, tokens, NFTs, and staking info. Invalid accounts and provider errors will be shown here.</div>
      )}
    </div>
  )
}
