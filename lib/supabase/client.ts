import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Same auth-helpers v0.10 / supabase-js v2.106 incompatibility as server.ts:
// the 3-arg return type maps the schema object to SchemaName (expects string),
// making Schema default to never. Cast to SupabaseClient<Database> (1 type arg)
// to restore correct defaults: SchemaName = 'public', Schema = Database['public'].
export const createClient = (): SupabaseClient<Database> =>
  createClientComponentClient<Database>() as unknown as SupabaseClient<Database>;
