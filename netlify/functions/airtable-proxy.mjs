// Serverless function: Airtable API Proxy (hardened)
// Deploy as Netlify Function: netlify/functions/airtable-proxy.mjs
//
// Required env vars (set in the hosting dashboard, never in client code):
//   AIRTABLE_API_KEY = pat...
//   AIRTABLE_BASE_ID = app...
//
// Optional env vars:
//   SESSION_SECRET     = long random string used to sign sessions (strongly recommended)
//   ALLOWED_ORIGINS    = comma-separated list of browser origins allowed to call this API
//   ADMIN_HASHES_JSON  = JSON map of email -> sha256("kibun-admin-v1:" + password)
//
// Admin passwords are NOT stored in the browser. Only their hashes live here
// (or in ADMIN_HASHES_JSON), and login is validated server-side.

import { createHash, createHmac, timingSafeEqual } from 'crypto';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

// ── Security configuration ────────────────────────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET || 'kibun-session-secret-v1-rotate-me';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const ADMIN_SALT = 'kibun-admin-v1:';

const DEFAULT_ADMIN_HASHES = {
  'admin@automotoreskibun.com': 'f1b43fa7ecd9d548fbab79fe32f6a5aa010c46286b2853ebc6203adb792915b2',
  'fabiopabon.movilnet@gmail.com': '9cdfcc97384a22704b0f5c3c55174a3157c783dc1e382042fb98c03c7454cacc'
};

function loadAdminHashes() {
  try {
    if (process.env.ADMIN_HASHES_JSON) {
      const parsed = JSON.parse(process.env.ADMIN_HASHES_JSON);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.error('[airtable-proxy] ADMIN_HASHES_JSON invalido:', e.message);
  }
  return DEFAULT_ADMIN_HASHES;
}
const ADMIN_HASHES = loadAdminHashes();

const DEFAULT_ORIGINS = [
  'https://latinbienti-sys.github.io',
  'https://fabiopabonmovilnet-rgb.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'null' // enables local file:// testing only; token auth still applies
];
const ALLOWED_ORIGINS = new Set(DEFAULT_ORIGINS);
if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').forEach(function(o) {
    const v = o.trim();
    if (v) ALLOWED_ORIGINS.add(v);
  });
}

const VALID_STATUSES = ['Nuevo', 'Contactado', 'En seguimiento', 'Cerrado', 'Cancelado'];

// ── Env validation ────────────────────────────────────────────────────
function validateEnv() {
  const missing = [];
  if (!AIRTABLE_API_KEY) missing.push('AIRTABLE_API_KEY');
  if (!AIRTABLE_BASE_ID) missing.push('AIRTABLE_BASE_ID');
  if (missing.length) {
    console.error('[airtable-proxy] CRITICAL: Missing env vars: ' + missing.join(', '));
    return { ok: false, missing };
  }
  console.log('[airtable-proxy] Env OK (credentials loaded from environment)');
  return { ok: true };
}

// ── HTTP helpers ──────────────────────────────────────────────────────
function requestOrigin(event) {
  const h = event.headers || {};
  return h.origin || h.Origin || '';
}
function originAllowed(event) {
  const o = requestOrigin(event);
  return !!o && ALLOWED_ORIGINS.has(o);
}
function corsHeaders(event) {
  return {
    'Access-Control-Allow-Origin': originAllowed(event) ? requestOrigin(event) : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  };
}
function reply(event, statusCode, payload) {
  if (!originAllowed(event)) {
    return {
      statusCode: 403,
      headers: corsHeaders(event),
      body: JSON.stringify({ success: false, error: 'Origin no autorizado.', code: 'ORIGIN_DENIED' })
    };
  }
  return { statusCode, headers: corsHeaders(event), body: JSON.stringify(payload) };
}

