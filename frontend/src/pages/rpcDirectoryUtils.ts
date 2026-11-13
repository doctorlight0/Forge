import type { ProviderType } from '../data/rpcProviders'

export type RpcDirectoryItem = {
  id: string
  name: string
  type: ProviderType
  url: string
  purpose: string
  auth: string
  rateLimit: string
  archival: string
  notes?: string
  checkable: boolean
}

export function filterRpcDirectory<T extends RpcDirectoryItem>(
  items: readonly T[],
  query: string,
  typeFilter: 'all' | ProviderType,
): T[] {
  const q = query.trim().toLowerCase()
  return items.filter((provider) => {
    if (typeFilter !== 'all' && provider.type !== typeFilter) return false
    if (!q) return true
    const hay = `${provider.name} ${provider.type} ${provider.url} ${provider.purpose} ${provider.auth} ${provider.rateLimit} ${provider.notes || ''} ${provider.archival}`.toLowerCase()
    return hay.includes(q)
  })
}
