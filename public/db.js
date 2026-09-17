const SUPABASE_URL = 'https://qcymqanttwaoliksosui.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jDvTUYZ7ytE1UE5hZAbPtw_WvsmBSqR';
const SESSION_KEY = 'broker-one-session';

export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
}

function saveSession(value) {
  if (value?.access_token) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  else sessionStorage.removeItem(SESSION_KEY);
}

async function request(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const session = getSession();
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(auth && session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || `Erreur Supabase ${response.status}`);
  return data;
}

export async function signUp({ email, password, displayName, companyName, accountType }) {
  const data = await request('/auth/v1/signup', { method:'POST', auth:false, body:{ email, password, data:{ display_name:displayName, company_name:companyName, account_type:accountType } } });
  if (data?.access_token) saveSession(data);
  return data;
}

export async function signIn(email, password) {
  const data = await request('/auth/v1/token?grant_type=password', { method:'POST', auth:false, body:{ email, password } });
  saveSession(data);
  return data;
}

export async function signOut() {
  try { await request('/auth/v1/logout', { method:'POST' }); } finally { saveSession(null); }
}

export async function refreshSession() {
  const session = getSession();
  if (!session?.refresh_token) return null;
  try {
    const data = await request('/auth/v1/token?grant_type=refresh_token', { method:'POST', auth:false, body:{ refresh_token:session.refresh_token } });
    saveSession(data); return data;
  } catch { saveSession(null); return null; }
}

export async function table(name, { select = '*', filters = '', order = '', limit, method = 'GET', body, single = false } = {}) {
  const query = method === 'GET' ? `?select=${encodeURIComponent(select)}${filters}${order ? `&order=${encodeURIComponent(order)}` : ''}${limit ? `&limit=${limit}` : ''}` : filters;
  const prefer = method === 'POST' || method === 'PATCH' ? 'return=representation' : undefined;
  const rows = await request(`/rest/v1/${name}${query}`, { method, body, headers: prefer ? { Prefer:prefer } : {} });
  return single && Array.isArray(rows) ? rows[0] : rows;
}

export async function rpc(name, body = {}) {
  return request(`/rest/v1/rpc/${encodeURIComponent(name)}`, { method:'POST', body });
}

export const currentUser = () => getSession()?.user || null;
