// Supabase tiruan untuk uji lokal: Auth sederhana + RPC ke PGlite yang menjalankan migrasi asli.
// Pemakaian: node tools/mock-supabase.js [port]  lalu build dengan VITE_SUPABASE_URL=http://localhost:<port>
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { freshDb, call } from './pg-harness.js';

const port = Number(process.argv[2] || 54321);
const db = await freshDb({ runTwice: false });
const users = new Map(); // email -> {id, password}

const session = u => ({
  access_token: `tok-${u.id}`, token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `ref-${u.id}`,
  user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
});
const uidOf = req => (req.headers.authorization || '').match(/tok-([0-9a-f-]{36})/)?.[1] || null;

http.createServer(async (req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = ''; for await (const c of req) body += c;
  const json = body ? JSON.parse(body) : {};
  const send = (code, obj) => { res.writeHead(code, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/auth/v1/signup') {
      if (users.has(json.email)) return send(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
      const u = { id: randomUUID(), email: json.email, password: json.password };
      users.set(json.email, u); return send(200, session(u));
    }
    if (url.pathname === '/auth/v1/token') {
      const u = users.get(json.email);
      if (!u || u.password !== json.password) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      return send(200, session(u));
    }
    if (url.pathname === '/auth/v1/user') {
      const id = uidOf(req); const u = [...users.values()].find(x => x.id === id);
      return u ? send(200, session(u).user) : send(401, { msg: 'no user' });
    }
    if (url.pathname === '/auth/v1/logout') { res.writeHead(204, cors); return res.end(); }
    const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (m) {
      const uid = uidOf(req);
      const r = await call(db, m[1], json.a || [], { role: uid ? 'authenticated' : 'anon', uid });
      return send(200, r);
    }
    send(404, { msg: 'not found ' + url.pathname });
  } catch (e) {
    send(400, { code: 'P0001', message: e.message, details: null, hint: null });
  }
}).listen(port, () => console.log(`mock supabase :${port}`));
