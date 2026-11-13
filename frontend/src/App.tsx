import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { WalletProvider, useWallet } from './near/WalletContext'
import { Icon, type IconName } from './components/Icon'
import { Logo } from './components/Logo'
import { Skeleton } from './components/PageState'
import { WalletConnectDialog } from './components/WalletConnectDialog'
import { ForgeDataProvider, useForgeData } from './data/ForgeDataContext'
import { shortAccount } from './near/format'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ExplorerPage = lazy(() => import('./pages/ExplorerPage'))
const EscrowPage = lazy(() => import('./pages/EscrowPage'))
const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const RpcDirectoryPage = lazy(() => import('./pages/RpcDirectoryPage'))

type PageId = 'home' | 'explorer' | 'escrow' | 'library' | 'rpc'
const pages: { id: PageId; label: string; caption: string; icon: IconName }[] = [
  { id: 'home', label: 'Overview', caption: 'Workspace home', icon: 'home' },
  { id: 'explorer', label: 'Wallet Explorer', caption: 'Public account data', icon: 'search' },
  { id: 'escrow', label: 'Escrow Studio', caption: 'Native NEAR workflows', icon: 'shield' },
  { id: 'library', label: 'Contract Library', caption: 'Source and interfaces', icon: 'code' },
  { id: 'rpc', label: 'RPC Directory', caption: 'Testnet infrastructure', icon: 'server' },
]

function initialPage(): PageId {
  const hash = window.location.hash.slice(1)
  return pages.some((page) => page.id === hash) ? hash as PageId : 'home'
}

function Shell() {
  const { accountId, activeWalletName, networkId, signIn, signOut, ready, error } = useWallet()
  const { status, statusLabel, statusMessage, sessionStatus, retry } = useForgeData()
  const [page, setPage] = useState<PageId>(initialPage)
  const [mobileOpen, setMobileOpen] = useState(false)
  const active = useMemo(() => pages.find((item) => item.id === page)!, [page])

  function navigate(next: string) {
    const id = next as PageId
    if (!pages.some((item) => item.id === id)) return
    setPage(id); setMobileOpen(false); window.history.replaceState(null, '', `#${id}`)
  }

  useEffect(() => {
    document.title = `${active.label} · Forge on NEAR Testnet`
  }, [active])

  return <div className="app-shell">
    <div className="ambient ambient-a"/><div className="ambient ambient-b"/>
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="sidebar-top"><Logo/><button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><Icon name="close"/></button></div>
      <div className="network-pill"><span className="status-dot"/><div><strong>NEAR Testnet</strong><span>Safe development environment</span></div></div>
      <nav className="primary-nav" aria-label="Product navigation">
        <span className="nav-label">Platform</span>
        {pages.map((item) => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)} aria-current={page === item.id ? 'page' : undefined}>
          <span className="nav-icon"><Icon name={item.icon}/></span><span><strong>{item.label}</strong><small>{item.caption}</small></span>
        </button>)}
      </nav>
      <div className="sidebar-note"><Icon name="shield"/><div><strong>Testnet guardrail</strong><span>Mainnet configuration and signing paths are intentionally absent.</span></div></div>
      <div className="sidebar-foot"><a href="https://docs.near.org" target="_blank" rel="noreferrer">NEAR docs <Icon name="external"/></a><span>Forge v0.3 · Testnet</span></div>
    </aside>
    {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation"/>}

    <div className="main-column">
      <header className="topbar">
        <div className="topbar-title"><button className="icon-button mobile-only" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Icon name="menu"/></button><div><span>{active.caption}</span><strong>{active.label}</strong></div></div>
        <div className="topbar-actions">
          <span className="testnet-badge"><span className="status-dot"/> Testnet</span>
          <button type="button" className={`sync-badge ${status}`} title={statusMessage} onClick={() => { if (status !== 'synced' && status !== 'connecting') void retry() }}><Icon name="server"/> {statusLabel}</button>
          {!ready ? <span className="wallet-loading">Loading wallets…</span> : accountId ? <div className="wallet-connected"><span className="avatar">{accountId[0].toUpperCase()}</span><div><strong title={accountId}>{shortAccount(accountId, 8)}</strong><span>{activeWalletName || 'Wallet'} · {networkId}</span></div><button className="icon-button" onClick={() => void signOut()} title="Disconnect wallet" aria-label="Disconnect wallet"><Icon name="logout"/></button></div> : <button className="button primary compact" onClick={signIn}><Icon name="wallet"/> Connect wallet</button>}
        </div>
      </header>
      {error && <div className="global-notice warning"><Icon name="alert"/><span><strong>Wallet integration notice</strong>{error}</span></div>}
      {status !== 'synced' && status !== 'connecting' && <div className="global-notice warning sync-notice"><Icon name="server"/><span><strong>{statusLabel} · session {sessionStatus}</strong>{statusMessage}</span><button className="button secondary compact" onClick={() => void retry()}><Icon name="refresh"/> Retry cloud sync</button></div>}
      <main className="content">
        <Suspense fallback={<div className="panel"><Skeleton rows={6}/></div>}>
          {page === 'home' && <DashboardPage navigate={navigate}/>}
          {page === 'explorer' && <ExplorerPage/>}
          {page === 'escrow' && <EscrowPage/>}
          {page === 'library' && <LibraryPage/>}
          {page === 'rpc' && <RpcDirectoryPage/>}
        </Suspense>
      </main>
      <footer><span>Forge is an unaudited NEAR Testnet development tool.</span><span>No private keys · No simulated transactions · No Mainnet path</span></footer>
    </div>
    <WalletConnectDialog/>
  </div>
}

export default function App() {
  return <ForgeDataProvider><WalletProvider><Shell/></WalletProvider></ForgeDataProvider>
}