// ── Best-effort rate limiting (per function instance) ─────────────────
const RATE_BUCKETS = new Map();
function clientIp(event, context) {
  const h = event.headers || {};
  return h['x-nf-client-connection-ip'] || h['client-ip'] || h['x-forwarded-for'] ||
         (context && context.client && context.client.ip) || 'unknown';
}
function hitBucket(key, max, windowMs, blockMs) {
  const now = Date.now();
  let b = RATE_BUCKETS.get(key);
  if (!b || now >= b.reset) b = { count: 0, reset: now + windowMs, blockedUntil: 0 };
  if (b.blockedUntil && now < b.blockedUntil) {
    RATE_BUCKETS.set(key, b);
    return { ok: false, retryAfter: Math.ceil((b.blockedUntil - now) / 1000) };
  }
  if (b.blockedUntil) b.blockedUntil = 0;
  b.count++;
  if (b.count > max) {
    b.blockedUntil = now + (blockMs || windowMs);
    RATE_BUCKETS.set(key, b);
    return { ok: false, retryAfter: Math.ceil((b.blockedUntil - now) / 1000) };
  }
  RATE_BUCKETS.set(key, b);
  if (RATE_BUCKETS.size > 5000) {
    for (const [k, v] of RATE_BUCKETS) if (v.reset < now) RATE_BUCKETS.delete(k);
  }
  return { ok: true };
}
function clearBucket(key) { RATE_BUCKETS.delete(key); }
function limitFor(operation) {
  if (operation === 'loginAdmin' || operation === 'validateVendedor') {
    return { key: 'auth', max: 6, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 };
  }
  if (operation === 'saveLead') {
    return { key: 'write', max: 20, windowMs: 60 * 60 * 1000, blockMs: 30 * 60 * 1000 };
  }
  if (operation === 'findMisProformas') {
    return { key: 'search', max: 30, windowMs: 10 * 60 * 1000, blockMs: 10 * 60 * 1000 };
  }
  return { key: 'other', max: 150, windowMs: 5 * 60 * 1000, blockMs: 5 * 60 * 1000 };
}

// ── Signed sessions ───────────────────────────────────────────────────
function signSession(payload) {
  const now = Date.now();
  const body = Buffer.from(JSON.stringify({
    role: payload.role, sub: payload.sub, nombre: payload.nombre || '',
    iat: now, exp: now + SESSION_TTL_MS
  })).toString('base64url');
  const sig = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function readSession(token) {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  let sig, expected;
  try {
    sig = Buffer.from(parts[1], 'base64url');
    expected = createHmac('sha256', SESSION_SECRET).update(parts[0]).digest();
  } catch (e) { return null; }
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); }
  catch (e) { return null; }
  if (!p || !p.role || !p.exp || p.exp < Date.now()) return null;
  return p;
}
function authFromEvent(event) {
  const h = event.headers || {};
  const header = h.authorization || h.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? readSession(m[1]) : null;
}
function requireAuth(event, roles) {
  const session = authFromEvent(event);
  if (!session) {
    return { error: reply(event, 401, { success: false, error: 'Sesión inválida o expirada. Ingresa nuevamente.', code: 'UNAUTHORIZED' }) };
  }
  if (roles && roles.indexOf(session.role) === -1) {
    return { error: reply(event, 403, { success: false, error: 'No tienes permiso para esta operación.', code: 'FORBIDDEN' }) };
  }
  return { session };
}

