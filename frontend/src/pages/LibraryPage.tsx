import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState, PageIntro } from '../components/PageState'
import { useForgeData } from '../data/ForgeDataContext'
import { filterLibraryMethods, type LibraryMethod, type LibraryMethodType } from './libraryUtils'

const methods: LibraryMethod[] = [
  ['create_escrow', 'write', 'Create terms and participants. Attached deposit: 0.'],
  ['fund_escrow', 'payable', 'Buyer attaches exactly total_amount in yoctoNEAR.'],
  ['approve_work', 'write', 'Buyer approves non-milestone delivery before release.'],
  ['approve_milestone', 'write', 'Buyer approves a specific milestone before release.'],
  ['release', 'write', 'Buyer releases full escrow or one approved milestone (time-lock rules apply).'],
  ['cancel', 'write', 'Buyer cancels only an unfunded escrow.'],
  ['refund', 'write', 'Return an eligible, unreleased balance to the buyer under contract rules.'],
  ['raise_dispute', 'write', 'Buyer or recipient moves an arbitrated escrow into dispute.'],
  ['resolve_dispute', 'write', 'Arbitrator allocates the full available balance.'],
  ['get_escrow / get_milestones / get_history', 'view', 'Public read-only state and event history.'],
  ['list_escrows / next_escrow_id', 'view', 'Paginated escrow directory and next ID.'],
]

const snippets = {
  build: `cd contracts/escrow\ncargo fmt -- --check\ncargo clippy --all-targets --all-features -- -D warnings\ncargo test\ncargo build --release --target wasm32-unknown-unknown\nsha256sum target/wasm32-unknown-unknown/release/near_forge_escrow.wasm`,
  deploy: `# Testnet only. Requires an authorized funded account.\nnear contract deploy <contract>.testnet use-file \\\n  target/wasm32-unknown-unknown/release/near_forge_escrow.wasm \\\n  with-init-call new json-args '{}' prepaid-gas '100 Tgas' \\\n  attached-deposit '0 NEAR' network-config testnet sign-with-keychain send`,
  integration: `const outcome = await wallet.signAndSendTransaction({\n  receiverId: import.meta.env.VITE_ESCROW_CONTRACT_ID,\n  actions: [{\n    type: 'FunctionCall',\n    params: {\n      methodName: 'fund_escrow',\n      args: { escrow_id: 1 },\n      gas: '50000000000000',\n      deposit: totalAmountYocto,\n    },\n  }],\n})`,
} as const

type SnippetKey = keyof typeof snippets
type TypeFilter = 'all' | LibraryMethodType
const ESCROW_CATALOG_KEY = 'native-near-escrow-engine'

