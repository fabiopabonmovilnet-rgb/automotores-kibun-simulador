# 🚗 Simulador de Crédito Hyundai — Automotores Kibun Mérida

App web que genera proformas en PDF para vehículos Hyundai, conectada a Airtable.

## 🌐 Probar la app (usuario)

Abre: **https://fabiopabonmovilnet-rgb.github.io/automotores-kibun-simulador/hyundai_proforma.html**

1. Aparece un banner pidiendo el **Personal Access Token de Airtable**
2. Pégalo (debe empezar con `pat...`)
3. Click "Guardar y cargar"
4. El token se guarda solo en tu navegador

## 🔧 Configuración local (desarrollador)

```bash
git clone https://github.com/fabiopabonmovilnet-rgb/automotores-kibun-simulador.git
cd automotores-kibun-simulador
copy config.example.js config.js   # Windows
cp config.example.js config.js     # Mac/Linux
```

Edita `config.js` con tus credenciales:

```js
const AIRTABLE_CONFIG = {
  baseId: 'appV6ZTIBbqWbviL0',
  apiKey: 'patXXXXXXXXXXXXXX.XXXX...'
};
```

Sirve localmente (obligatorio, `file://` no carga `config.js`):

```bash
python -m http.server 8000
```

Abre: http://localhost:8000/hyundai_proforma.html

## 📋 Estructura

- `hyundai_proforma.html` — App completa (HTML + CSS + JS en un solo archivo)
- `config.example.js` — Plantilla de credenciales (segura para subir al repo)
- `config.js` — Credenciales reales (en `.gitignore`, no se sube)
- `.github/workflows/pages.yml` — Deploy automático a GitHub Pages
- `.gitignore` — Excluye `config.js`, PDFs generados, etc.

## 🛠 Stack

- HTML + Tailwind CSS (CDN)
- html2pdf.js (genera el PDF)
- Airtable REST API (catálogo, asesores, leads)
- DolarApi Venezuela (tasa BCV)
- GitHub Actions + Pages (deploy)
