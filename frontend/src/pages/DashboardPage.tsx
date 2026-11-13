import { Icon, type IconName } from '../components/Icon'

const modules: { id: string; icon: IconName; title: string; description: string; badge: string }[] = [
  { id: 'explorer', icon: 'search', title: 'Wallet Explorer', description: 'Inspect any named or implicit Testnet account without connecting a wallet.', badge: 'Public data' },
  { id: 'escrow', icon: 'shield', title: 'Escrow Studio', description: 'Design and operate native NEAR escrow workflows with wallet-signed actions.', badge: 'Contract tools' },
  { id: 'library', icon: 'code', title: 'Contract Library', description: 'Review source, interfaces, security constraints, and deployment recipes.', badge: 'Developer docs' },
  { id: 'rpc', icon: 'server', title: 'RPC Directory', description: 'Find verified Testnet infrastructure and run honest connectivity checks.', badge: 'Infrastructure' },
]

export default function DashboardPage({ navigate }: { navigate: (id: string) => void }) {
  return <div className="dashboard enter">
    <section className="hero-panel">
      <div className="hero-grid" />
      <div className="hero-copy">
        <div className="eyebrow"><span className="status-dot" /> Testnet developer workspace</div>
        <h1>Build, inspect, and ship on <span>NEAR.</span></h1>
        <p>One focused environment for exploring accounts, prototyping escrow flows, understanding contract interfaces, and validating Testnet infrastructure.</p>
        <div className="hero-actions">
          <button className="button primary" onClick={() => navigate('explorer')}>Explore an account <Icon name="arrow" /></button>
          <button className="button secondary" onClick={() => navigate('escrow')}>Open Escrow Studio</button>
        </div>
      </div>
      <div className="hero-orbit" aria-hidden="true"><div className="orbit-core">N</div><i/><i/><i/></div>
    </section>

    <div className="section-heading"><div><span className="eyebrow">Workspace</span><h2>Four tools. One Testnet context.</h2></div><p>Browsing is public by default. A wallet is requested only when an operation needs your signature.</p></div>
    <section className="module-grid">
      {modules.map((module, index) => <button className="module-card enter" style={{ animationDelay: `${index * 70}ms` }} key={module.id} onClick={() => navigate(module.id)}>
        <span className="module-icon"><Icon name={module.icon} /></span><span className="module-badge">{module.badge}</span>
        <h3>{module.title}</h3><p>{module.description}</p><span className="module-link">Launch tool <Icon name="arrow" /></span>
      </button>)}
    </section>

    <section className="trust-strip">
      <div><Icon name="shield"/><strong>Testnet only</strong><span>No Mainnet transaction path</span></div>
      <div><Icon name="wallet"/><strong>Non-custodial</strong><span>Your wallet signs every write</span></div>
      <div><Icon name="server"/><strong>Real providers</strong><span>Errors stay visible, never invented</span></div>
    </section>
  </div>
}
