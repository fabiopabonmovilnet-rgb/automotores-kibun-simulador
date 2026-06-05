# CONTEXTO DEL PROYECTO — Simulador Hyundai Kibun

> **Última actualización:** 5 jun 2026 (noche)
> **Para retomar mañana** — todo lo que necesitas saber

---

## 📋 RESUMEN EJECUTIVO

App web que genera **proformas en PDF** para vehículos Hyundai, conectada a Airtable. Ya está **desplegada y funcionando** en producción. Solo faltan ajustes menores de contenido y arreglar el PDF.

**URL pública para compartir:**
```
https://fabiopabonmovilnet-rgb.github.io/automotores-kibun-simulador/hyundai_proforma.html
```

---

## 🏗️ STACK TÉCNICO

- **Frontend:** HTML + Tailwind CSS (CDN) + JS vanilla (todo en 1 archivo)
- **PDF:** html2pdf.js v0.10.1
- **Backend de datos:** Airtable REST API
- **Tasa BCV:** https://ve.dolarapi.com/v1/dolares/oficial (campo `promedio`)
- **Hosting:** GitHub Pages
- **CI/CD:** GitHub Actions (inyecta token desde Secret)
- **Versionado:** Git + GitHub

---

## 📁 ESTRUCTURA DE ARCHIVOS

```
C:\Users\fabio\Desktop\
├── hyundai_proforma.html        ← App completa (~1.5MB, imágenes en base64)
├── config.js                    ← Credenciales reales (GITIGNORED, NO se sube)
├── config.example.js            ← Plantilla con placeholders (SÍ se sube)
├── .github\
│   └── workflows\pages.yml      ← Deploy automático con inyección de token
├── .gitignore                   ← Excluye config.js, *.pdf, *.tmp, etc.
├── README.md                    ← Documentación
├── CONTEXT.md                   ← Este archivo
└── leads_schema.json            ← Schema local (NO en repo)
```

---

## 🔐 AIRTABLE — Credenciales

| Item | Valor |
|------|-------|
| **Base ID** | `appV6ZTIBbqWbviL0` |
| **Base Name** | Automotores Kibun Mérida |
| **Token** | Guardado en GitHub Secret `AIRTABLE_API_KEY` (se inyecta al deploy) |

### Tablas
- **Vehiculos** (10 registros) — campos: `Name`, `Precio`, `Motor`, `Transmisión`, `Foto`, `Destacado 1`, `Destacado 2`
- **Asesores** (3 registros: Fabio Pabon, Yarley Carmona, Frida Calo) — campos: `Nombre del Asesor`, `Telefono`, `Correo`
- **Leads** — campos exactos para POST:
  - `Cliente`, `Cedula`, `Telefono Cliente`, `Vehiculo Interesado`, `Asesor Asignado`, `Plan Elegido`, `Monto Inicial`, `Cuota Mensual`, `Fecha`

---

## 🌐 URLs Y REPOSITORIO

| Recurso | URL |
|---------|-----|
| **Repo GitHub** | https://github.com/fabiopabonmovilnet-rgb/automotores-kibun-simulador |
| **App en vivo** | https://fabiopabonmovilnet-rgb.github.io/automotores-kibun-simulador/hyundai_proforma.html |
| **Settings Pages** | https://github.com/fabiopabonmovilnet-rgb/automotores-kibun-simulador/settings/pages |
| **Secrets** | https://github.com/fabiopabonmovilnet-rgb/automotores-kibun-simulador/settings/secrets/actions |
| **Workflows** | https://github.com/fabiopabonmovilnet-rgb/automotores-kibun-simulador/actions |

---

## ⚙️ GIT SETUP

```powershell
# Git instalado en: C:\Program Files\Git\cmd\git.exe
# User: Fabio Pabon
# Email: fabiopabon.movilnet@gmail.com
# Branch: main (renombrado desde master)

# Para futuros cambios:
cd "C:\Users\fabio\Desktop"
git add .
git commit -m "descripción"
git push    # dispara el deploy automático a GitHub Pages
```

⚠️ En PowerShell usar la ruta completa: `& "C:\Program Files\Git\cmd\git.exe" ...`

---

## 🎨 DESIGN TOKENS

- **Hyundai Blue:** `#002C5F`
- **Hyundai Light Blue:** `#00AAD2`
- **Logo:** "K | H" badge (K = Kibun, H = Hyundai)
- **Paper size PDF:** Actual = A4. **PENDIENTE cambiar a Carta** (8.5"×11" = 215.9×279.4mm) — el usuario lo pidió

---

## 🐛 PROBLEMAS PENDIENTES

### 1. **PDF — ANCHO DE CONTENIDO** ⚠️ PRIORIDAD
- **Síntoma:** El PDF se ve solo en la mitad izquierda (~9.5cm de 21cm)
- **Causa:** El `rowStyle` con `display:flex` no expande al ancho completo en `html2pdf`
- **Estado actual (working):** Wrapper con `padding: 0 0 0 47.5mm` (centrado manual)
- **Lo que dijo el usuario:** "hay algo en las plantillas que no te deja gestionar el espacio" — quiere otro enfoque
- **opt_pdf actual:**
  ```js
  {
    margin: 0,
    image: { jpeg, 0.98 },
    html2canvas: { scale:2, useCORS, letterRendering, windowWidth:794, windowHeight:1123, scrollX:0, scrollY:0 },
    jsPDF: { unit:'mm', format:'a4', orientation:'portrait' }
  }
  ```
