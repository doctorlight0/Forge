const escrowSource = `// See repository: contracts/escrow/src/lib.rs (canonical source)
// Key types: EscrowKind (Freelance|Milestone|TimeLocked|Arbitrated), EscrowStatus, Escrow, Milestone
// Methods: new, create_escrow, fund_escrow, approve_work, approve_milestone, release,
//          cancel, refund, raise_dispute, resolve_dispute
// Views: get_escrow, get_milestones, get_history, list_escrows, next_escrow_id
// Callbacks: on_release, on_refund (async transfer safety & failure recovery)`

const templates = [
  {
    name: 'Reusable Escrow Engine (native NEAR)',
    path: 'contracts/escrow',
    description: 'Single Rust contract supporting Freelance, Milestone, Time-locked, and Arbitrated escrows with on-chain state, history, and safe async transfers.',
    useCases: ['Client–freelancer payments', 'Staged/milestone delivery', 'Deadline-gated releases', 'Third-party arbitration'],
    params: [
      'kind: Freelance|Milestone|TimeLocked|Arbitrated',
      'seller: AccountId, arbitrator?: AccountId (required for Arbitrated)',
      'total_amount: U128 (yoctoNEAR), description: string',
      'milestones?: [{title, amount}] (Milestone only; amounts must sum to total)',
      'funding_deadline_ns?, release_deadline_ns? (TimeLocked requires deadline semantics)',
    ],
    security: [
      'Buyer/seller/arbitrator authorization checks per action',
      'Participant validation and distinct roles',
      'State guards prevent duplicate funding/release/refund and invalid transitions',
      'Checked arithmetic and exact attached-deposit accounting',
      'Deadline enforcement (funding/release as applicable)',
      'Async transfer callbacks revert intent on failure (recovery)',
      'No seed phrases/private keys in UI; wallet-signed txs only',
    ],
    status: 'IMPLEMENTED / TESTED LOCALLY (unit tests in crate; WASM/build & sandbox verification depend on environment/toolchain)',
  },
]

export default function LibraryPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-lg font-semibold">Contract Library</h2>
        <p className="text-sm text-slate-400 mt-1">Reusable NEAR contract templates with source, parameters, deployment/build/test instructions, integration snippets, and honest verification labels. <b>No contract is claimed audited</b> without an independent audit.</p>
      </section>

      {templates.map(t => (
        <section key={t.name} className="rounded-xl border border-slate-800 p-4 bg-slate-900/30 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-lg">{t.name}</h3>
              <div className="text-xs text-slate-400">Path: <code>{t.path}</code></div>
            </div>
            <span className="text-xs px-2 py-1 rounded border border-cyan-800 text-cyan-300 bg-cyan-950/30">{t.status}</span>
          </div>
          <p className="text-sm text-slate-300">{t.description}</p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium mb-1">Use cases</h4>
              <ul className="list-disc pl-5 text-slate-300 space-y-1">{t.useCases.map(u => <li key={u}>{u}</li>)}</ul>
            </div>
            <div>
              <h4 className="font-medium mb-1">Configuration parameters</h4>
              <ul className="list-disc pl-5 text-slate-300 space-y-1">{t.params.map(p => <li key={p}><code className="text-xs">{p}</code></li>)}</ul>
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-1">Security considerations</h4>
            <ul className="list-disc pl-5 text-slate-300 text-sm space-y-1">{t.security.map(s => <li key={s}>{s}</li>)}</ul>
            <p className="text-xs text-amber-300 mt-2">Verification label: contract logic implemented and covered by Rust unit tests in-repo; this is <b>not</b> an independent audit and <b>not</b> Testnet verification unless receipts are recorded.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-1">Build & test instructions</h4>
              <pre className="text-xs bg-slate-950 border border-slate-800 rounded p-3 overflow-auto whitespace-pre-wrap">{`# Prereqs: Rust toolchain (see rust-toolchain.toml), wasm target
cd contracts/escrow
cargo test

# Release WASM (requires wasm target)
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
# Output: target/wasm32-unknown-unknown/release/near_forge_escrow.wasm

# (Optional) optimize with wasm-opt if available`}</pre>
            </div>
            <div>
              <h4 className="font-medium mb-1">Deployment instructions (Testnet, requires authorization)</h4>
              <pre className="text-xs bg-slate-950 border border-slate-800 rounded p-3 overflow-auto whitespace-pre-wrap">{`# Requires NEAR CLI and an authorized, funded deployer account.
# Never expose seed phrases/private keys in this app.

near deploy --accountId <escrow-contract>.testnet \\
  --wasmFile contracts/escrow/target/wasm32-unknown-unknown/release/near_forge_escrow.wasm

near call <escrow-contract>.testnet new '{}' --accountId <deployer>.testnet

# Then set ESCROW_CONTRACT_BY_NETWORK.testnet in frontend/src/config.ts
# Record actual tx hashes/receipts in docs/evidence/ and FINAL_REPORT.md (VERIFIED ON TESTNET only with evidence).`}</pre>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-1">Integration snippet (wallet-signed function call)</h4>
            <pre className="text-xs bg-slate-950 border border-slate-800 rounded p-3 overflow-auto whitespace-pre-wrap">{`// Using @near-wallet-selector wallet
const wallet = await selector.wallet();
await wallet.signAndSendTransaction({
  receiverId: ESCROW_CONTRACT_ID,
  actions: [{
    type: 'FunctionCall',
    params: {
      methodName: 'create_escrow',
      args: { input: { kind: 'Freelance', seller: 'seller.testnet', arbitrator: null,
        total_amount: '<yocto>', description: 'Work', milestones: null,
        funding_deadline_ns: null, release_deadline_ns: null } },
      gas: '50000000000000',
      deposit: '0',
    },
  }],
});
// Fund requires attached deposit == total_amount (yoctoNEAR).`}</pre>
          </div>

          <div>
            <h4 className="font-medium mb-1">Source (canonical excerpt / reference)</h4>
            <pre className="text-xs bg-slate-950 border border-slate-800 rounded p-3 overflow-auto whitespace-pre-wrap">{escrowSource}</pre>
            <p className="text-xs text-slate-500 mt-1">Full, authoritative source: <code>contracts/escrow/src/lib.rs</code> in this repository.</p>
          </div>
        </section>
      ))}

      <section className="rounded-xl border border-slate-800 p-4 bg-slate-900/30">
        <h3 className="font-semibold mb-2">Test results (honest status)</h3>
        <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">
          <li>Rust unit tests defined in <code>contracts/escrow/src/lib.rs</code> covering creation, funding, authorization/validation, milestone flows, duplicate-release prevention, time-lock deadline enforcement, and arbitrated dispute/resolve state transitions.</li>
          <li>Execution results and WASM build output should be recorded in <code>docs/evidence/</code> and summarized in <code>FINAL_REPORT.md</code> with exact command outcomes.</li>
          <li>Labels: <b>IMPLEMENTED</b> = code present; <b>TESTED LOCALLY</b> = command run with evidence; <b>VERIFIED ON TESTNET</b> = on-chain receipts provided; otherwise <b>BLOCKED/NOT IMPLEMENTED</b> as applicable.</li>
        </ul>
      </section>
    </div>
  )
}
