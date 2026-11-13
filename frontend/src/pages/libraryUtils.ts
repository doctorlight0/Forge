export type LibraryMethodType = 'write' | 'payable' | 'view'
export type LibraryMethod = [string, LibraryMethodType, string]

export function filterLibraryMethods(
  methods: readonly LibraryMethod[],
  query: string,
  typeFilter: 'all' | LibraryMethodType,
): LibraryMethod[] {
  const needle = query.trim().toLowerCase()
  return methods.filter(([name, type, detail]) => {
    if (typeFilter !== 'all' && type !== typeFilter) return false
    if (!needle) return true
    return `${name} ${type} ${detail}`.toLowerCase().includes(needle)
  })
}
