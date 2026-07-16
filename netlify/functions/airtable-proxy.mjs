// Serverless function: Airtable API Proxy
// Deploy as Netlify Function or Vercel API Route
//
// Netlify: place in netlify/functions/airtable-proxy.mjs
// Vercel:  place in api/airtable-proxy.mjs and export default async function handler(req, res) {...}
//
// Set env vars in your hosting dashboard:
//   AIRTABLE_API_KEY = patXXXXXXXXXXXXXX.XXXX
//   AIRTABLE_BASE_ID = appV6ZTIBbqWbviL0

import { createHash } from 'crypto';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

// ── Env validation ─────────────────────────────────────────────────
function validateEnv() {
  const missing = [];
  if (!AIRTABLE_API_KEY) missing.push('AIRTABLE_API_KEY');
  if (!AIRTABLE_BASE_ID) missing.push('AIRTABLE_BASE_ID');
  if (missing.length) {
    console.error('[airtable-proxy] CRITICAL: Missing env vars: ' + missing.join(', '));
    return { ok: false, missing };
  }
  console.log('[airtable-proxy] Env OK: AIRTABLE_BASE_ID=' + AIRTABLE_BASE_ID + ', AIRTABLE_API_KEY length=' + (AIRTABLE_API_KEY || '').length);
  return { ok: true };
}

// ── Schema ─────────────────────────────────────────────────────────
const LEADS_REQUIRED_FIELDS = [
  { name: 'Cliente',             type: 'Single line text' },
  { name: 'Cedula',              type: 'Single line text' },
  { name: 'Telefono Cliente',    type: 'Phone number' },
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

// same set without Color/Estatus — used as fallback if schema creation fails
const LEADS_OPTIONAL_FIELDS = new Set(['Color', 'Estatus']);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// ── Netlify handler ──────────────────────────────────────────────────
export async function handler(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  const envCheck = validateEnv();
  if (!envCheck.ok) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({
      success: false, error: 'Server misconfigured: missing ' + envCheck.missing.join(', '),
      code: 'ENV_MISSING'
    })};
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Invalid JSON body' }) }; }

  const { operation } = body;
  if (!operation) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Missing operation' }) };

  console.log('[airtable-proxy] Operation: ' + operation);

  try {
    switch (operation) {
      case 'saveLead':          return await handleSaveLead(body);
      case 'fetchVehiculos':    return await handleFetchVehiculos();
      case 'fetchAsesores':     return await handleFetchAsesores();
      case 'fetchLeads':        return await handleFetchLeads(body);
      case 'updateLeadStatus':  return await handleUpdateLeadStatus(body);
      case 'ensureLeadsSchema':  return await handleEnsureLeadsSchema();
      case 'ensureVehiculosSchema': return await handleEnsureVehiculosSchema();
      case 'validateVendedor':   return await handleValidateVendedor(body);
      case 'listVendedores':    return await handleListVendedores();
      case 'addVendedor':       return await handleAddVendedor(body);
      case 'updateVendedor':    return await handleUpdateVendedor(body);
      case 'resetPinVendedor':  return await handleResetPinVendedor(body);
      default: return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Unknown operation: ' + operation }) };
    }
  } catch (err) {
    console.error('[airtable-proxy] CRASH in ' + operation + ':', err.message);
    console.error('[airtable-proxy] Stack:', err.stack);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({
      success: false, error: 'Internal server error: ' + err.message,
      code: 'UNCAUGHT'
    })};
  }
}

// ── Airtable helpers ─────────────────────────────────────────────────
async function atFetch(method, path, bodyData) {
  const url = 'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/' + path;
  const options = {
    method: method || 'GET',
    headers: {
      'Authorization': 'Bearer ' + AIRTABLE_API_KEY,
      'Content-Type': 'application/json'
    }
  };
  if (bodyData) options.body = typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData);
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    console.warn('[airtable-proxy] Airtable ' + method + ' ' + path + ' -> ' + res.status + ': ' + JSON.stringify(data?.error));
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
async function atDelete(path) { return atFetch('DELETE', path); }

function hashPin(pin) {
  return createHash('sha256').update(String(pin)).digest('hex');
}

