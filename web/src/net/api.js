import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';

// Satu pintu ke server, pola sama dengan Marantau:
// semua panggilan lewat fungsi public.api_*(a jsonb) dengan argumen array.
export const supabase = SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

export const isConfigured = () => supabase !== null;

export async function api(name, ...args) {
  if (!supabase) throw new Error('Server belum dikonfigurasi.');
  const { data, error } = await supabase.rpc(name, { a: args });
  if (error) throw new Error(error.message);
  return data;
}
