import { Icon } from './Icon'

export function PageIntro({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <header className="page-intro enter">
    <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>
}

export function EmptyState({ icon = 'spark', title, detail, action }: { icon?: Parameters<typeof Icon>[0]['name']; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} /></span><h3>{title}</h3><p>{detail}</p>{action}</div>
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="skeleton-stack" aria-label="Loading">{Array.from({ length: rows }, (_, index) => <div className="skeleton" key={index} style={{ width: `${92 - index * 9}%` }} />)}</div>
}