// ── Lead operations ─────────────────────────────────────────────────
async function handleSaveLead(body) {
  const fields = body.fields;
  if (!fields) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Missing fields' }) };
  }
  if (!fields.Estatus) fields.Estatus = 'Nuevo';
  try {
    const data = await atPost('Leads', { fields, typecast: true });
    console.log('[airtable-proxy] Lead saved: ' + (data?.id || 'unknown'));
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, data }) };
  } catch (err) {
        if (err.airtableError?.type === 'UNKNOWN_FIELD_NAME') {
          console.warn('[airtable-proxy] UNKNOWN_FIELD_NAME on saveLead – attempting schema fix');
          try { await ensureSchema(); } catch (e) { console.warn('[airtable-proxy] Schema fix failed:', e.message); }
          // strip optional fields (Color, Estatus) in case the table lacks them
          const slimFields = Object.assign({}, fields);
          for (const k of Object.keys(slimFields)) {
            if (LEADS_OPTIONAL_FIELDS.has(k)) delete slimFields[k];
          }
          try {
            const data = await atPost('Leads', { fields: slimFields, typecast: true });
            console.log('[airtable-proxy] Lead saved after schema fix (slim): ' + (data?.id || 'unknown'));
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, data }) };
          } catch (err2) {
            console.error('[airtable-proxy] Save still failed after schema fix:', err2.message);
            return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({
              success: false, error: 'UNKNOWN_FIELD_NAME',
              message: 'La tabla Leads no tiene los campos requeridos. El servidor intentó crearlos automáticamente pero falló. Verifica la tabla Leads en Airtable.',
              details: err2.airtableError
            })};
          }
        }
    console.error('[airtable-proxy] saveLead error:', err.message);
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({
      success: false, error: err.airtableError?.type || 'AIRTABLE_ERROR',
      message: err.message, details: err.airtableError
    })};
  }
}

async function handleFetchVehiculos() {
  const data = await atGet('Vehiculos?pageSize=100');
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, data }) };
}

async function handleFetchAsesores() {
  const data = await atGet('Asesores?pageSize=100');
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, data }) };
}

async function handleFetchLeads(body) {
  const asesor = body?.asesor;
  let url = 'Leads?pageSize=100&sort%5B0%5D%5Bfield%5D=Fecha&sort%5B0%5D%5Bdirection%5D=desc';
  if (asesor) {
    url += '&filterByFormula=' + encodeURIComponent("SEARCH('" + asesor.replace(/'/g, "\\'") + "', {Asesor Asignado})");
  }
  const data = await atGet(url);
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, data }) };
}

async function handleUpdateLeadStatus(body) {
  const { leadId, estatus } = body;
  if (!leadId || !estatus) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Missing leadId or estatus' }) };
  }
  const VALID_STATUSES = ['Nuevo', 'Contactado', 'En seguimiento', 'Cerrado', 'Cancelado'];
  if (!VALID_STATUSES.includes(estatus)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Invalid status. Valid: ' + VALID_STATUSES.join(', ') }) };
  }
  const data = await atPatch('Leads/' + leadId, { fields: { Estatus: estatus } });
  console.log('[airtable-proxy] Lead ' + leadId + ' status -> ' + estatus);
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, data }) };
}

// ── Vendedor operations ──────────────────────────────────────────────
async function handleValidateVendedor(body) {
  const { email, pin } = body;
  if (!email || !pin) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Email and pin required' }) };
  }
  const data = await atGet('Asesores?filterByFormula=' + encodeURIComponent("AND({Correo}='" + email.replace(/'/g, "\\'") + "',{Activo}=1)"));
  const records = data?.records || [];
  if (records.length === 0) {
    console.warn('[airtable-proxy] validateVendedor: No active vendedor found for email=' + email);
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Credenciales inválidas o cuenta inactiva.' }) };
  }
  const v = records[0].fields || {};
  const storedHash = v.PIN_Hash || '';
  const inputHash = hashPin(pin);
  if (storedHash !== inputHash) {
    console.warn('[airtable-proxy] validateVendedor: PIN mismatch for ' + email);
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Credenciales inválidas.' }) };
  }
  console.log('[airtable-proxy] Vendedor validated: ' + email + ' -> ' + (v['Nombre del Asesor'] || ''));
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({
    success: true,
    vendedor: {
      id: records[0].id,
      nombre: v['Nombre del Asesor'] || '',
      email: v.Correo || '',
      idVendedor: v.ID_Vendedor || ''
    }
  })};
}

async function handleListVendedores() {
  const data = await atGet('Asesores?pageSize=100&sort%5B0%5D%5Bfield%5D=Nombre%20del%20Asesor&sort%5B0%5D%5Bdirection%5D=asc');
  const vendedores = (data?.records || []).map(function(r) {
    return {
      id: r.id,
      nombre: r.fields?.['Nombre del Asesor'] || '',
      email: r.fields?.Correo || '',
      activo: r.fields?.Activo === true,
      idVendedor: r.fields?.ID_Vendedor || '',
      tienePin: !!(r.fields?.PIN_Hash)
    };
  });
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, vendedores }) };
}