// ── Input helpers ─────────────────────────────────────────────────────
function cleanStr(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function safeNum(v, max) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= (max || 1e9) ? Math.round(n * 100) / 100 : null;
}
function hashHex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}
function hashPin(pin) { return hashHex(pin); }
function hashAdminPassword(pass) { return hashHex(ADMIN_SALT + String(pass)); }
function hashEquals(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
function escapeFormula(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function searchFormula(term, field) {
  return "SEARCH('" + escapeFormula(term) + "', " + field + ")";
}
function normSearch(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[\s\-_\.]/g, '').trim();
}
function normalizeAirtableField(field) {
  // Accent-insensitive, separator-free comparison inside an Airtable formula.
  let expr = 'LOWER(' + field + ')';
  const accents = [['á','a'],['é','e'],['í','i'],['ó','o'],['ú','u'],['ñ','n']];
  accents.forEach(function(p) {
    expr = "SUBSTITUTE(" + expr + ",'" + p[0] + "','" + p[1] + "')";
  });
  [[' ',''],['-',''],['_',''],['.',''],['/','']].forEach(function(p) {
    expr = "SUBSTITUTE(" + expr + ",'" + p[0] + "','" + p[1] + "')";
  });
  return expr;
}

// ── Schema definitions ────────────────────────────────────────────────
const LEADS_REQUIRED_FIELDS = [
  { name: 'Cliente',             type: 'Single line text' },
  { name: 'Cedula',              type: 'Single line text' },
  { name: 'Telefono Cliente',    type: 'Phone number' },
  { name: 'Direccion',           type: 'Single line text' },
  { name: 'Correo Cliente',      type: 'Email' },
  { name: 'Vehiculo Interesado', type: 'Single line text' },
  { name: 'Color',               type: 'Single line text' },
  { name: 'Asesor Asignado',     type: 'Single line text' },
  { name: 'Plan Elegido',        type: 'Single line text' },
  { name: 'Monto Inicial',       type: 'Currency' },
  { name: 'Cuota Mensual',       type: 'Currency' },
  { name: 'Fecha',               type: 'Date' },
  { name: 'Estatus',             type: 'Single select', options: { choices: [
    { name: 'Nuevo', color: 'blue' },
    { name: 'Contactado', color: 'orange' },
    { name: 'En seguimiento', color: 'purple' },
    { name: 'Cerrado', color: 'green' },
    { name: 'Cancelado', color: 'red' }
  ]}}
];
const LEADS_OPTIONAL_FIELDS = new Set(['Color', 'Estatus', 'Direccion', 'Correo Cliente']);
const VEHICULOS_REQUIRED_FIELDS = [
  { name: 'PVP', type: 'Number' }, { name: 'IVA_16', type: 'Number' },
  { name: 'IGTF_3', type: 'Number' }, { name: 'Tramites_Gastos', type: 'Number' },
  { name: 'Total', type: 'Number' }, { name: 'Color_Blanco', type: 'URL' },
  { name: 'Color_Negro', type: 'URL' }, { name: 'Color_Plata', type: 'URL' },
  { name: 'Color_Azul', type: 'URL' }, { name: 'Color_Rojo', type: 'URL' }
];
const ASESORES_REQUIRED_FIELDS = [
  { name: 'Nombre del Asesor', type: 'Single line text' },
  { name: 'Correo', type: 'Email' },
  { name: 'Telefono', type: 'Phone number' },
  { name: 'Activo', type: 'Checkbox' },
  { name: 'PIN_Hash', type: 'Single line text' },
  { name: 'ID_Vendedor', type: 'Single line text' }
];

// ── Netlify handler ───────────────────────────────────────────────────
const ROLE_REQUIRED = {
  fetchLeads: ['admin', 'vendedor'],
  updateLeadStatus: ['admin', 'vendedor'],
  listVendedores: ['admin'],
  addVendedor: ['admin'],
  updateVendedor: ['admin'],
  resetPinVendedor: ['admin'],
  ensureLeadsSchema: ['admin'],
  ensureVehiculosSchema: ['admin'],
  ensureAsesoresSchema: ['admin']
};
const LOGIN_OPS = new Set(['loginAdmin', 'validateVendedor']);
const KNOWN_OPS = new Set([
  'saveLead', 'fetchVehiculos', 'fetchAsesores', 'fetchLeads', 'updateLeadStatus',
  'findMisProformas', 'loginAdmin', 'validateVendedor', 'listVendedores',
  'addVendedor', 'updateVendedor', 'resetPinVendedor', 'ensureLeadsSchema',
  'ensureVehiculosSchema', 'ensureAsesoresSchema'
]);

export async function handler(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) };
  }
  if (event.httpMethod !== 'POST') {
    return reply(event, 405, { success: false, error: 'Method not allowed', code: 'METHOD' });
  }
  if (!originAllowed(event)) {
    return reply(event, 403, { success: false, error: 'Origin no autorizado.', code: 'ORIGIN_DENIED' });
  }

  const envCheck = validateEnv();
  if (!envCheck.ok) {
    return reply(event, 400, {
      success: false, error: 'Server misconfigured: missing ' + envCheck.missing.join(', '), code: 'ENV_MISSING'
    });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return reply(event, 400, { success: false, error: 'Invalid JSON body', code: 'BAD_JSON' }); }

  const operation = cleanStr(body.operation, 60);
  if (!KNOWN_OPS.has(operation)) {
    return reply(event, 400, { success: false, error: 'Unknown operation', code: 'UNKNOWN_OP' });
  }

  const ip = clientIp(event, context);
  const limCfg = limitFor(operation);
  const lim = hitBucket(ip + '|' + limCfg.key, limCfg.max, limCfg.windowMs, limCfg.blockMs);
  if (!lim.ok) {
    return reply(event, 429, {
      success: false, error: 'Demasiadas solicitudes. Intenta de nuevo en ' + lim.retryAfter + ' segundos.',
      code: 'RATE_LIMIT'
    });
  }

  let session = null;
  if (ROLE_REQUIRED[operation]) {
    const auth = requireAuth(event, ROLE_REQUIRED[operation]);
    if (auth.error) return auth.error;
    session = auth.session;
  }

  console.log('[airtable-proxy] Operation: ' + operation);
  try {
    let result;
    switch (operation) {
      case 'loginAdmin':               result = await handleLoginAdmin(body, event); break;
      case 'validateVendedor':         result = await handleValidateVendedor(body, event); break;
      case 'saveLead':                 result = await handleSaveLead(body, event); break;
      case 'findMisProformas':         result = await handleFindMisProformas(body, event); break;
      case 'fetchVehiculos':           result = await handleFetchVehiculos(event); break;
      case 'fetchAsesores':            result = await handleFetchAsesores(event); break;
      case 'fetchLeads':               result = await handleFetchLeads(body, event, session); break;
      case 'updateLeadStatus':         result = await handleUpdateLeadStatus(body, event, session); break;
      case 'listVendedores':           result = await handleListVendedores(event); break;
      case 'addVendedor':              result = await handleAddVendedor(body, event); break;
      case 'updateVendedor':           result = await handleUpdateVendedor(body, event); break;
      case 'resetPinVendedor':         result = await handleResetPinVendedor(body, event); break;
      case 'ensureLeadsSchema':        result = await handleEnsureLeadsSchema(event); break;
      case 'ensureVehiculosSchema':    result = await handleEnsureVehiculosSchema(event); break;
      case 'ensureAsesoresSchema':     result = await handleEnsureAsesoresSchema(event); break;
      default: return reply(event, 400, { success: false, error: 'Unknown operation', code: 'UNKNOWN_OP' });
    }
    if (LOGIN_OPS.has(operation) && result && result.statusCode === 200) {
      clearBucket(ip + '|' + limCfg.key);
    }
    return result;
  } catch (err) {
    console.error('[airtable-proxy] CRASH in ' + operation + ':', err.message);
    return reply(event, 500, { success: false, error: 'Internal server error', code: 'UNCAUGHT' });
  }
}

