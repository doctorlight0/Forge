export function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="brand-lockup" aria-label="Forge">
    <span className="brand-mark"><span>F</span></span>
    {!compact && <span className="brand-name"><strong>Forge</strong></span>}
  </div>
}
