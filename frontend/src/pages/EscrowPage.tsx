import { useEffect, useMemo, useState } from 'react'
import { ESCROW_CONTRACT_ID, EXPLORER_TX_URL } from '../config'
import { Icon } from '../components/Icon'
import { EmptyState, PageIntro, Skeleton } from '../components/PageState'
import { formatTimestamp, isValidAccountId, nearToYocto, yoctoToNear } from '../near/format'
import { callViewFunction } from '../near/rpc'
import { useWallet } from '../near/WalletContext'

type Kind = 'Freelance' | 'Milestone' | 'TimeLocked' | 'Arbitrated'
type Escrow = { id: number; kind: Kind; status: string; buyer: string; seller: string; arbitrator?: string | null; total_amount: string; funded_amount: string; released_amount: string; refunded_amount: string; created_at_ns: string; funding_deadline_ns?: string | null; release_deadline_ns?: string | null; description: string; milestone_count: number; dispute_reason?: string | null }
type Milestone = { id: number; title: string; amount: string; approved: boolean; released: boolean }
type History = { ts_ns: string; actor: string; action: string; note?: string | null }
type PendingAction = { label: string; method: string; args: Record<string, unknown>; deposit: string; gasTgas?: number }

const terminal = new Set(['Released', 'Refunded', 'Cancelled', 'Resolved'])

