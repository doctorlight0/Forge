SUPABASE AUTH REPAIR REPORT — NEAR FORGE
===========================================

PROJECT: /home/acknowlege/Desktop/near-forge
REPORT GENERATED: 2026-11-13

ACTUAL SUPABASE PROJECT REFERENCE
---------------------------------
URL: https://mupzcmrppcxivpkwbrgl.supabase.co
Publishable key: sb_publishable_4hSy7-2YAp-giqkbwVxaJQ_mAxAfNH-
Project identifier: mupzcmrppcxivpkwbrgl
Environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY

ACTUAL AUTHENTICATION ERROR
----------------------------
Error when calling supabase.auth.signInAnonymously():
  message: "Anonymous sign-ins are disabled"
  status: 422
  code: "anonymous_provider_disabled"
  kind: "authentication"

Root cause (CODE BUG):
  - verifySupabaseConnection() in supabase.ts:110 checked settings.external.anonymous
  - Supabase API actually returns settings.external.anonymous_users
  - Code was checking the wrong field name, causing anonymousSignInsEnabled to be null
  - Fix: Changed field name from "anonymous" to "anonymous_users"

Root cause (DASHBOARD CONFIG):
  - Supabase project mupzcmrppcxivpkwbrgl has anonymous_users: false
  - Anonymous sign-ins are DISABLED in the Supabase dashboard
  - Code fix alone cannot enable a disabled feature
  - Requires manual dashboard configuration change

CODE FIXES APPLIED
------------------
1. frontend/src/lib/supabase.ts:110
   - Changed: settings.external.anonymous → settings.external.anonymous_users
   - Type: configuration bug fix

2. supabase/migrations/202611120001_forge_saved_items.sql
   - Changed: grants from "to anon" → "to authenticated"
   - Changed: RLS policies from "to anon" → "to authenticated" with auth.uid() = user_id ownership checks
   - Purpose: Ensure anonymous-auth users (who receive the Postgres 'authenticated' role) can access only their own records

3. frontend/src/data/ForgeDataContext.tsx:47-49,70-76
   - Added isAnonymousSignInDisabled() helper
   - Added dashboard configuration notice to status message: "• Please enable anonymous sign-ins in your Supabase dashboard project settings."

4. frontend/src/lib/supabase.test.ts:22-24
   - Updated test mock to use "anonymous_users" field name matching the API

MIGRATION STATUS
----------------
Migration 202611120001_forge_saved_items.sql: APPLIED CORRECTLY
- Grants: public.saved_wallets and public.saved_contracts → to authenticated
- RLS policies: All 6 operations per table use "to authenticated" with (select auth.uid()) = user_id
- Corrective migration 202611130001_fix_rls_policies.sql: Created for rollback if needed

TEST RESULTS
------------
All 37 frontend tests pass (12 test files):
- supabase.test.ts: 6/6 passed
- forgeCloudSync.test.ts: 2/2 passed
- localSavedItems.test.ts: 2/2 passed
- Plus 9 other test files (27 tests)

TypeScript: tsc -b passes with no errors
Production build: vite build succeeds

ACTUAL CLOUD CRUD STATUS
------------------------
CRUD operations CANNOT be tested yet because:
- Anonymous sign-ins are DISABLED in the Supabase dashboard
- signInAnonymously() returns error 422 "anonymous_provider_disabled"
- Session cannot be established without enabling anonymous auth

REQUIRED MANUAL ACTIONS
-----------------------
1. Enable anonymous sign-ins in Supabase dashboard:
   a. Go to https://supabase.io/dashboard
   b. Select project: mupzcmrppcxivpkwbrgl
   c. Navigate to: Settings → Auth
   d. Enable: "Anonymously sign-in"
   e. Save changes

2. After enabling anonymous sign-ins, verify:
   - supabase.auth.signInAnonymously() returns valid session
   - Session contains user.id
   - Session persists after page refresh (persistSession: true)
   - Cloud CRUD for saved_wallets and saved_contracts works
   - User isolation: User A cannot access User B's records

3. Optional: Run end-to-end test after enabling:
   - Sign in anonymously
   - Insert test saved wallet
   - Read it back
   - Update it
   - Delete it
   - Repeat for saved_contracts
   - Confirm user isolation

REMAINING CODE FIXES NEEDED (after dashboard enable)
---------------------------------------------------
- None. All code fixes are complete.
- The authentication flow is now correct:
  1. verifySupabaseConnection() properly reads anonymous_users
  2. If anonymousSignInsEnabled is false, error is thrown with dashboard config note
  3. If enabled, signInAnonymously() is called
  4. Session is validated for user.id
  5. synchronizeSavedItems() upserts local data to Supabase
  6. RLS policies ensure user-only access

SUMMARY
-------
- Root cause: Two issues (code bug + dashboard config)
- Code bug: FIXED - verifySupabaseConnection() now checks correct field name
- Dashboard config: REQUIRES MANUAL ENABLE - anonymous sign-ins disabled in project settings
- All code changes are minimal and targeted
- No secrets exposed, no RLS disabled, no NEAR wallet changes
- LocalStorage fallback preserved throughout