- **CSS actual del template:** `width: 210mm; min-height: 297mm; padding: 10mm; margin: 0 auto`
- **Próximo paso:** probar otro enfoque (quizás usar `jspdf` + `autoTable` directo, o cambiar a `format: 'letter'`)

### 2. **Datos de contacto** (PLACEHOLDERS, hay que actualizar)
- 📍 Dirección: `Av. Las Américas, Mérida, Venezuela` ← confirmar
- 📞 Teléfono: `(0274) 712.34.56` ← confirmar
- ✉ Email: `ventas@automotoreskibun.com` ← confirmar
- RIF: `J-12345678-9` ← placeholder, cambiar
- Horario: `L-V 8:00am - 5:00pm · Sáb 9:00am - 1:00pm` ← confirmar

### 3. **Otros cambios menores** (mencionados por el usuario)
- Revisar textos, ortografía, formato
- Ajustes visuales varios

---

## 🔄 FLUJO DE DEPLOY (cómo funciona)

1. **Tú editas** un archivo localmente (ej. `hyundai_proforma.html`)
2. **Yo modifico** el archivo
3. **Yo ejecuto:**
   ```powershell
   git add .
   git commit -m "mensaje"
   git push
   ```
4. **GitHub Actions** se dispara automáticamente (workflow en `.github/workflows/pages.yml`)
5. **Inyecta el token** desde el Secret `AIRTABLE_API_KEY` en `config.js`
6. **Deploya a GitHub Pages** (1-2 minutos)
7. **Refrescas la URL** y ves los cambios

---

## 📝 NOTAS TÉCNICAS

### Banner de token
- Solo aparece si NO detecta `AIRTABLE_API_KEY` (de `config.js` o `localStorage`)
- En deploy normal está oculto porque el Secret inyecta el token
- Si un visitante entra en incógnito, le aparece el banner (puede pegar su propio token)

### Estructura de la app
- **Step 1:** Catálogo (10 vehículos con imagen, precio, specs)
- **Step 2:** Financiamiento (4 planes: Provincial, CTZ, Pivca, Amortización V13)
- **Step 3:** Proforma (form + asesor + generación PDF)
- **Después:** Botón "Nueva Cotización" → vuelve al catálogo

### Planes de financiamiento
- 🏦 Banco Provincial (mín 30% inicial)
- 📊 CTZ
- 🤝 Pivca
- 📑 Amortización V13

### Imágenes de vehículos
- 10 imágenes embebidas como base64 en `hyundai_proforma.html`
- Source: `C:\Users\fabio\OneDrive\Desktop\Hyundai\Imagenes\`
- Tucson keys: `"Tucson 2.0L A/T Limited"` y `"Tucson 2.0L A/T Premium"` (match con `f.Name` de Airtable)

---

## ✅ LO QUE YA FUNCIONA

- [x] Repo en GitHub (público, sin secrets en código)
- [x] Deploy automático a GitHub Pages
- [x] Token auto-inyectado desde Secret
- [x] Banner de token solo aparece si falta
- [x] Catálogo carga desde Airtable
- [x] Asesores cargan desde Airtable (3 asesores)
- [x] Flujo completo: catálogo → financiamiento → proforma → PDF
- [x] Registro de leads en Airtable
- [x] Tasa BCV en tiempo real
- [x] Responsive (funciona en móvil y desktop)
- [x] Imágenes embebidas (no requiere servidor de imágenes)
- [x] Sin login requerido para visitantes
- [x] El visitante no ve el código

---

## 🎯 PENDIENTE PARA MAÑANA

### Sesión 1 — Ajustes de contenido
- [ ] Actualizar dirección real de la concesionaria
- [ ] Actualizar teléfonos reales
- [ ] Actualizar email
- [ ] Actualizar RIF real
- [ ] Actualizar horario
- [ ] Otros textos que el usuario indique

### Sesión 2 — PDF
- [ ] Investigar otro enfoque para el ancho del PDF
- [ ] Posiblemente cambiar de `html2pdf` a `jsPDF` + `autoTable`
- [ ] Cambiar a tamaño carta (`format: 'letter'`)
- [ ] Verificar centrado y márgenes

### Sesión 3 — Deploy y pruebas
- [ ] Push de cambios
- [ ] Verificar en URL
- [ ] Probar en móvil

---

## 🆘 COMANDOS ÚTILES

```powershell
# Ver estado de git
& "C:\Program Files\Git\cmd\git.exe" status

# Ver últimos commits
& "C:\Program Files\Git\cmd\git.exe" log --oneline -10

# Forzar re-trigger del deploy (sin cambios)
& "C:\Program Files\Git\cmd\git.exe" commit --allow-empty -m "Re-trigger deploy"
& "C:\Program Files\Git\cmd\git.exe" push

# Ver el config.js deployado (verificar token)
curl.exe -s "https://fabiopabonmovilnet-rgb.github.io/automotores-kibun-simulador/config.js"
```

---

## 📞 RECORDATORIOS

- El usuario está en **Mérida, Venezuela**
- Trabaja en **Automotores Kibun** (concesionario Hyundai)
- Estilo de comunicación: directo, venezolano, "oe", "porfa", casual
- Nivel técnico: entiende lo básico, no maneja Git/PowerShell fluido
- Frustración previa: "oe haslo de verdad no entiendo porque no sirve en git"
- Tono preferido: respuestas cortas, sin floritura, ir al grano
