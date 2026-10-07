// Akun berbasis nama: nama -> <nama>@benonia.game di Supabase Auth (pola Marantau).
// Butuh "Confirm email" dimatikan di Supabase (Authentication -> Sign In / Providers -> Email).
import { supabase, api } from './api.js';

const DOMAIN = 'benonia.game';
const emailOf = u => `${u}@${DOMAIN}`;
export const cleanName = u => (u || '').trim().toLowerCase();

const friendly = msg => {
  if (/Invalid login credentials/i.test(msg)) return 'Nama atau kata sandi salah.';
  if (/already registered/i.test(msg)) return 'Nama sudah dipakai.';
  if (/Password should be/i.test(msg)) return 'Kata sandi minimal 6 karakter.';
  if (/rate limit/i.test(msg)) return 'Terlalu sering mencoba. Tunggu sebentar.';
  return msg;
};

export async function currentProfile() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  let st = await api('api_getState');
  if (!st) {
    // akun ada tapi karakter belum dibuat (mis. daftar terputus di tengah)
    const name = data.session.user.email?.split('@')[0];
    st = await api('api_createCharacter', name);
  }
  return st;
}

export async function signIn(name, password) {
  const u = cleanName(name);
  const { error } = await supabase.auth.signInWithPassword({ email: emailOf(u), password });
  if (error) throw new Error(friendly(error.message));
  return currentProfile();
}

export async function signUp(name, password) {
  const u = cleanName(name);
  const chk = await api('api_checkUsername', u);
  if (!chk.ok) throw new Error(chk.reason);
  const { data, error } = await supabase.auth.signUp({ email: emailOf(u), password });
  if (error) throw new Error(friendly(error.message));
  if (!data.session) {
    throw new Error('Akun dibuat tapi butuh konfirmasi email. Matikan "Confirm email" di Supabase lalu coba Masuk.');
  }
  return api('api_createCharacter', u);
}

export async function signOut() {
  await supabase?.auth.signOut();
}
