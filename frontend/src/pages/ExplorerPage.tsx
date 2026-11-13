import { useState } from 'react'
import { EXPLORER_ACCOUNT_URL, EXPLORER_TX_URL } from '../config'
import { Icon } from '../components/Icon'
import { EmptyState, PageIntro, Skeleton } from '../components/PageState'
import { useForgeData } from '../data/ForgeDataContext'
import { isValidAccountId, shortAccount, yoctoToNear } from '../near/format'
import { getAccountTxns, getFtTokens, getNftTokens, getStakingPools, getTxnDetail, type IndexerResult } from '../near/indexer'
import { viewAccessKeys, viewAccount, viewAccountCode } from '../near/rpc'

type ExplorerData = {
  accountId: string
  account: any
  keys: any[]
  contract: { hasCode: boolean; codeHash?: string }
  txns: IndexerResult<any[]>
  fts: IndexerResult<any[]>
  nfts: IndexerResult<any[]>
  staking: IndexerResult<any[]>
  hasNextTransactions: boolean
}

function providerMessage(result: IndexerResult<unknown>) {
  if (!result.error) return null
  return <div className="notice warning"><Icon name="alert"/><span><strong>Provider data unavailable</strong>{result.error}</span></div>
}

export default function ExplorerPage() {
  const { wallets, isWalletSaved, toggleWallet } = useForgeData()
  const [query, setQuery] = useState('')
  const [data, setData] = useState<ExplorerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageCursors, setPageCursors] = useState<Record<number, string>>({})
  const [selectedTx, setSelectedTx] = useState<any | null>(null)
  const [txLoading, setTxLoading] = useState(false)

  async function search(nextPage = 1, forceId?: string) {
    const accountId = (forceId || query).trim().toLowerCase()
    if (!isValidAccountId(accountId)) { setError('Enter a valid named account or a 64-character implicit Testnet account.'); return }
    const cursor = nextPage > 1 ? pageCursors[nextPage] : undefined
    if (nextPage > 1 && !cursor) { setError('That transaction page is no longer available. Refresh from page 1.'); return }
    setQuery(accountId); setLoading(true); setError(null); setSelectedTx(null)
    try {
      const [account, keysResult, codeResult] = await Promise.all([
        viewAccount(accountId), viewAccessKeys(accountId).catch(() => ({ keys: [] })), viewAccountCode(accountId).catch(() => null),
      ])
      const [txResult, fts, nfts, staking] = await Promise.all([
        getAccountTxns(accountId, cursor, 25), getFtTokens(accountId), getNftTokens(accountId), getStakingPools(accountId),
      ])
      setPage(nextPage)
      setPageCursors((current) => {
        const updated = nextPage === 1 || data?.accountId !== accountId ? {} : { ...current }
        if (txResult.data?.nextPage) updated[nextPage + 1] = txResult.data.nextPage
        else delete updated[nextPage + 1]
        return updated
      })
      setData({
        accountId, account, keys: keysResult?.keys || [],
        contract: { hasCode: Boolean(codeResult?.code_base64) && codeResult?.code_hash !== '11111111111111111111111111111111', codeHash: codeResult?.code_hash },
        txns: { ...txResult, data: txResult.data?.txns ?? null }, fts, nfts, staking,
        hasNextTransactions: Boolean(txResult.data?.nextPage),
      })
    } catch (reason: any) {
      const message = reason?.message || 'Unable to load the account.'
      setData(null)
      setError(/does not exist|UNKNOWN_ACCOUNT/i.test(message) ? 'Account not found on NEAR Testnet.' : message)
    } finally { setLoading(false) }
  }

  async function inspectTransaction(transaction: any) {
    const hash = transaction.transaction_hash || transaction.hash || transaction.tx_hash
    if (!hash) return
    setSelectedTx({ ...transaction, _hash: hash }); setTxLoading(true)
    const detail = await getTxnDetail(hash)
    if (detail.data) setSelectedTx({ ...transaction, ...detail.data, _hash: hash })
    setTxLoading(false)
  }

  return <div className="stack">
    <PageIntro eyebrow="Public Testnet intelligence" title="Wallet Explorer" description="Inspect named and implicit accounts, balances, keys, contract code, transactions, assets, and staking data. Wallet connection is never required for public blockchain data." actions={data && <div className="page-actions"><button className="button secondary" onClick={() => void toggleWallet(data.accountId)}><Icon name={isWalletSaved(data.accountId) ? 'check' : 'spark'}/> {isWalletSaved(data.accountId) ? 'Saved' : 'Save account'}</button><button className="button secondary" onClick={() => void search(page, data.accountId)} disabled={loading}><Icon name="refresh"/> Refresh</button></div>}/>

    <section className="panel enter">
      <div className="input-group"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void search(1) }} placeholder="account.testnet or 64-character implicit account" aria-label="NEAR Testnet account"/><button className="button primary" onClick={() => void search(1)} disabled={loading}>{loading ? 'Searching…' : 'Inspect account'}</button></div>
      <div className="panel-subtitle" style={{ marginTop: 9 }}>Queries use NEAR Testnet RPC and indexed provider data. Missing provider data is shown as unavailable—not as an empty on-chain result.</div>
      {wallets.length > 0 && <div className="saved-items"><span>Saved accounts</span>{wallets.map((wallet) => <button type="button" className="badge neutral" key={wallet.accountId} onClick={() => { setQuery(wallet.accountId); void search(1, wallet.accountId) }}>{wallet.label || shortAccount(wallet.accountId, 9)}</button>)}</div>}
      {error && <div className="notice error" style={{ marginTop: 14 }}><Icon name="alert"/><span><strong>Search failed</strong>{error}</span></div>}
    </section>

    {loading && <section className="panel"><div className="panel-header"><div className="panel-title"><span><Icon name="search"/></span><div><h2>Reading Testnet</h2><div className="panel-subtitle">Account state first, indexed collections second</div></div></div></div><Skeleton rows={6}/></section>}

    {!loading && !data && !error && (
      <EmptyState icon="search" title="Start with any Testnet account" detail="Try a named account ending in .testnet or paste a 64-character implicit account. Browsing stays public and disconnected." action={<button className="button secondary" onClick={() => { setQuery('testnet'); void search(1, 'testnet') }}>Try testnet</button>}/>
    )}

    {!loading && data && <>
      <section className="metric-grid enter">
        <div className="metric"><label>Available balance</label><strong>{yoctoToNear(data.account.amount)} Ⓝ</strong><small>{data.account.amount} yoctoNEAR</small></div>
        <div className="metric"><label>Locked for staking</label><strong>{yoctoToNear(data.account.locked)} Ⓝ</strong><small>{data.account.locked} yoctoNEAR</small></div>
        <div className="metric"><label>Storage used</label><strong>{Number(data.account.storage_usage).toLocaleString()}</strong><small>bytes on chain</small></div>
        <div className="metric"><label>Account type</label><strong>{data.contract.hasCode ? 'Contract' : 'Standard'}</strong><small>{data.keys.length} access key{data.keys.length === 1 ? '' : 's'}</small></div>
      </section>

      <div className="panel-grid">
        <section className="panel enter"><div className="panel-header"><div className="panel-title"><span><Icon name="cube"/></span><div><h2>Account profile</h2><div className="panel-subtitle">Authoritative final RPC state</div></div></div><a className="link" href={EXPLORER_ACCOUNT_URL(data.accountId)} target="_blank" rel="noreferrer">Explorer <Icon name="external"/></a></div>
          <div className="data-list">
            <div className="data-row"><div className="data-main"><strong className="mono">{data.accountId}</strong><span>{/^[0-9a-f]{64}$/.test(data.accountId) ? 'Implicit account' : 'Named account'}</span></div><span className="badge">Testnet</span></div>
            <div className="data-row"><div className="data-main"><strong>Code status</strong><span className="mono">{data.contract.codeHash || data.account.code_hash}</span></div><span className={`badge ${data.contract.hasCode ? '' : 'neutral'}`}>{data.contract.hasCode ? 'Deployed' : 'No code'}</span></div>
            <div className="data-row"><div className="data-main"><strong>Storage paid at</strong><span>{data.account.storage_paid_at ?? 'Field not returned by current RPC schema'}</span></div></div>
          </div>
        </section>

        <section className="panel enter"><div className="panel-header"><div className="panel-title"><span><Icon name="key"/></span><div><h2>Access keys</h2><div className="panel-subtitle">Full-access and function-call permissions</div></div></div><span className="badge neutral">{data.keys.length} keys</span></div>
          {data.keys.length ? <div className="data-list" style={{ maxHeight: 275, overflow: 'auto' }}>{data.keys.map((key, index) => { const permission = key.access_key?.permission; const functionCall = typeof permission === 'object' ? permission.FunctionCall : null; return <div className="data-row" key={key.public_key || index}><div className="data-main"><strong className="mono">{shortAccount(key.public_key || 'unknown', 14)}</strong><span>{functionCall ? `FunctionCall → ${functionCall.receiver_id}` : String(permission || 'Unknown permission')} · nonce {key.access_key?.nonce ?? '—'}</span></div><span className={`badge ${functionCall ? 'neutral' : ''}`}>{functionCall ? 'Scoped' : 'Full access'}</span></div> })}</div> : <EmptyState icon="key" title="No keys returned" detail="The account has no visible access keys, or the provider could not return them."/>}
        </section>
      </div>

      <section className="panel enter"><div className="panel-header"><div className="panel-title"><span><Icon name="clock"/></span><div><h2>Transaction history</h2><div className="panel-subtitle">{data.txns.source} · cursor page {page}</div></div></div><div className="page-actions"><button className="button secondary compact" disabled={page <= 1 || loading} onClick={() => void search(page - 1, data.accountId)}>Previous</button><button className="button secondary compact" disabled={!data.hasNextTransactions || loading} onClick={() => void search(page + 1, data.accountId)}>Next</button></div></div>
        {providerMessage(data.txns)}
        {data.txns.data?.length ? <div className="table-wrap" style={{ marginTop: data.txns.error ? 12 : 0 }}><table className="data-table"><thead><tr><th>Transaction</th><th>Signer</th><th>Receiver</th><th>Action</th><th>Status</th></tr></thead><tbody>{data.txns.data.map((transaction, index) => { const hash = transaction.transaction_hash || transaction.hash || transaction.tx_hash || ''; const actions = Array.isArray(transaction.actions) ? transaction.actions.map((action: any) => action.action || action.method || action.type).filter(Boolean).join(', ') : 'Indexed action'; const status = transaction.outcomes?.status === true ? 'Success' : transaction.outcomes?.status === false ? 'Failed' : typeof transaction.status === 'string' ? transaction.status : 'Indexed'; return <tr key={hash || index} onClick={() => void inspectTransaction(transaction)} style={{ cursor: hash ? 'pointer' : 'default' }}><td><span className="link mono">{hash ? shortAccount(hash, 8) : 'Unavailable'}</span></td><td>{shortAccount(transaction.signer_account_id || transaction.predecessor_account_id || '—', 11)}</td><td>{shortAccount(transaction.receiver_account_id || transaction.receiver_id || '—', 11)}</td><td>{actions || '—'}</td><td><span className="badge neutral">{status}</span></td></tr> })}</tbody></table></div> : !data.txns.error && <EmptyState icon="clock" title="No indexed transactions" detail="The provider returned an empty page for this account."/>}
      </section>

      {selectedTx && <section className="panel enter"><div className="panel-header"><div className="panel-title"><span><Icon name="arrow"/></span><div><h2>Transaction detail</h2><div className="panel-subtitle mono">{selectedTx._hash}</div></div></div><div className="page-actions"><a className="button secondary compact" href={EXPLORER_TX_URL(selectedTx._hash)} target="_blank" rel="noreferrer">Open receipt <Icon name="external"/></a><button className="icon-button" onClick={() => setSelectedTx(null)} aria-label="Close transaction"><Icon name="close"/></button></div></div>{txLoading ? <Skeleton rows={4}/> : <pre className="code-block">{JSON.stringify(selectedTx, null, 2)}</pre>}</section>}

      <div className="panel-grid three">
        <AssetPanel title="NEP-141 holdings" icon="cube" result={data.fts} empty="No fungible token holdings were returned." render={(token) => <><strong>{token.meta?.symbol || token.ft_meta?.symbol || token.symbol || token.contract || 'Token'}</strong><span>{token.contract || token.token_contract || 'Contract unavailable'} · balance {token.amount || token.balance || '—'}</span></>}/>
        <AssetPanel title="NFT holdings" icon="spark" result={data.nfts} empty="No NFT holdings were returned." render={(token) => <><strong>{token.token_meta?.title || token.nft_meta?.title || token.title || token.token || token.token_id || 'NFT'}</strong><span>{token.contract || token.nft_contract_id || 'Contract unavailable'} · token {token.token || token.token_id || '—'}</span></>}/>
        <AssetPanel title="Staking positions" icon="shield" result={data.staking} empty="No staking positions were returned." render={(position) => <><strong>{position.pool || position.pool_id || position.validator_id || 'Pool'}</strong><span>{position.staked || position.deposit || position.amount || 'Amount unavailable'}</span></>}/>
      </div>
    </>}
  </div>
}

function AssetPanel({ title, icon, result, empty, render }: { title: string; icon: Parameters<typeof Icon>[0]['name']; result: IndexerResult<any[]>; empty: string; render: (item: any) => React.ReactNode }) {
  return <section className="panel enter"><div className="panel-header"><div className="panel-title"><span><Icon name={icon}/></span><div><h2>{title}</h2><div className="panel-subtitle">{result.source}</div></div></div><span className="badge neutral">{result.data?.length || 0}</span></div>{providerMessage(result)}{result.data?.length ? <div className="data-list" style={{ marginTop: result.error ? 12 : 0, maxHeight: 300, overflow: 'auto' }}>{result.data.map((item, index) => <div className="data-row" key={index}><div className="data-main">{render(item)}</div></div>)}</div> : !result.error && <EmptyState icon={icon} title="Empty result" detail={empty}/>}</section>
}