// ── Airtable helpers ──────────────────────────────────────────────────
async function atFetch(method, path, bodyData) {
  const url = 'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/' + path;
  const options = {
    method: method || 'GET',
    headers: { 'Authorization': 'Bearer ' + AIRTABLE_API_KEY, 'Content-Type': 'application/json' }
  };
  if (bodyData) options.body = typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData);
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    console.warn('[airtable-proxy] Airtable ' + method + ' -> ' + res.status);
    const err = new Error(data?.error?.message || 'Airtable error ' + res.status);
    err.status = res.status;
    err.airtableError = data?.error;
    err.data = data;
    throw err;
  }
  return data;
}
async function atGet(path) { return atFetch('GET', path); }
async function atPost(path, body) { return atFetch('POST', path, body); }
async function atPatch(path, body) { return atFetch('PATCH', path, body); }

// ── Authentication (server-side) ──────────────────────────────────────
async function handleLoginAdmin(body, event) {
  const email = cleanStr(body.email, 160).toLowerCase();
  const pass = String(body.pass == null ? '' : body.pass).slice(0, 200);
  if (!email || !pass) return reply(event, 400, { success: false, error: 'Correo y contraseña requeridos.' });
  const expected = ADMIN_HASHES[email];
  const ok = !!expected && hashEquals(hashAdminPassword(pass), expected);
  if (!ok) {
    console.warn('[airtable-proxy] loginAdmin: fallo para ' + email);
    return reply(event, 401, { success: false, error: 'Credenciales inválidas.', code: 'BAD_CREDENTIALS' });
  }
  console.log('[airtable-proxy] Admin session issued for ' + email);
  return reply(event, 200, {
    success: true, token: signSession({ role: 'admin', sub: email, nombre: email }),
    user: email, role: 'admin'
  });
}

