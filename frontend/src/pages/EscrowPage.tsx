import { useState } from 'react'
import { useWallet } from '../near/WalletContext'
import { ESCROW_CONTRACT_BY_NETWORK } from '../config'

type Kind = 'Freelance' | 'Milestone' | 'TimeLocked' | 'Arbitrated'

function toYocto(near: string): string {
  const [w, f = ''] = near.trim().split('.')
  const frac = (f + '0'.repeat(24)).slice(0, 24)
  const cleanW = (w || '0').replace(/[^0-9]/g, '') || '0'
  const cleanF = frac.replace(/[^0-9]/g, '').padEnd(24, '0').slice(0, 24)
  return (BigInt(cleanW) * 10n ** 24n + BigInt(cleanF)).toString()
}

export default function EscrowPage() {
  const { accountId, selector, network, escrowContractId } = useWallet()
  const [kind, setKind] = useState<Kind>('Freelance')
  const [seller, setSeller] = useState('')
  const [arbitrator, setArbitrator] = useState('')
  const [amountNear, setAmountNear] = useState('1')
  const [description, setDescription] = useState('')
  const [milestonesText, setMilestonesText] = useState('Design:0.4\nBuild:0.6')
  const [releaseDeadlineMins, setReleaseDeadlineMins] = useState('60')
  const [escrowId, setEscrowId] = useState('')
  const [milestoneId, setMilestoneId] = useState('0')
  const [disputeReason, setDisputeReason] = useState('')
  const [resolveSeller, setResolveSeller] = useState('0')
  const [resolveBuyer, setResolveBuyer] = useState('0')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null)

  const contractId = escrowContractId || ESCROW_CONTRACT_BY_NETWORK[network]

  async function call(method: string, args: any, depositYocto?: string, gasTgas = 50) {
    if (!selector || !accountId) throw new Error('Connect a wallet to sign transactions (no seed phrases/private keys).')
    if (!contractId) throw new Error('Escrow contract address is not configured for this network. Deploy the contract with authorization, then set it in config.')
    const wallet = await selector.wallet()
    const gas = (BigInt(gasTgas) * 10n ** 12n).toString()
    const outcome = await wallet.signAndSendTransaction({
      receiverId: contractId,
      actions: [{
        type: 'FunctionCall',
        params: {
          methodName: method,
          args,
          gas,
          deposit: depositYocto || '0',
        },
      } as any],
    })
    return outcome
  }

  function parseMilestones() {
    return milestonesText.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const [title, amt] = line.split(':')
      return { title: (title || 'Milestone').trim(), amount: toYocto((amt || '0').trim()) }
    })
  }

  async function run(label: string, fn: () => Promise<any>) {
    setBusy(true); setMsg(null)
    try {
      const out = await fn()
      const tx = (out as any)?.transaction?.hash || (out as any)?.transaction_outcome?.id
      setMsg({ type: 'ok', text: `${label} submitted via wallet-signed transaction.${tx ? ` Tx: ${tx}` : ''} Verify on explorer/indexer.` })
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || String(e) })
    } finally { setBusy(false) }
  }

  const canUseContract = !!accountId && !!contractId

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-lg font-semibold">Escrow Studio</h2>
        <p className="text-sm text-slate-400 mt-1">Real wallet-signed calls to the NEAR Forge reusable escrow contract. Workflows: Freelance, Milestone, Time-locked, Arbitrated. No on-chain operations are simulated.</p>
        {!accountId && <div className="mt-3 p-3 rounded border border-amber-800 bg-amber-950/30 text-amber-200 text-sm">Connect a NEAR wallet to create/fund/approve/release/cancel/refund/dispute/resolve escrows. The app never asks for seed phrases or private keys.</div>}
        {!contractId && <div className="mt-3 p-3 rounded border border-amber-800 bg-amber-950/30 text-amber-200 text-sm">Escrow contract not configured for <b>{network}</b>. Contract source and build/tests are in <code>contracts/escrow</code>. After authorized deployment, set the contract account in <code>frontend/src/config.ts</code> (ESCROW_CONTRACT_BY_NETWORK). Until then, on-chain actions are blocked (not faked).</div>}
        {msg && <div className={`mt-3 p-3 rounded border text-sm ${msg.type === 'ok' ? 'border-emerald-800 bg-emerald-950/30 text-emerald-200' : msg.type === 'err' ? 'border-red-800 bg-red-950/30 text-red-200' : 'border-slate-700 bg-slate-900 text-slate-200'}`}>{msg.text}</div>}
      </section>

      <section className="rounded-xl border border-slate-800 p-4 bg-slate-900/30 space-y-3">
        <h3 className="font-semibold">Create Escrow</h3>
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <label className="space-y-1"><span className="text-slate-400">Workflow</span>
            <select value={kind} onChange={e => setKind(e.target.value as Kind)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2">
              <option>Freelance</option><option>Milestone</option><option>TimeLocked</option><option>Arbitrated</option>
            </select>
          </label>
          <label className="space-y-1"><span className="text-slate-400">Seller account</span>
            <input value={seller} onChange={e => setSeller(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2" placeholder="seller.testnet" /></label>
          <label className="space-y-1"><span className="text-slate-400">Arbitrator (required for Arbitrated)</span>
            <input value={arbitrator} onChange={e => setArbitrator(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2" placeholder="arbiter.testnet" /></label>
          <label className="space-y-1"><span className="text-slate-400">Total amount (NEAR)</span>
            <input value={amountNear} onChange={e => setAmountNear(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2" /></label>
          <label className="space-y-1 md:col-span-2"><span className="text-slate-400">Description</span>
            <input value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2" /></label>
          {kind === 'Milestone' && (
            <label className="space-y-1 md:col-span-2"><span className="text-slate-400">Milestones (one per line: Title:AmountNEAR; amounts must sum to total)</span>
              <textarea value={milestonesText} onChange={e => setMilestonesText(e.target.value)} rows={4} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 font-mono text-xs" /></label>
          )}
          {kind === 'TimeLocked' && (
            <label className="space-y-1"><span className="text-slate-400">Release deadline (minutes from now, lock-until)</span>
              <input value={releaseDeadlineMins} onChange={e => setReleaseDeadlineMins(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2" /></label>
          )}
        </div>
        <button disabled={busy || !canUseContract} onClick={() => run('Create escrow', async () => {
          const total = toYocto(amountNear)
          const nowNs = BigInt(Date.now()) * 1_000_000n
          const releaseNs = kind === 'TimeLocked' ? (nowNs + BigInt(parseInt(releaseDeadlineMins || '0', 10) || 0) * 60n * 1_000_000_000n).toString() : null
          const input: any = {
            kind,
            seller: seller.trim(),
            arbitrator: arbitrator.trim() || null,
            total_amount: total,
            description,
            milestones: kind === 'Milestone' ? parseMilestones() : null,
            funding_deadline_ns: null,
            release_deadline_ns: releaseNs,
          }
          return call('create_escrow', { input })
        })} className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 font-medium">Create (wallet-signed)</button>
      </section>

      <section className="rounded-xl border border-slate-800 p-4 bg-slate-900/30 space-y-3">
        <h3 className="font-semibold">Manage Escrow</h3>
        <div className="flex flex-wrap gap-3 text-sm items-end">
          <label className="space-y-1"><span className="text-slate-400">Escrow ID</span>
            <input value={escrowId} onChange={e => setEscrowId(e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-2 py-2 w-32" /></label>
          <label className="space-y-1"><span className="text-slate-400">Milestone ID</span>
            <input value={milestoneId} onChange={e => setMilestoneId(e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-2 py-2 w-28" /></label>
          <label className="space-y-1"><span className="text-slate-400">Fund amount (NEAR)</span>
            <input value={amountNear} onChange={e => setAmountNear(e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-2 py-2 w-32" /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || !canUseContract} onClick={() => run('Fund escrow', () => call('fund_escrow', { escrow_id: Number(escrowId) }, toYocto(amountNear)))} className="px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-50">Fund (attach deposit)</button>
          <button disabled={busy || !canUseContract} onClick={() => run('Approve work', () => call('approve_work', { escrow_id: Number(escrowId) }))} className="px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-50">Approve work</button>
          <button disabled={busy || !canUseContract} onClick={() => run('Approve milestone', () => call('approve_milestone', { escrow_id: Number(escrowId), milestone_id: Number(milestoneId) }))} className="px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-50">Approve milestone</button>
          <button disabled={busy || !canUseContract} onClick={() => run('Release', () => call('release', { escrow_id: Number(escrowId), milestone_id: kind === 'Milestone' ? Number(milestoneId) : null }))} className="px-3 py-1.5 rounded border border-emerald-700 hover:bg-emerald-900/40 disabled:opacity-50">Release</button>
          <button disabled={busy || !canUseContract} onClick={() => run('Cancel', () => call('cancel', { escrow_id: Number(escrowId) }))} className="px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-50">Cancel (unfunded)</button>
          <button disabled={busy || !canUseContract} onClick={() => run('Refund', () => call('refund', { escrow_id: Number(escrowId) }))} className="px-3 py-1.5 rounded border border-amber-700 hover:bg-amber-900/40 disabled:opacity-50">Refund</button>
        </div>
        <div className="grid md:grid-cols-2 gap-3 text-sm pt-2 border-t border-slate-800">
          <label className="space-y-1 md:col-span-2"><span className="text-slate-400">Dispute reason</span>
            <input value={disputeReason} onChange={e => setDisputeReason(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2" /></label>
          <button disabled={busy || !canUseContract} onClick={() => run('Raise dispute', () => call('raise_dispute', { escrow_id: Number(escrowId), reason: disputeReason }))} className="px-3 py-1.5 rounded border border-red-800 hover:bg-red-900/30 disabled:opacity-50">Raise dispute</button>
          <div className="flex gap-2 items-end flex-wrap">
            <label className="space-y-1"><span className="text-slate-400">Release to seller (yocto)</span><input value={resolveSeller} onChange={e => setResolveSeller(e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-2 py-2 w-40" /></label>
            <label className="space-y-1"><span className="text-slate-400">Refund to buyer (yocto)</span><input value={resolveBuyer} onChange={e => setResolveBuyer(e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-2 py-2 w-40" /></label>
            <button disabled={busy || !canUseContract} onClick={() => run('Resolve dispute', () => call('resolve_dispute', { escrow_id: Number(escrowId), release_to_seller: resolveSeller, refund_to_buyer: resolveBuyer }))} className="px-3 py-1.5 rounded border border-cyan-700 hover:bg-cyan-900/30 disabled:opacity-50">Resolve (arbitrator)</button>
          </div>
        </div>
        <p className="text-xs text-slate-500">State tracking/history: query contract views <code>get_escrow</code>, <code>get_milestones</code>, <code>get_history</code>, <code>list_escrows</code> via RPC. UI read panel not yet added; current build prioritizes real wallet-signed state transitions.</p>
      </section>

      <section className="rounded-xl border border-slate-800 p-4 bg-slate-900/30">
        <h3 className="font-semibold mb-2">Workflow coverage (contract implementation)</h3>
        <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">
          <li><b>Freelance:</b> create → fund (exact deposit) → approve_work → release (full) or refund/cancel when eligible.</li>
          <li><b>Milestone:</b> create with milestone amounts summing to total → fund → approve_milestone → release per approved milestone (duplicate-release blocked).</li>
          <li><b>Time-locked:</b> create with release deadline (lock-until) → fund → approve_work → release only at/after deadline; refund paths per state/deadline rules.</li>
          <li><b>Arbitrated:</b> create with arbitrator → fund → raise_dispute (participant) → resolve_dispute by arbitrator with explicit seller/buyer split.</li>
        </ul>
      </section>
    </div>
  )
}
