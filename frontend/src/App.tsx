import { useMemo, useState } from 'react'
import { WalletProvider, useWallet } from './near/WalletContext'
import { NETWORKS } from './config'
import ExplorerPage from './pages/ExplorerPage'
import EscrowPage from './pages/EscrowPage'
import LibraryPage from './pages/LibraryPage'
import RpcDirectoryPage from './pages/RpcDirectoryPage'

type Tab = 'explorer' | 'escrow' | 'library' | 'rpc'

function Shell() {
  const { accountId, signIn, signOut, network, setNetwork, ready, error, escrowContractId } = useWallet()
  const [tab, setTab] = useState<Tab>('explorer')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'explorer', label: 'Wallet Explorer' },
    { id: 'escrow', label: 'Escrow Studio' },
    { id: 'library', label: 'Contract Library' },
    { id: 'rpc', label: 'RPC Directory' },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xl font-bold tracking-tight">NEAR Forge</div>
            <div className="text-xs text-slate-400">Integrated NEAR developer platform — real RPC/indexed data, wallet-signed actions</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="text-slate-400">Network</label>
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value as any)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1"
            >
              <option value="testnet">Testnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
            {accountId ? (
              <>
                <span className="px-2 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">{accountId}</span>
                <button onClick={() => signOut()} className="px-3 py-1 rounded border border-slate-700 hover:bg-slate-800">Disconnect</button>
              </>
            ) : (
              <button onClick={signIn} disabled={!ready} className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 font-medium">
                Connect Wallet
              </button>
            )}
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-4 pb-2 flex flex-wrap gap-2">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded text-sm border ${tab === t.id ? 'bg-slate-100 text-slate-900 border-slate-100' : 'border-slate-700 hover:bg-slate-800 text-slate-300'}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        {!ready && <div className="text-slate-400">Initializing wallet integration…</div>}
        {error && <div className="mb-4 p-3 rounded border border-amber-700 bg-amber-950/40 text-amber-200 text-sm">Wallet init notice: {error}</div>}
        {tab === 'escrow' && (
          <div className="mb-4 text-xs text-slate-400">
            Escrow contract ({network}): {escrowContractId || <span className="text-amber-300">not configured — set after authorized Testnet deployment</span>}. On-chain actions require wallet signature and a deployed contract address; no operations are simulated.
          </div>
        )}
        {tab === 'explorer' && <ExplorerPage />}
        {tab === 'escrow' && <EscrowPage />}
        {tab === 'library' && <LibraryPage />}
        {tab === 'rpc' && <RpcDirectoryPage />}
      </main>
      <footer className="max-w-7xl mx-auto px-4 py-8 text-xs text-slate-500">
        Security: never enter seed phrases or private keys. Testnet deployment/receipts shown only when actually verified. Data from real NEAR RPC and documented indexers; provider errors/rate limits surfaced honestly.
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <WalletProvider>
      <Shell />
    </WalletProvider>
  )
}
