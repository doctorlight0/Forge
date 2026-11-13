import type { SVGProps } from 'react'

export type IconName = 'home' | 'search' | 'shield' | 'code' | 'server' | 'wallet' | 'logout' | 'arrow' | 'refresh' | 'copy' | 'external' | 'check' | 'alert' | 'clock' | 'key' | 'cube' | 'spark' | 'menu' | 'close'

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.8 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.7 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/></>,
  code: <><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16"/></>,
  server: <><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h7M11 17h7"/></>,
  wallet: <><path d="M4 6.5h13a3 3 0 0 1 3 3V19H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><path d="M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z"/></>,
  logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H8"/></>,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
  refresh: <><path d="M20 6v5h-5M4 18v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.5-2.2L20 11M4 13l2.4 4.2A7 7 0 0 0 18 15"/></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
  external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  alert: <><path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.8 3h15.2a2 2 0 0 0 1.8-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  key: <><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/></>,
  cube: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.3 7.7 7.7 4.4 7.7-4.4M12 12.1V21"/></>,
  spark: <><path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3ZM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
}

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>
}
