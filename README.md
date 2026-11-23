# 🚗 Simulador de Crédito Hyundai — Automotores Kibun Mérida

App web que genera proformas en PDF para vehículos Hyundai, conectada a Airtable
a través de una función serverless (proxy). Las credenciales de Airtable **nunca**
estregan en el navegador.

## 🌐 Probar la app (usuario)

Abre: **https://fabiopabonmovilnet-rgb.github.io/automotores-kibun-simulador/hyundai_proforma.html**

No se pide ningún token. La app consulta el catálogo, los asesores y tus propias
proformas mediante el proxy. Para recuperar una proforma, busca por cédula o
nombre: el filtrado se hace en el servidor, por lo que no se descargan los datos
de otros clientes.

## 🔧 Configuración local (desarrollador)

```bash
git clone https://github.com/fabiopabonmovilnet-rgb/automotores-kibun-simulador.git
cd automotores-kibun-simulador
python -m http.server 8000
```

Abre: http://localhost:8000/hyundai_proforma.html

El archivo `config.js` con credenciales reales ya **no se usa** ni debe crearse.
Si necesitas un entorno local con datos reales, despliega la función
`netlify/functions/airtable-proxy.mjs` con Netlify CLI y define las variables de
entorno en el panel del proveedor (nunca en el repositorio):

| Variable | Descripción |
|---|---|
| `AIRTABLE_API_KEY` | Personal Access Token de Airtable (solo servidor) |
| `AIRTABLE_BASE_ID` | ID de la base de Airtable |
| `SESSION_SECRET` | Secreto largo y aleatorio para firmar sesiones |
| `ADMIN_HASHES_JSON` | Opcional. Mapa email → SHA-256 de la contraseña admin |
| `ALLOWED_ORIGINS` | Opcional. Orígenes autorizados a llamar la API |

## 🔐 Seguridad

- El login del panel administrativo se valida en el servidor; las contraseñas no
  aparecen en HTML/JS. El proxy emite un token firmado con expiración de 8 h.
- `fetchLeads` y las operaciones de vendedores requieren sesión; los vendedores
  solo ven sus propios leads.
- La búsqueda pública usa `findMisProformas`, filtrada en Airtable.
- CORS con lista blanca, límite de intentos y cabeceras de seguridad en el proxy.
- Todo dato que vuelve de Airtable o del formulario se renderiza como texto.

## 📋 Estructura

- `hyundai_proforma.html` — App completa (HTML + CSS + JS en un solo archivo)
- `netlify/functions/airtable-proxy.mjs` — Proxy serverless: credenciales, sesiones,
  permisos, validación y cabeceras
- `config.example.js` — Plantilla histórica sin valores reales (referencia)
- `.github/workflows/pages.yml` — Deploy automático a GitHub Pages
- `.gitignore` — Excluye credenciales, entornos y respaldos

## 🛠 Stack

- HTML + Tailwind CSS (CDN)
- html2pdf.js (genera el PDF)
- Airtable REST API (catálogo, asesores, leads) — solo desde el proxy
- DolarApi Venezuela (tasa BCV)
- GitHub Actions + Pages (deploy del front) + Netlify Functions (API)