export default function LibraryPage() {
  const { isContractSaved, toggleContract } = useForgeData()
  const [active, setActive] = useState<SnippetKey>('build')
  const [copied, setCopied] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const filteredMethods = useMemo(() => filterLibraryMethods(methods, query, typeFilter), [query, typeFilter])

  async function copy(value: string, label: string) {
    setCopyError(null)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable in this browser context.')
      await navigator.clipboard.writeText(value)
      setCopied(label)
      setTimeout(() => setCopied((current) => (current === label ? null : current)), 1600)
    } catch (reason) {
      setCopyError(reason instanceof Error ? reason.message : 'Unable to copy to clipboard.')
      setCopied(null)
    }
  }

  function clearFilters() {
    setQuery('')
    setTypeFilter('all')
  }

  const hasActiveFilters = query.trim().length > 0 || typeFilter !== 'all'

  return <div className="stack">
    <PageIntro eyebrow="Reusable contract reference" title="Contract Library" description="A developer-facing map of the native NEAR escrow engine: use cases, exact methods, deposits, source location, security boundaries, build verification, deployment, and wallet integration." actions={<div className="page-actions"><span className="badge warn">Unaudited · Testnet tooling</span><button type="button" className="button secondary compact" onClick={() => void toggleContract({ catalogKey: ESCROW_CATALOG_KEY, label: 'Native NEAR Escrow Engine' })}><Icon name={isContractSaved(ESCROW_CATALOG_KEY) ? 'check' : 'spark'}/> {isContractSaved(ESCROW_CATALOG_KEY) ? 'Saved' : 'Save contract'}</button></div>} />

    <section className="panel enter">
      <div className="panel-header">
        <div className="panel-title"><span><Icon name="shield" /></span><div><h2>Native NEAR Escrow Engine</h2><div className="panel-subtitle mono">contracts/escrow · near-sdk 5.x · Rust</div></div></div>
        <span className="badge">Implemented & locally tested</span>
      </div>
      <p className="panel-subtitle" style={{ fontSize: 11, lineHeight: 1.75 }}>Use this template when native NEAR must be held under explicit buyer, recipient, deadline, milestone, or arbitrator rules. It supports freelance delivery, staged milestones, time locks, and arbitrated disputes without collecting application-managed keys.</p>
      <div className="panel-grid three" style={{ marginTop: 18 }}>
        <Info title="When to use" items={['Native NEAR payment coordination', 'Milestone-based freelance work', 'Deadline-gated releases', 'Named third-party arbitration']} />
        <Info title="Required inputs" items={['Seller/recipient AccountId', 'Positive total_amount in yoctoNEAR', 'Workflow-specific deadlines', 'Milestones summing exactly to total']} />
        <Info title="Known boundaries" items={['Native NEAR only; no NEP-141 escrow', 'Independent audit still required', 'Deployment not verified on Testnet', 'Storage economics require monitoring']} />
      </div>
    </section>

    <section className="panel enter">
      <div className="panel-header">
        <div className="panel-title"><span><Icon name="code" /></span><div><h2>Contract interface</h2><div className="panel-subtitle">Names and arguments must match the Rust source exactly</div></div></div>
        <div className="page-actions">
          {hasActiveFilters && <button type="button" className="button secondary compact" onClick={clearFilters}>Clear filters</button>}
        </div>
      </div>
      <div className="filter-bar" role="search" aria-label="Filter contract methods">
        <label className="field search-field">
          <span>Search methods</span>
          <div className="input-group"><Icon name="search" /><input className="mono" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setQuery('') }} placeholder="Search by method, type, or behavior" aria-label="Search contract methods" /></div>
        </label>
        <label className="field select-field">
          <span>Method type</span>
          <select className="select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)} aria-label="Filter methods by type">
            <option value="all">All types</option>
            <option value="write">Write</option>
            <option value="payable">Payable</option>
            <option value="view">View</option>
          </select>
        </label>
      </div>
      <div className="panel-subtitle" style={{ margin: '10px 0 14px' }} aria-live="polite">{filteredMethods.length} of {methods.length} methods shown</div>
      {filteredMethods.length ? (
        <div className="table-wrap results-fade" key={`${query}|${typeFilter}`}>
          <table className="data-table">
            <thead><tr><th>Method</th><th>Type</th><th>Behavior / deposit</th></tr></thead>
            <tbody>{filteredMethods.map(([method, type, detail]) => <tr key={method}><td className="mono">{method}</td><td><span className={`badge ${type === 'payable' ? 'warn' : type === 'view' ? 'neutral' : ''}`}>{type}</span></td><td>{detail}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon="search" title="No methods match" detail="Try a different search term or method type, or clear filters to see the full contract interface." action={<button type="button" className="button secondary" onClick={clearFilters}>Clear filters</button>} />
      )}
    </section>

    <div className="panel-grid">
      <section className="panel enter">
        <div className="panel-header"><div className="panel-title"><span><Icon name="key" /></span><div><h2>Security model</h2><div className="panel-subtitle">Defense-in-depth present in source</div></div></div></div>
        <div className="data-list">{['Role checks for buyer, recipient, and arbitrator', 'Exact attached-deposit accounting with checked arithmetic', 'Guarded state transitions and duplicate-operation prevention', 'Milestone sum validation and deadline enforcement', 'Pending-transfer locks and callback recovery', 'Contract-recorded history for material operations'].map((item) => <div className="data-row" key={item}><div className="data-main"><strong>{item}</strong></div><Icon name="check" style={{ width: 15, color: 'var(--mint)' }} /></div>)}</div>
        <div className="notice warning" style={{ marginTop: 13 }}><Icon name="alert" /><span><strong>Not audited</strong>Local review and tests do not replace an independent smart-contract security audit.</span></div>
      </section>
      <section className="panel enter">
        <div className="panel-header"><div className="panel-title"><span><Icon name="cube" /></span><div><h2>Data model</h2><div className="panel-subtitle">Core states and accounting</div></div></div></div>
        <pre className="code-block">{`Escrow {\n  id, kind, status,\n  buyer, seller, arbitrator,\n  total_amount, funded_amount,\n  released_amount, refunded_amount,\n  created_at_ns, deadlines,\n  description, milestone_count,\n  dispute_reason, pending_transfer\n}\n\nMilestone {\n  id, title, amount,\n  submitted, approved, released\n}`}</pre>
      </section>
    </div>

    <section className="panel enter">
      <div className="panel-header">
        <div className="panel-title"><span><Icon name="server" /></span><div><h2>Build, deploy, and integrate</h2><div className="panel-subtitle">Copyable Testnet recipes with no fabricated contract address</div></div></div>
        <button type="button" className="button secondary compact" onClick={() => void copy(snippets[active], active)}><Icon name={copied === active ? 'check' : 'copy'} /> {copied === active ? 'Copied' : 'Copy snippet'}</button>
      </div>
      {copyError && <div className="notice error" style={{ marginBottom: 13 }}><Icon name="alert" /><span><strong>Copy failed</strong>{copyError}</span></div>}
      <div className="tabs" role="tablist" aria-label="Code snippets" style={{ marginBottom: 13 }}>
        <button type="button" role="tab" aria-selected={active === 'build'} className={active === 'build' ? 'active' : ''} onClick={() => setActive('build')}>Build & test</button>
        <button type="button" role="tab" aria-selected={active === 'deploy'} className={active === 'deploy' ? 'active' : ''} onClick={() => setActive('deploy')}>Testnet deploy</button>
        <button type="button" role="tab" aria-selected={active === 'integration'} className={active === 'integration' ? 'active' : ''} onClick={() => setActive('integration')}>Wallet integration</button>
      </div>
      <pre className="code-block results-fade" key={active}>{snippets[active]}</pre>
      <div className="notice info" style={{ marginTop: 13 }}><Icon name="alert" /><span><strong>Deployment guardrail</strong>Deployment, account creation, and funded lifecycle transactions require separate explicit authorization. Record real receipts before claiming Testnet verification.</span></div>
    </section>
  </div>
}

function Info({ title, items }: { title: string; items: string[] }) {
  return <div><h3 style={{ marginBottom: 10 }}>{title}</h3><div className="data-list">{items.map((item) => <div className="data-row" key={item}><div className="data-main"><span>{item}</span></div></div>)}</div></div>
}
