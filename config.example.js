// ===============================================================
//  SERVERLESS PROXY — CREDENCIALES DE AIRTABLE
// ===============================================================
// Las credenciales de Airtable se configuran EXCLUSIVAMENTE
// como variables de entorno en el servidor (Netlify / Vercel):
//
//   AIRTABLE_API_KEY = patXXXXXXXXXXXXXX.XXXX
//   AIRTABLE_BASE_ID = appV6ZTIBbqWbviL0
//
// El cliente llama a /api/airtable-proxy que actúa como
// intermediario seguro. Ninguna credencial queda expuesta
// en el navegador.
//
// Para desarrollo local con Netlify CLI:
//   1. Copia este archivo como config.js
//   2. netlify dev (lee variables de entorno de netlify.toml o .env)
//
// ===============================================================
// (Este archivo ya no contiene credenciales — el .gitignore
//  excluye config.js por compatibilidad con flujos anteriores)
