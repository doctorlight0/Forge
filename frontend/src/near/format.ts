export function isValidAccountId(value: string) {
  const accountId = value.trim().toLowerCase()
  if (/^[0-9a-f]{64}$/.test(accountId)) return true
  return accountId.length >= 2 && accountId.length <= 64 && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(accountId)
}

export function yoctoToNear(value: string | number | bigint, precision = 5) {
  try {
    const yocto = BigInt(value)
    const whole = yocto / 10n ** 24n
    const fraction = (yocto % 10n ** 24n).toString().padStart(24, '0').slice(0, precision).replace(/0+$/, '')
    return fraction ? `${whole}.${fraction}` : whole.toString()
  } catch { return String(value) }
}

export function nearToYocto(value: string) {
  if (!/^\d+(\.\d{0,24})?$/.test(value.trim())) throw new Error('Enter a valid NEAR amount with up to 24 decimal places.')
  const [whole, fraction = ''] = value.trim().split('.')
  return (BigInt(whole) * 10n ** 24n + BigInt(fraction.padEnd(24, '0'))).toString()
}

export function shortAccount(value: string, edge = 10) {
  return value.length <= edge * 2 + 3 ? value : `${value.slice(0, edge)}…${value.slice(-edge)}`
}

export function formatTimestamp(ns?: string | number) {
  if (!ns) return 'Not set'
  const ms = Number(BigInt(ns) / 1_000_000n)
  return Number.isFinite(ms) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(ms) : 'Unknown'
}