export default function EscrowPage() {
  const { accountId, selector, signIn } = useWallet()
  const [tab, setTab] = useState<'browse' | 'create' | 'manage'>('browse')
  const [kind, setKind] = useState<Kind>('Freelance')
  const [seller, setSeller] = useState('')
  const [arbitrator, setArbitrator] = useState('')
  const [amount, setAmount] = useState('1')
  const [description, setDescription] = useState('')
  const [milestonesText, setMilestonesText] = useState('Discovery:0.25\nDelivery:0.75')
  const [releaseMinutes, setReleaseMinutes] = useState('60')
  const [escrowId, setEscrowId] = useState('')
  const [selected, setSelected] = useState<Escrow | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [history, setHistory] = useState<History[]>([])
  const [allEscrows, setAllEscrows] = useState<Escrow[]>([])
  const [milestoneId, setMilestoneId] = useState('0')
  const [disputeReason, setDisputeReason] = useState('')
  const [resolutionSeller, setResolutionSeller] = useState('0')
  const [resolutionBuyer, setResolutionBuyer] = useState('0')
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; title: string; detail: string; tx?: string } | null>(null)
  const [nextId, setNextId] = useState<number | null>(null)

  const configured = Boolean(ESCROW_CONTRACT_ID)
  const available = selected ? BigInt(selected.funded_amount) - BigInt(selected.released_amount) - BigInt(selected.refunded_amount) : 0n
  const role = useMemo(() => !selected || !accountId ? 'Viewer' : accountId === selected.buyer ? 'Buyer' : accountId === selected.seller ? 'Recipient' : accountId === selected.arbitrator ? 'Arbitrator' : 'Viewer', [selected, accountId])

  useEffect(() => { if (configured) void loadDirectory() }, [])

  async function loadDirectory() {
    if (!ESCROW_CONTRACT_ID) return
    try {
      const [items, id] = await Promise.all([
        callViewFunction<Escrow[]>(ESCROW_CONTRACT_ID, 'list_escrows', { from_index: 0, limit: 50 }),
        callViewFunction<number>(ESCROW_CONTRACT_ID, 'next_escrow_id', {}),
      ])
      setAllEscrows(items || []); setNextId(id)
    } catch (reason) {
      setNotice({ type: 'error', title: 'Contract read failed', detail: reason instanceof Error ? reason.message : 'Unable to read escrow directory.' })
    }
  }

  async function loadEscrow(idValue = escrowId) {
    if (!ESCROW_CONTRACT_ID) return
    const id = Number(idValue)
    if (!Number.isSafeInteger(id) || id < 1) { setNotice({ type: 'error', title: 'Invalid escrow ID', detail: 'Enter a positive numeric escrow ID.' }); return }
    setLoading(true); setNotice(null)
    try {
      const [escrow, nextMilestones, nextHistory] = await Promise.all([
        callViewFunction<Escrow | null>(ESCROW_CONTRACT_ID, 'get_escrow', { escrow_id: id }),
        callViewFunction<Milestone[]>(ESCROW_CONTRACT_ID, 'get_milestones', { escrow_id: id }),
        callViewFunction<History[]>(ESCROW_CONTRACT_ID, 'get_history', { escrow_id: id }),
      ])
      if (!escrow) throw new Error(`Escrow #${id} was not found.`)
      setEscrowId(String(id)); setSelected(escrow); setMilestones(nextMilestones || []); setHistory(nextHistory || []); setTab('manage')
      setAmount(yoctoToNear(escrow.total_amount, 24))
    } catch (reason) {
      setSelected(null); setMilestones([]); setHistory([])
      setNotice({ type: 'error', title: 'Escrow unavailable', detail: reason instanceof Error ? reason.message : 'Unable to read escrow.' })
    } finally { setLoading(false) }
  }

  function parseMilestones() {
    const items = milestonesText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const separator = line.lastIndexOf(':')
      if (separator < 1) throw new Error(`Invalid milestone “${line}”. Use Title:AmountNEAR.`)
      return { title: line.slice(0, separator).trim(), amount: nearToYocto(line.slice(separator + 1).trim()) }
    })
    if (!items.length) throw new Error('Add at least one milestone.')
    return items
  }

  function prepareCreate() {
    try {
      if (!isValidAccountId(seller)) throw new Error('Enter a valid recipient Testnet account.')
      if (!description.trim()) throw new Error('Add a clear escrow description.')
      if (kind === 'Arbitrated' && !isValidAccountId(arbitrator)) throw new Error('Arbitrated escrows require a valid arbitrator account.')
      const total = nearToYocto(amount)
      const nowNs = BigInt(Date.now()) * 1_000_000n
      const releaseNs = kind === 'TimeLocked' ? (nowNs + BigInt(Number(releaseMinutes) || 0) * 60n * 1_000_000_000n).toString() : null
      const input = { kind, seller: seller.trim(), arbitrator: arbitrator.trim() || null, total_amount: total, description: description.trim(), milestones: kind === 'Milestone' ? parseMilestones() : null, funding_deadline_ns: null, release_deadline_ns: releaseNs }
      if (kind === 'Milestone') {
        const sum = input.milestones!.reduce((value, item) => value + BigInt(item.amount), 0n)
        if (sum !== BigInt(total)) throw new Error('Milestone amounts must exactly equal the total escrow amount.')
      }
      setPending({ label: 'Create escrow', method: 'create_escrow', args: { input }, deposit: '0' })
    } catch (reason) { setNotice({ type: 'error', title: 'Review the form', detail: reason instanceof Error ? reason.message : 'Invalid input.' }) }
  }

  function prepare(label: string, method: string, args: Record<string, unknown>, deposit = '0') {
    setPending({ label, method, args, deposit })
  }

  async function execute() {
    if (!pending || !selector || !accountId || !ESCROW_CONTRACT_ID) return
    setBusy(true); setNotice({ type: 'info', title: 'Awaiting wallet', detail: 'Review the Testnet receiver, method, deposit, and gas in your wallet before signing.' })
    try {
      const wallet = await selector.wallet()
      const outcome = await wallet.signAndSendTransaction({ receiverId: ESCROW_CONTRACT_ID, actions: [{ type: 'FunctionCall', params: { methodName: pending.method, args: pending.args, gas: (BigInt(pending.gasTgas || 50) * 10n ** 12n).toString(), deposit: pending.deposit } } as any] })
      const tx = (outcome as any)?.transaction?.hash || (outcome as any)?.transaction_outcome?.id
      setNotice({ type: 'success', title: `${pending.label} submitted`, detail: tx ? 'The wallet returned a Testnet transaction hash. Open the receipt to confirm final execution status.' : 'The wallet accepted the request but did not return a transaction hash. Confirm status in your wallet.', tx })
      setPending(null)
      if (selected) await loadEscrow(String(selected.id))
      await loadDirectory()
    } catch (reason: any) {
      setNotice({ type: 'error', title: `${pending.label} not submitted`, detail: reason?.message || String(reason) })
    } finally { setBusy(false) }
  }

  const userEscrows = accountId ? allEscrows.filter((escrow) => [escrow.buyer, escrow.seller, escrow.arbitrator].includes(accountId)) : []
  const pendingApprovals = userEscrows.filter((escrow) => escrow.buyer === accountId && ['Funded', 'InProgress', 'PartiallyReleased'].includes(escrow.status))
  const disputed = userEscrows.filter((escrow) => escrow.status === 'Disputed')

  return <div className="stack">
    <PageIntro eyebrow="Native NEAR payment coordination" title="Escrow Studio" description="Create, fund, inspect, approve, release, refund, and arbitrate escrows through the exact Rust contract interface. Every write is wallet-signed; every read is public." actions={<div className="tabs"><button className={tab === 'browse' ? 'active' : ''} onClick={() => setTab('browse')}>Browse</button><button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>Create</button><button className={tab === 'manage' ? 'active' : ''} onClick={() => setTab('manage')}>Manage</button></div>}/>

    {!configured && <div className="notice warning"><Icon name="alert"/><span><strong>Contract not configured</strong>Set VITE_ESCROW_CONTRACT_ID to an actually deployed Testnet contract. Read and write controls remain unavailable; no result is simulated.</span></div>}
    {notice && <div className={`notice ${notice.type}`}><Icon name={notice.type === 'success' ? 'check' : notice.type === 'error' ? 'alert' : 'clock'}/><span><strong>{notice.title}</strong>{notice.detail}{notice.tx && <a className="link" href={EXPLORER_TX_URL(notice.tx)} target="_blank" rel="noreferrer">View Testnet receipt <Icon name="external"/></a>}</span></div>}

    {tab === 'browse' && <>
      <section className="metric-grid"><div className="metric"><label>Next escrow ID</label><strong>{nextId ?? '—'}</strong><small>Contract view</small></div><div className="metric"><label>Your escrows</label><strong>{accountId ? userEscrows.length : '—'}</strong><small>{accountId ? 'buyer, recipient, or arbitrator' : 'connect to filter by participant'}</small></div><div className="metric"><label>Pending approvals</label><strong>{accountId ? pendingApprovals.length : '—'}</strong><small>actionable by connected buyer</small></div><div className="metric"><label>Open disputes</label><strong>{accountId ? disputed.length : '—'}</strong><small>participant or arbitrator view</small></div></section>
      <section className="panel"><div className="panel-header"><div className="panel-title"><span><Icon name="search"/></span><div><h2>Inspect an escrow</h2><div className="panel-subtitle">Public contract views do not require a wallet</div></div></div><button className="button secondary compact" onClick={() => void loadDirectory()} disabled={!configured}><Icon name="refresh"/> Refresh list</button></div><div className="input-group"><Icon name="search"/><input inputMode="numeric" value={escrowId} onChange={(event) => setEscrowId(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadEscrow() }} placeholder="Escrow ID"/><button className="button primary" onClick={() => void loadEscrow()} disabled={!configured || loading}>{loading ? 'Loading…' : 'Open escrow'}</button></div></section>
      <section className="panel"><div className="panel-header"><div className="panel-title"><span><Icon name="shield"/></span><div><h2>{accountId ? 'Participant workspace' : 'Recent escrows'}</h2><div className="panel-subtitle">{accountId ? `${userEscrows.length} escrows involving ${accountId}` : 'Connect only if you want participant-specific filtering'}</div></div></div>{!accountId && <button className="button secondary compact" onClick={signIn}><Icon name="wallet"/> Connect for my view</button>}</div>
        {(accountId ? userEscrows : allEscrows).length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>ID</th><th>Workflow</th><th>Participants</th><th>Amount</th><th>Status</th></tr></thead><tbody>{(accountId ? userEscrows : allEscrows).map((escrow) => <tr key={escrow.id} onClick={() => void loadEscrow(String(escrow.id))} style={{ cursor: 'pointer' }}><td className="mono">#{escrow.id}</td><td>{escrow.kind}</td><td>{escrow.buyer}<br/><span style={{ color: 'var(--dim)' }}>→ {escrow.seller}</span></td><td>{yoctoToNear(escrow.total_amount)} Ⓝ</td><td><span className={`badge ${terminal.has(escrow.status) ? 'neutral' : escrow.status === 'Disputed' ? 'danger' : ''}`}>{escrow.status}</span></td></tr>)}</tbody></table></div> : (
          <EmptyState icon="shield" title="No escrow records available" detail={configured ? 'The contract returned an empty list for this view.' : 'Configure a deployed Testnet contract to read live state.'}/>
        )}
      </section>
    </>}

    {tab === 'create' && <section className="panel"><div className="panel-header"><div className="panel-title"><span><Icon name="spark"/></span><div><h2>Create a new escrow</h2><div className="panel-subtitle">Creation stores terms; funding is a separate exact-deposit transaction</div></div></div><span className="badge">Testnet</span></div>
      <div className="panel-grid">
        <label className="field"><span>Workflow</span><select className="select" value={kind} onChange={(event) => setKind(event.target.value as Kind)}><option>Freelance</option><option>Milestone</option><option>TimeLocked</option><option>Arbitrated</option></select><small>Choose the state machine that matches the engagement.</small></label>
        <label className="field"><span>Total amount (NEAR)</span><input className="input" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal"/><small>Funding later requires this exact attached deposit.</small></label>
        <label className="field"><span>Recipient account</span><input className="input mono" value={seller} onChange={(event) => setSeller(event.target.value)} placeholder="recipient.testnet"/></label>
        <label className="field"><span>Arbitrator account</span><input className="input mono" value={arbitrator} onChange={(event) => setArbitrator(event.target.value)} placeholder={kind === 'Arbitrated' ? 'Required for this workflow' : 'Optional dispute authority'}/></label>
        <label className="field" style={{ gridColumn: '1/-1' }}><span>Description</span><textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Define the work, evidence, approval conditions, and expected outcome."/></label>
        {kind === 'Milestone' && <label className="field" style={{ gridColumn: '1/-1' }}><span>Milestones · Title:AmountNEAR</span><textarea className="textarea" value={milestonesText} onChange={(event) => setMilestonesText(event.target.value)}/><small>Every amount must be positive and the sum must equal the total.</small></label>}
        {kind === 'TimeLocked' && <label className="field"><span>Release lock (minutes from creation)</span><input className="input" type="number" min="1" value={releaseMinutes} onChange={(event) => setReleaseMinutes(event.target.value)}/></label>}
      </div>
      <div className="page-actions" style={{ marginTop: 18, justifyContent: 'flex-start' }}>{accountId ? <button className="button primary" disabled={!configured} onClick={prepareCreate}>Review creation <Icon name="arrow"/></button> : <button className="button primary" onClick={signIn}><Icon name="wallet"/> Connect wallet to create</button>}<span className="panel-subtitle">No deposit is attached to create_escrow.</span></div>
    </section>}

    {tab === 'manage' && <>{loading ? <section className="panel"><Skeleton rows={7}/></section> : !selected ? <section className="panel"><EmptyState icon="search" title="Choose an escrow" detail="Open an escrow by ID from Browse to see live terms, milestones, history, and role-aware actions."/></section> : <>
      <section className="metric-grid"><div className="metric"><label>Escrow</label><strong>#{selected.id}</strong><small>{selected.kind}</small></div><div className="metric"><label>Locked balance</label><strong>{yoctoToNear(available)} Ⓝ</strong><small>{available.toString()} yoctoNEAR</small></div><div className="metric"><label>Your role</label><strong>{role}</strong><small>{accountId || 'wallet disconnected'}</small></div><div className="metric"><label>Status</label><strong>{selected.status}</strong><small>on-chain state</small></div></section>
      <div className="split-layout"><div className="stack"><section className="panel"><div className="panel-header"><div className="panel-title"><span><Icon name="shield"/></span><div><h2>{selected.description}</h2><div className="panel-subtitle">Created {formatTimestamp(selected.created_at_ns)}</div></div></div><span className={`badge ${selected.status === 'Disputed' ? 'danger' : terminal.has(selected.status) ? 'neutral' : ''}`}>{selected.status}</span></div><div className="data-list"><div className="data-row"><div className="data-main"><strong>Buyer</strong><span className="mono">{selected.buyer}</span></div></div><div className="data-row"><div className="data-main"><strong>Recipient</strong><span className="mono">{selected.seller}</span></div></div>{selected.arbitrator && <div className="data-row"><div className="data-main"><strong>Arbitrator</strong><span className="mono">{selected.arbitrator}</span></div></div>}<div className="data-row"><div className="data-main"><strong>Deadlines</strong><span>Funding: {formatTimestamp(selected.funding_deadline_ns || undefined)} · Release: {formatTimestamp(selected.release_deadline_ns || undefined)}</span></div></div></div></section>
        {milestones.length > 0 && <section className="panel"><div className="panel-header"><div className="panel-title"><span><Icon name="check"/></span><div><h2>Milestones</h2><div className="panel-subtitle">Individual approvals and releases</div></div></div></div><div className="data-list">{milestones.map((milestone) => <div className="data-row" key={milestone.id}><div className="data-main"><strong>#{milestone.id} · {milestone.title}</strong><span>{yoctoToNear(milestone.amount)} Ⓝ · {milestone.approved ? 'approved' : 'pending approval'}</span><div className="progress-track" style={{ marginTop: 8 }}><div className="progress-fill" style={{ width: milestone.released ? '100%' : milestone.approved ? '60%' : '8%' }}/></div></div><span className={`badge ${milestone.released ? '' : 'neutral'}`}>{milestone.released ? 'Released' : milestone.approved ? 'Approved' : 'Pending'}</span></div>)}</div></section>}
      <section className="panel"><div className="panel-header"><div className="panel-title"><span><Icon name="clock"/></span><div><h2>History</h2><div className="panel-subtitle">Contract-recorded state events</div></div></div></div>{history.length ? <div className="timeline">{[...history].reverse().map((event, index) => <div className="timeline-item" key={index}><strong>{event.action.replace(/_/g, ' ')}</strong><span>{formatTimestamp(event.ts_ns)} · {event.actor}{event.note ? ` · ${event.note}` : ''}</span></div>)}</div> : <EmptyState icon="clock" title="No history returned" detail="This escrow has no recorded events beyond its current state."/>}</section>
      </div>
      <aside className="stack"><section className="panel"><div className="panel-header"><div className="panel-title"><span><Icon name="wallet"/></span><div><h2>Actions</h2><div className="panel-subtitle">Enabled by role and current status</div></div></div></div>{!accountId && <div className="notice info" style={{ marginBottom: 12 }}><Icon name="wallet"/><span><strong>Browsing mode</strong>Connect only when you are ready to sign an action.</span></div>}<div className="action-grid">
        <Action label="Fund exact amount" detail={`${yoctoToNear(selected.total_amount)} NEAR`} enabled={role === 'Buyer' && selected.status === 'Created'} onClick={() => prepare('Fund escrow', 'fund_escrow', { escrow_id: selected.id }, selected.total_amount)}/>
        <Action label="Approve work" detail="Buyer confirms delivery" enabled={role === 'Buyer' && ['Funded','InProgress'].includes(selected.status) && selected.kind !== 'Milestone'} onClick={() => prepare('Approve work', 'approve_work', { escrow_id: selected.id })}/>
        <Action label="Release funds" detail="Transfer available balance" enabled={role === 'Buyer' && ['Funded','InProgress'].includes(selected.status) && selected.kind !== 'Milestone'} onClick={() => prepare('Release funds', 'release', { escrow_id: selected.id, milestone_id: null })}/>
        <Action label="Cancel" detail="Unfunded escrow only" enabled={role === 'Buyer' && selected.status === 'Created'} onClick={() => prepare('Cancel escrow', 'cancel', { escrow_id: selected.id })}/>
        <Action label="Refund" detail="Eligible unreleased balance" enabled={['Buyer','Arbitrator'].includes(role) && ['Funded','InProgress','Disputed'].includes(selected.status) && BigInt(selected.released_amount) === 0n} onClick={() => prepare('Refund escrow', 'refund', { escrow_id: selected.id })}/>
      </div>
      {selected.kind === 'Milestone' && <div className="stack" style={{ marginTop: 14 }}><label className="field"><span>Milestone ID</span><select className="select" value={milestoneId} onChange={(event) => setMilestoneId(event.target.value)} disabled={milestones.length === 0}>{milestones.length ? milestones.map((item) => <option value={item.id} key={item.id}>#{item.id} · {item.title}</option>) : <option value="">No milestones</option>}</select></label><div className="action-grid"><Action label="Approve milestone" detail="Buyer approval" enabled={role === 'Buyer' && milestones.length > 0} onClick={() => prepare('Approve milestone', 'approve_milestone', { escrow_id: selected.id, milestone_id: Number(milestoneId) })}/><Action label="Release milestone" detail="Transfer approved milestone amount" enabled={role === 'Buyer' && milestones.length > 0} onClick={() => prepare('Release milestone', 'release', { escrow_id: selected.id, milestone_id: Number(milestoneId) })}/></div><div className="panel-subtitle">The current on-chain contract tracks approval and release per milestone; separate submission is not a contract method.</div></div>}
      </section>
      <section className="panel"><div className="panel-header"><div className="panel-title"><span><Icon name="alert"/></span><div><h2>Dispute controls</h2><div className="panel-subtitle">Available only when an arbitrator is configured</div></div></div></div><label className="field"><span>Dispute reason</span><textarea className="textarea" value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} placeholder="State the disagreement and evidence clearly."/></label><button className="button danger" style={{ marginTop: 10, width: '100%' }} disabled={!['Buyer','Recipient'].includes(role) || !selected.arbitrator || !['Funded','InProgress','PartiallyReleased'].includes(selected.status)} onClick={() => prepare('Raise dispute', 'raise_dispute', { escrow_id: selected.id, reason: disputeReason })}>Raise dispute</button>
        {role === 'Arbitrator' && selected.status === 'Disputed' && <div className="panel-grid" style={{ marginTop: 14 }}><label className="field"><span>Release to recipient (NEAR)</span><input className="input" value={resolutionSeller} onChange={(event) => setResolutionSeller(event.target.value)}/></label><label className="field"><span>Refund to buyer (NEAR)</span><input className="input" value={resolutionBuyer} onChange={(event) => setResolutionBuyer(event.target.value)}/></label><button className="button primary" style={{ gridColumn: '1/-1' }} onClick={() => { try { prepare('Resolve dispute', 'resolve_dispute', { escrow_id: selected.id, release_to_seller: nearToYocto(resolutionSeller), refund_to_buyer: nearToYocto(resolutionBuyer) }) } catch (reason) { setNotice({ type: 'error', title: 'Invalid resolution', detail: reason instanceof Error ? reason.message : 'Invalid amounts.' }) } }}>Review resolution</button></div>}
      </section></aside></div>
    </>}</>}

    {pending && <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && setPending(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="transaction-review" onMouseDown={(event) => event.stopPropagation()}><div className="panel-header"><div className="panel-title"><span><Icon name="wallet"/></span><div><h2 id="transaction-review">Review Testnet transaction</h2><div className="panel-subtitle">Your wallet will show the final signing prompt</div></div></div><button className="icon-button" onClick={() => setPending(null)} disabled={busy} aria-label="Close review"><Icon name="close"/></button></div><div className="data-list"><div className="data-row"><div className="data-main"><strong>Action</strong><span>{pending.label} · {pending.method}</span></div></div><div className="data-row"><div className="data-main"><strong>Receiver</strong><span className="mono">{ESCROW_CONTRACT_ID}</span></div></div><div className="data-row"><div className="data-main"><strong>Attached deposit</strong><span>{pending.deposit === '0' ? '0 NEAR' : `${yoctoToNear(pending.deposit, 24)} NEAR`} · {pending.deposit} yoctoNEAR</span></div></div><div className="data-row"><div className="data-main"><strong>Network</strong><span>NEAR Testnet only</span></div><span className="badge">Testnet</span></div></div><pre className="code-block" style={{ marginTop: 12 }}>{JSON.stringify(pending.args, null, 2)}</pre><div className="page-actions" style={{ marginTop: 16 }}><button className="button secondary" onClick={() => setPending(null)} disabled={busy}>Cancel</button>{accountId ? <button className="button primary" onClick={() => void execute()} disabled={busy}>{busy ? 'Opening wallet…' : 'Continue to wallet'} <Icon name="arrow"/></button> : <button className="button primary" onClick={() => { setPending(null); signIn() }}><Icon name="wallet"/> Connect wallet</button>}</div></section></div>}
  </div>
}

function Action({ label, detail, enabled, onClick }: { label: string; detail: string; enabled: boolean; onClick: () => void }) {
  return <button className="action-button" disabled={!enabled} onClick={onClick}><span><strong>{label}</strong><small>{detail}</small></span><Icon name="arrow"/></button>
}