async function handleAddVendedor(body) {
  const { nombre, email, pin, activo, idVendedor } = body;
  if (!nombre || !email) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Nombre and email required' }) };
  }
  const fields = {
    'Nombre del Asesor': nombre,
    Correo: email,
    Activo: activo !== false,
    ID_Vendedor: idVendedor || nombre
  };
  if (pin) fields.PIN_Hash = hashPin(pin);
  const data = await atPost('Asesores', { fields, typecast: true });
  console.log('[airtable-proxy] Vendedor added: ' + nombre + ' (' + email + ')');
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, data }) };
}

async function handleUpdateVendedor(body) {
  const { recordId, nombre, email, activo, idVendedor } = body;
  if (!recordId || !nombre || !email) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'recordId, nombre and email required' }) };
  }
  const fields = { 'Nombre del Asesor': nombre, Correo: email, Activo: activo !== false };
  if (idVendedor) fields.ID_Vendedor = idVendedor;
  const data = await atPatch('Asesores/' + recordId, { fields });
  console.log('[airtable-proxy] Vendedor updated: ' + recordId);
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, data }) };
}

async function handleResetPinVendedor(body) {
  const { recordId, newPin } = body;
  if (!recordId || !newPin) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'recordId and newPin required' }) };
  }
  if (String(newPin).length < 4) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'PIN must be at least 4 characters' }) };
  }
  const data = await atPatch('Asesores/' + recordId, { fields: { PIN_Hash: hashPin(newPin) } });
  console.log('[airtable-proxy] PIN reset for vendedor: ' + recordId);
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, message: 'PIN actualizado exitosamente' }) };
}

// ── Schema management (uses direct fetch for Meta API) ────────────────
async function metaFetch(method, path, bodyData) {
  const url = 'https://api.airtable.com/v0/meta/bases/' + AIRTABLE_BASE_ID + '/' + path;
  const options = {
    method: method,
    headers: {
      'Authorization': 'Bearer ' + AIRTABLE_API_KEY,
      'Content-Type': 'application/json'
    }
  };
  if (bodyData) options.body = JSON.stringify(bodyData);
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Meta API error ' + res.status);
    err.status = res.status;
    err.airtableError = data?.error;
    err.data = data;
    throw err;
  }
  return data;
}

async function ensureSchema() {
  const metaData = await metaFetch('GET', 'tables');
  const leadsTable = (metaData.tables || []).find(function(t) {
    return (t.name || '').toLowerCase() === 'leads';
  });
  if (!leadsTable) {
    console.warn('[airtable-proxy] Table "Leads" not found in base');
    return;
  }
  const existing = new Set((leadsTable.fields || []).map(function(f) { return f.name; }));
  const missing = LEADS_REQUIRED_FIELDS.filter(function(f) { return !existing.has(f.name); });
  if (missing.length === 0) {
    console.info('[airtable-proxy] Leads schema OK');
    return;
  }
  console.info('[airtable-proxy] Creating missing fields:', missing.map(function(m) { return m.name; }).join(', '));
  const fieldsToCreate = missing.map(function(f) {
    const field = { name: f.name, type: f.type };
    if (f.options) field.options = f.options;
    return field;
  });
  await metaFetch('PATCH', 'tables/' + leadsTable.id, { fields: fieldsToCreate });
  console.info('[airtable-proxy] Created ' + missing.length + ' field(s)');
}

async function handleEnsureLeadsSchema() {
  try {
    await ensureSchema();
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, message: 'Schema verified/created' }) };
  } catch (err) {
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: err.airtableError?.type || 'ERROR', message: err.message }) };
  }
}

const COLOR_IMAGE_FIELDS = [
  { name: 'Imagen_Blanco', type: 'singleLineText' },
  { name: 'Imagen_Negro',  type: 'singleLineText' },
  { name: 'Imagen_Plata',  type: 'singleLineText' },
  { name: 'Imagen_Azul',   type: 'singleLineText' },
  { name: 'Imagen_Rojo',   type: 'singleLineText' }
];

async function handleEnsureVehiculosSchema() {
  try {
    const metaData = await metaFetch('GET', 'tables');
    const vTable = (metaData.tables || []).find(function(t) { return t.name === 'Vehiculos'; });
    if (!vTable) return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: 'Vehiculos table not found' }) };
    const existing = new Set((vTable.fields || []).map(function(f) { return f.name; }));
    const missing = COLOR_IMAGE_FIELDS.filter(function(f) { return !existing.has(f.name); });
    if (missing.length === 0) return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, message: 'All color image fields exist' }) };
    await metaFetch('PATCH', 'tables/' + vTable.id, { fields: missing });
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, message: 'Created ' + missing.length + ' field(s): ' + missing.map(function(m) { return m.name; }).join(', ') }) };
  } catch (err) {
    console.error('[airtable-proxy] ensureVehiculosSchema error:', err.message);
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: false, error: err.airtableError?.type || 'ERROR', message: err.message }) };
  }
}