async function handleValidateVendedor(body, event) {
  const email = cleanStr(body.email, 160).toLowerCase();
  const pin = String(body.pin == null ? '' : body.pin).slice(0, 100);
  if (!email || !pin || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply(event, 400, { success: false, error: 'Email y PIN requeridos.' });
  }
  const formula = 'AND(' + searchFormula(email, '{Correo}') + ",{Activo}=1)";
  const data = await atGet('Asesores?filterByFormula=' + encodeURIComponent(formula));
  const records = data?.records || [];
  if (!records.length) {
    console.warn('[airtable-proxy] validateVendedor: sin vendedor activo para ' + email);
    return reply(event, 401, { success: false, error: 'Credenciales inválidas o cuenta inactiva.', code: 'BAD_CREDENTIALS' });
  }
  const v = records[0].fields || {};
  if (!hashEquals(hashPin(pin), v.PIN_Hash || '')) {
    console.warn('[airtable-proxy] validateVendedor: PIN invalido para ' + email);
    return reply(event, 401, { success: false, error: 'Credenciales inválidas.', code: 'BAD_CREDENTIALS' });
  }
  const nombre = cleanStr(v['Nombre del Asesor'], 120);
  console.log('[airtable-proxy] Vendedor session issued: ' + email);
  return reply(event, 200, {
    success: true,
    token: signSession({ role: 'vendedor', sub: email, nombre: nombre, id: records[0].id }),
    role: 'vendedor',
    vendedor: { id: records[0].id, nombre: nombre, email: cleanStr(v.Correo, 160), idVendedor: cleanStr(v.ID_Vendedor, 80) }
  });
}

