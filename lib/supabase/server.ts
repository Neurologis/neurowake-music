import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from './types';

// ─── Why the cast is necessary ────────────────────────────────────────────────
// @supabase/auth-helpers-nextjs@0.10 was written for the 3-parameter form of
// SupabaseClient<Database, SchemaName, Schema>.  @supabase/supabase-js@2.106
// changed to a 5-parameter form.  TypeScript maps auth-helpers' 3rd argument
// (the schema *object* Database['public']) to the new 3rd parameter
// (SchemaName, which expects a *string*).  As a result the actual Schema
// parameter (4th) defaults to `never`, and every .insert()/.update()/.upsert()
// call on the client resolves to `never`.
//
// Casting the return to SupabaseClient<Database> (1 type arg) forces TypeScript
// to use the correct defaults:
//   SchemaName = 'public'
//   Schema     = Database['public']  (our full typed schema)
// ──────────────────────────────────────────────────────────────────────────────
export const createServerClient = (): SupabaseClient<Database> =>
  createRouteHandlerClient<Database>({ cookies }) as unknown as SupabaseClient<Database>;

export const createAdminClient = () =>
  createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
