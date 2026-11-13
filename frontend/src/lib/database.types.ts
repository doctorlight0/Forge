export type Database = {
  public: {
    Tables: {
      saved_wallets: {
        Row: { id: string; user_id: string; network: string; account_id: string; label: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; network?: string; account_id: string; label?: string | null; created_at?: string; updated_at?: string }
        Update: { label?: string | null; updated_at?: string }
        Relationships: []
      }
      saved_contracts: {
        Row: { id: string; user_id: string; network: string; catalog_key: string; contract_account_id: string | null; label: string; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; network?: string; catalog_key: string; contract_account_id?: string | null; label: string; created_at?: string; updated_at?: string }
        Update: { contract_account_id?: string | null; label?: string; updated_at?: string }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
