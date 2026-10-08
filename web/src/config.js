// URL project + publishable key Supabase. Keduanya AMAN dipublikasikan
// (akses data tetap dijaga oleh fungsi api_* dan login).
// Jangan pernah menaruh service_role key atau password database di sini.
// VITE_SUPABASE_URL hanya untuk uji lokal dengan tools/mock-supabase.js
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://btwjjjhrdaffhcuperyi.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fzRfy2VkVHWef6OHtxagHA_9ZWx84VG';

export const GAME_VERSION = 'M3.1';
