export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function readLocalItems<T>(storage: StorageLike, key: string): T[] {
  try {
    const value = JSON.parse(storage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function writeLocalItems(storage: StorageLike, key: string, value: unknown[]) {
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