// ── Public operations (needed by the simulator) ───────────────────────
async function handleSaveLead(body, event) {
  const raw = body.fields;
  if (!raw || typeof raw !== 'object') {
    return reply(event, 400, { success: false, error: 'Missing fields' });
  }
  const fields = {
    Cliente: cleanStr(raw.Cliente, 120),
    Cedula: cleanStr(raw.Cedula, 40),
    'Telefono Cliente': cleanStr(raw['Telefono Cliente'], 40),
    'Correo Cliente': cleanStr(raw['Correo Cliente'], 160).toLowerCase(),
    Direccion: cleanStr(raw.Direccion, 200),
    'Vehiculo Interesado': cleanStr(raw['Vehiculo Interesado'], 120),
    Color: cleanStr(raw.Color, 60),
    'Asesor Asignado': cleanStr(raw['Asesor Asignado'], 120),
    'Plan Elegido': cleanStr(raw['Plan Elegido'], 200),
    Fecha: cleanStr(raw.Fecha, 40)
  };
  if (fields.Cliente.length < 2) return reply(event, 400, { success: false, error: 'Nombre del cliente inválido.' });
  if ((fields.Cedula.match(/\d/g) || []).length < 6) return reply(event, 400, { success: false, error: 'Cédula inválida.' });
  if ((fields['Telefono Cliente'].match(/\d/g) || []).length < 7) return reply(event, 400, { success: false, error: 'Teléfono inválido.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields['Correo Cliente'])) return reply(event, 400, { success: false, error: 'Correo electrónico inválido.' });
  const inicial = safeNum(raw['Monto Inicial'], 1e9);
  const cuota = safeNum(raw['Cuota Mensual'], 1e9);
  if (inicial === null || cuota === null) return reply(event, 400, { success: false, error: 'Montos inválidos.' });
  fields['Monto Inicial'] = inicial;
  fields['Cuota Mensual'] = cuota;
  fields.Estatus = VALID_STATUSES.indexOf(cleanStr(raw.Estatus, 40)) >= 0 ? cleanStr(raw.Estatus, 40) : 'Nuevo';

  try {
    const data = await atPost('Leads', { fields, typecast: true });
    console.log('[airtable-proxy] Lead saved: ' + (data?.id || 'unknown'));
    return reply(event, 200, { success: true, data });
  } catch (err) {
    if (err.airtableError?.type === 'UNKNOWN_FIELD_NAME') {
      const slimFields = Object.assign({}, fields);
      for (const k of Object.keys(slimFields)) if (LEADS_OPTIONAL_FIELDS.has(k)) delete slimFields[k];
      try {
        const data = await atPost('Leads', { fields: slimFields, typecast: true });
        console.log('[airtable-proxy] Lead saved (slim): ' + (data?.id || 'unknown'));
        return reply(event, 200, { success: true, data });
      } catch (err2) {
        console.error('[airtable-proxy] Save after schema fix failed:', err2.message);
        return reply(event, 400, {
          success: false, error: 'UNKNOWN_FIELD_NAME',
          message: 'La tabla Leads no tiene los campos requeridos.'
        });
      }
    }
    console.error('[airtable-proxy] saveLead error:', err.message);
    return reply(event, 400, {
      success: false, error: err.airtableError?.type || 'AIRTABLE_ERROR', message: err.message
    });
  }
}

// Public, minimal disclosure: the simulator asks for ITS OWN proformas by
// cédula/nombre. The server filters in Airtable instead of shipping the last
// 100 leads (with PII) to every visitor.
async function handleFindMisProformas(body, event) {
  const q = normSearch(cleanStr(body.q, 100));
  if (q.length < 3) return reply(event, 200, { success: true, data: { records: [] } });
  const needle = escapeFormula(q);
  const fieldExprs = [normalizeAirtableField('{Cedula}'), normalizeAirtableField('{Cliente}')];
  const formula = 'OR(' + fieldExprs.map(function(expr) {
    return "SEARCH('" + needle + "', " + expr + ")";
  }).join(',') + ')';
  const fields = [
    'Cliente', 'Cedula', 'Telefono Cliente', 'Correo Cliente', 'Direccion',
    'Vehiculo Interesado', 'Color', 'Asesor Asignado', 'Plan Elegido',
    'Monto Inicial', 'Cuota Mensual', 'Fecha'
  ].map(function(f) { return 'fields%5B%5D=' + encodeURIComponent(f); }).join('&');
  const path = 'Leads?pageSize=50&' + fields + '&filterByFormula=' + encodeURIComponent(formula);
  const data = await atGet(path);
  return reply(event, 200, { success: true, data });
}

async function handleFetchVehiculos(event) {
  const data = await atGet('Vehiculos?pageSize=100');
  return reply(event, 200, { success: true, data });
}
async function handleFetchAsesores(event) {
  const data = await atGet('Asesores?pageSize=100');
  return reply(event, 200, { success: true, data });
}

// ── Authenticated, read-only lead access ──────────────────────────────
async function handleFetchLeads(body, event, session) {
  let asesor = '';
  if (session.role === 'vendedor') {
    // The client cannot choose which seller's leads it sees.
    asesor = session.nombre;
  } else if (typeof body.asesor === 'string') {
    asesor = cleanStr(body.asesor, 120);
  }
  const url = 'Leads?pageSize=100&sort%5B0%5D%5Bfield%5D=Fecha&sort%5B0%5D%5Bdirection%5D=desc' +
    (asesor ? '&filterByFormula=' + encodeURIComponent(searchFormula(asesor, '{Asesor Asignado}')) : '');
  const data = await atGet(url);
  let records = data?.records || [];
  if (session.role === 'vendedor') {
    records = records.filter(function(r) {
      return String(r.fields?.['Asesor Asignado'] || '') === asesor;
    });
  }
  return reply(event, 200, { success: true, data: Object.assign({}, data, { records }) });
}

async function handleUpdateLeadStatus(body, event, session) {
  const leadId = cleanStr(body.leadId, 30);
  const estatus = cleanStr(body.estatus, 40);
  if (!/^rec[A-Za-z0-9]{8,}$/.test(leadId) || VALID_STATUSES.indexOf(estatus) === -1) {
    return reply(event, 400, { success: false, error: 'Missing or invalid leadId/estatus' });
  }
  if (session.role === 'vendedor') {
    const own = await atGet('Leads/' + encodeURIComponent(leadId) + '?fields=' + encodeURIComponent('Asesor Asignado'));
    if (String(own?.fields?.['Asesor Asignado'] || '') !== session.nombre) {
      return reply(event, 403, { success: false, error: 'Este lead no te pertenece.' });
    }
  }
  const data = await atPatch('Leads/' + leadId, { fields: { Estatus: estatus } });
  console.log('[airtable-proxy] Lead status updated: ' + leadId);
  return reply(event, 200, { success: true, data });
}

// ── Seller management (admin only) ────────────────────────────────────
async function handleListVendedores(event) {
  const data = await atGet('Asesores?pageSize=100&sort%5B0%5D%5Bfield%5D=Nombre%20del%20Asesor&sort%5B0%5D%5Bdirection%5D=asc');
  const vendedores = (data?.records || []).map(function(r) {
    return {
      id: r.id,
      nombre: cleanStr(r.fields?.['Nombre del Asesor'], 120),
      email: cleanStr(r.fields?.Correo, 160),
      activo: r.fields?.Activo === true,
      idVendedor: cleanStr(r.fields?.ID_Vendedor, 80),
      tienePin: !!(r.fields?.PIN_Hash)
    };
  });
  return reply(event, 200, { success: true, vendedores });
}
async function handleAddVendedor(body, event) {
  const nombre = cleanStr(body.nombre, 120);
  const email = cleanStr(body.email, 160).toLowerCase();
  const pin = String(body.pin == null ? '' : body.pin).slice(0, 100);
  if (!nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply(event, 400, { success: false, error: 'Nombre y email válidos requeridos.' });
  }
  const fields = {
    'Nombre del Asesor': nombre, Correo: email,
    Activo: body.activo !== false, ID_Vendedor: cleanStr(body.idVendedor, 80) || nombre
  };
  if (pin) {
    if (pin.length < 4) return reply(event, 400, { success: false, error: 'PIN debe tener al menos 4 caracteres.' });
    fields.PIN_Hash = hashPin(pin);
  }
  const data = await atPost('Asesores', { fields, typecast: true });
  console.log('[airtable-proxy] Vendedor added');
  return reply(event, 200, { success: true, data });
}
async function handleUpdateVendedor(body, event) {
  const recordId = cleanStr(body.recordId, 30);
  const nombre = cleanStr(body.nombre, 120);
  const email = cleanStr(body.email, 160).toLowerCase();
  if (!/^rec[A-Za-z0-9]{8,}$/.test(recordId) || !nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply(event, 400, { success: false, error: 'recordId, nombre y email válidos requeridos.' });
  }
  const fields = { 'Nombre del Asesor': nombre, Correo: email, Activo: body.activo !== false };
  if (body.idVendedor) fields.ID_Vendedor = cleanStr(body.idVendedor, 80);
  const data = await atPatch('Asesores/' + recordId, { fields });
  console.log('[airtable-proxy] Vendedor updated');
  return reply(event, 200, { success: true, data });
}
async function handleResetPinVendedor(body, event) {
  const recordId = cleanStr(body.recordId, 30);
  const newPin = String(body.newPin == null ? '' : body.newPin).slice(0, 100);
  if (!/^rec[A-Za-z0-9]{8,}$/.test(recordId) || newPin.length < 4) {
    return reply(event, 400, { success: false, error: 'recordId y PIN (mínimo 4 caracteres) requeridos.' });
  }
  await atPatch('Asesores/' + recordId, { fields: { PIN_Hash: hashPin(newPin) } });
  console.log('[airtable-proxy] PIN reset');
  return reply(event, 200, { success: true, message: 'PIN actualizado exitosamente' });
}

// ── Schema management (admin only) ────────────────────────────────────
async function metaFetch(method, path, bodyData) {
  const url = 'https://api.airtable.com/v0/meta/bases/' + AIRTABLE_BASE_ID + '/' + path;
  const options = {
    method,
    headers: { 'Authorization': 'Bearer ' + AIRTABLE_API_KEY, 'Content-Type': 'application/json' }
  };
  if (bodyData) options.body = JSON.stringify(bodyData);
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Meta API error ' + res.status);
    err.status = res.status;
    err.airtableError = data?.error;
    throw err;
  }
  return data;
}
async function ensureSchema() {
  const metaData = await metaFetch('GET', 'tables');
  const leadsTable = (metaData.tables || []).find(function(t) { return (t.name || '').toLowerCase() === 'leads'; });
  if (!leadsTable) return;
  const existing = new Set((leadsTable.fields || []).map(function(f) { return f.name; }));
  const missing = LEADS_REQUIRED_FIELDS.filter(function(f) { return !existing.has(f.name); });
  if (!missing.length) return;
  const fieldsToCreate = missing.map(function(f) {
    const field = { name: f.name, type: f.type };
    if (f.options) field.options = f.options;
    return field;
  });
  await metaFetch('PATCH', 'tables/' + leadsTable.id, { fields: fieldsToCreate });
}
async function handleEnsureLeadsSchema(event) {
  try {
    await ensureSchema();
    return reply(event, 200, { success: true, message: 'Schema verified/created' });
  } catch (err) {
    return reply(event, 200, { success: false, error: err.airtableError?.type || 'ERROR', message: err.message });
  }
}
async function handleEnsureVehiculosSchema(event) {
  try {
    const metaData = await metaFetch('GET', 'tables');
    const vTable = (metaData.tables || []).find(function(t) { return t.name === 'Vehiculos'; });
    if (!vTable) return reply(event, 200, { success: false, error: 'Vehiculos table not found' });
    const existing = new Set((vTable.fields || []).map(function(f) { return f.name; }));
    const missing = VEHICULOS_REQUIRED_FIELDS.filter(function(f) { return !existing.has(f.name); });
    if (!missing.length) return reply(event, 200, { success: true, message: 'All vehiculos fields exist' });
    await metaFetch('PATCH', 'tables/' + vTable.id, { fields: missing });
    return reply(event, 200, { success: true, message: 'Created ' + missing.length + ' field(s)' });
  } catch (err) {
    return reply(event, 200, { success: false, error: err.airtableError?.type || 'ERROR', message: err.message });
  }
}
async function handleEnsureAsesoresSchema(event) {
  try {
    const metaData = await metaFetch('GET', 'tables');
    const aTable = (metaData.tables || []).find(function(t) { return t.name === 'Asesores'; });
    if (!aTable) return reply(event, 200, { success: false, error: 'Asesores table not found' });
    const existing = new Set((aTable.fields || []).map(function(f) { return f.name; }));
    const missing = ASESORES_REQUIRED_FIELDS.filter(function(f) { return !existing.has(f.name); });
    if (!missing.length) return reply(event, 200, { success: true, message: 'All asesores fields exist' });
    await metaFetch('PATCH', 'tables/' + aTable.id, { fields: missing });
    return reply(event, 200, { success: true, message: 'Created ' + missing.length + ' field(s)' });
  } catch (err) {
    return reply(event, 200, { success: false, error: err.airtableError?.type || 'ERROR', message: err.message });
  }
}
