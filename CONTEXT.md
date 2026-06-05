# CONTEXTO DEL PROYECTO — Simulador Hyundai Kibun

> **Última actualización:** 5 jun 2026 (noche) — cierre de sesión con fix de imágenes en vivo
> **Para retomar mañana** — todo lo que necesitas saber

---

## 📋 RESUMEN EJECUTIVO

App web que genera **proformas en PDF** para vehículos Hyundai, conectada a Airtable. Ya está **desplegada y funcionando** en producción. La lógica de precios, impuestos y categorías es **100% local** (no depende de Airtable para funcionar). Solo falta terminar de afinar el PDF y revisar textos/contacto.

**URL pública para compartir:**
```
https://fabiopabonmovilnet-rgb.github.io/automotores-kibun-simulador/hyundai_proforma.html
```

**Último commit:** `8652df1` (fix imagen Airtable sobre base64)

---

## 🏗️ STACK TÉCNICO

- **Frontend:** HTML + Tailwind CSS (CDN) + JS vanilla (todo en 1 archivo)
- **PDF:** html2pdf.js v0.10.1
- **Backend de datos:** Airtable REST API (imágenes y datos secundarios)
- **Tasa BCV:** https://ve.dolarapi.com/v1/dolares/oficial (campo `promedio`)
- **Hosting:** GitHub Pages
- **CI/CD:** GitHub Actions (inyecta token desde Secret)
- **Versionado:** Git + GitHub

---

## 📁 ESTRUCTURA DE ARCHIVOS

```
C:\Users\fabio\Desktop\
├── hyundai_proforma.html        ← App completa (~1.6MB, ~2,490 líneas)
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

### ⚠️ Inconsistencias Airtable (ya manejadas en código)
- Airtable guarda los Tucson con nombres **viejos**:
  - `Tucson 2.0L A/T Premium` → mapeado a `Tucson 2.0L A/T 2WD GLS`
  - `Tucson 2.0L A/T Limited` → mapeado a `Tucson 2.0L A/T 4WD GLX`
- El sistema los normaliza vía `aliasNombres` (en código) y `nombreCanonico()`

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

## 🏢 DATOS DE LA EMPRESA (ya integrados al PDF)

Constante `EMPRESA` en el código:
- **RIF:** `J-507391922`
- **Dirección:** `Av. Urdaneta N° 49-29, Mérida, Venezuela`
- **Teléfono:** `(0274) 712.34.56`
- **Email:** `ventas@automotoreskibun.com`
- **Banco USD:** FACEBANK
- **Banco Bs:** Banco Nacional de Crédito

(Verificar horario y completar otros textos si aplica)

---

## 🧮 LÓGICA DE IMPUESTOS (LOCAL, 100% JS)

```
PVP base  →  configuracionPrecios[modelo].pvp
+ IVA 16% →  sobre PVP
+ IGTF 3% →  sobre PVP (NO sobre PVP+IVA) ← importante
+ Trámites = gastos fijos por modelo
─────────────────
= TOTAL FINAL (lo que paga el cliente)
```

- **`configuracionPrecios`** = objeto con PVP/IVA/IGTF/Gastos por modelo (10 entradas, fuente única de verdad)
- **`calcularDesglose(pvp, gastos)`** = calcula y devuelve `{ pvp, iva, igtf, gastos, totalFinal }`
- Integrado en los **4 motores**: Provincial, CTZ, Pivca, V13
- PDF muestra desglose en USD y conversión a Bs con tasa BCV

---

## 🗂️ CATEGORÍAS DE VEHÍCULOS (LOCAL)

```
const CATEGORIAS = ['Todos', 'Hatchback', 'Sedán', 'SUV', 'SUV Premium'];
```

- **Hatchback:** Grand i10 GL M/T, Grand i10 GL A/T, Grand i10 GLS A/T
- **Sedán:** Grand i10 Sedán A/T, Accent 1.5L A/T, Elantra 2.0L A/T
- **SUV:** Creta 1.5L A/T, Palisade 3.8L A/T AWD
- **SUV Premium:** Tucson 2.0L A/T 2WD GLS, Tucson 2.0L A/T 4WD GLX

### Comportamiento del filtro
- Default: `"Todos"`
- Categorías sin modelos se ocultan automáticamente
- Filtrado client-side con `state.categoria`

### Mapeo de nombres viejos → canónicos (`aliasNombres`)
| Airtable (viejo) | Canónico (configuracionPrecios) |
|---|---|
| `Tucson 2.0L A/T Premium` | `Tucson 2.0L A/T 2WD GLS` |
| `Tucson 2.0L A/T Limited` | `Tucson 2.0L A/T 4WD GLX` |
| `Tucson Premium` | `Tucson 2.0L A/T 2WD GLS` |
| `Tucson Limited` | `Tucson 2.0L A/T 4WD GLX` |
| `Tucson 2.0L Premium` | `Tucson 2.0L A/T 2WD GLS` |
| `Tucson 2.0L Limited` | `Tucson 2.0L A/T 4WD GLX` |

`nombreCanonico()` consulta primero `aliasNombres`, luego `configuracionPrecios`, luego `mapeoCategorias`, y devuelve el original si nada coincide.

---

## 🖼️ LÓGICA DE IMÁGENES (resuelta hoy)

### Prioridad actual
1. **URL de Airtable** (campo `Foto`) → ✓ refleja cambios en vivo
2. **Base64 embebido** en `vehicleImages{}` → fallback offline
3. **SVG genérico** → si todo falla

### Lo que NO se debe hacer
- Volver a la lógica vieja donde base64 ganaba sobre Airtable (commit 8a709fa y anteriores)
- Las imágenes base64 en `vehicleImages` siguen ocupando ~10MB del HTML (todo el HTML pesa 1.6MB)

### Console logs útiles
- `[img airtable] X <- Airtable` → imagen vino de Airtable ✓
- `[img base64-fallback] X` → Airtable no tiene Foto, usa local
- `OK [img] X` → img cargó OK
- `ERR [img] X` → img falló, va a SVG

---

## 🛡️ RESILIENCIA ANTE FALLOS DE AIRTABLE

`fetchVehiculos()`:
- **Timeout 5s** (AbortController)
- **Fallback automático a `backupData`** si:
  - No hay credenciales
  - Fetch falla
  - Airtable responde 401/403/404
  - Respuesta inválida
  - Airtable devuelve 0 vehículos
- **`ensureLeadsSchema()`** envuelto en try/catch (no rompe la app)
- App **siempre funciona**, aunque Airtable esté caído

`backupData` = array con los 10 vehículos (nombre, pvp, gastos, category, specs, imageUrl vacío)

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

### 2. **Datos de contacto** (mayormente integrados, faltan detalles menores)
- ✅ RIF: `J-507391922`
- ✅ Dirección: `Av. Urdaneta N° 49-29, Mérida, Venezuela`
- ✅ Teléfono: `(0274) 712.34.56`
- ✅ Email: `ventas@automotoreskibun.com`
- ⏳ Horario: `L-V 8:00am - 5:00pm · Sáb 9:00am - 1:00pm` ← confirmar
- ⏳ Cuentas bancarias (FACEBANK, BNC): confirmar números

### 3. **Otros cambios menores** (mencionados por el usuario)
- Revisar textos, ortografía, formato
- Ajustes visuales varios

### 4. **Optimización futura (no urgente)**
- El HTML pesa 1.6MB por las imágenes base64. Si se quisiera aligerar, se podrían subir las imágenes a Airtable y dejar solo el `vehicleImages` como seed inicial mínimo. Pero el sistema ya prioriza Airtable, así que no es crítico.

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
- **Step 1:** Catálogo (10 vehículos con imagen, precio, specs) + filtro de categoría
- **Step 2:** Financiamiento (4 planes: Provincial, CTZ, Pivca, Amortización V13)
- **Step 3:** Proforma (form + asesor + generación PDF con desglose fiscal)
- **Después:** Botón "Nueva Cotización" → vuelve al catálogo

### Planes de financiamiento
- 🏦 Banco Provincial (mín 30% inicial)
- 📊 CTZ
- 🤝 Pivca
- 📑 Amortización V13

### Símbolos JS clave
- `configuracionPrecios` — PVP/IVA/IGTF/Gastos por modelo (10 entradas)
- `mapeoCategorias` — categoría → modelos
- `CATEGORIAS` — array de categorías (orden visible en UI)
- `aliasNombres` — nombres viejos de Airtable → canónicos
- `backupData` — 10 vehículos estáticos (fallback offline)
- `vehicles` — copia mutable que se renderiza (se popula con Airtable o backupData)
- `calcularDesglose(pvp, gastos)` — devuelve { pvp, iva, igtf, gastos, totalFinal }
- `obtenerCategoria(nombre)` — devuelve la categoría o "Otros"
- `nombreCanonico(nombre)` — devuelve nombre canónico o el original
- `normName(s)` — normaliza para match robusto (lowercase, sin acentos, sin espacios/guiones)
- `EMPRESA` — constantes de la empresa para el PDF
- `state.categoria` — filtro actual ("Todos" por default)
- `categoriasConModelos` — categorías con al menos 1 modelo (auto-hide vacías)

### Prioridad PVP al construir `liveVehicles`
1. `configuracionPrecios[canonico].pvp` → si existe
2. `staticMatch.pvp` (de backupData) → si no hay match en config
3. `f.Precio` (de Airtable) → último recurso

⚠️ **Airtable.Prec**io actualmente almacena el TOTAL (PVP+imp), no el PVP puro. El sistema lo ignora y siempre usa `configuracionPrecios`. Si en el futuro se quiere usar el Precio de Airtable, hay que migrarlo a PVP puro.

### Imágenes de vehículos
- 10 imágenes embebidas como base64 en `hyundai_proforma.html` (objeto `vehicleImages`)
- Source original: `C:\Users\fabio\OneDrive\Desktop\Hyundai\Imagenes\`
- Airtable.Foto tiene prioridad (commit `8652df1`)

---

## ✅ LO QUE YA FUNCIONA

- [x] Repo en GitHub (público, sin secrets en código)
- [x] Deploy automático a GitHub Pages
- [x] Token auto-inyectado desde Secret
- [x] Banner de token solo aparece si falta
- [x] Catálogo carga desde Airtable con **fallback offline a backupData**
- [x] **Lógica de precios/impuestos 100% local** (no depende de Airtable)
- [x] **Filtro de categorías funcional** (Todos, Hatchback, Sedán, SUV, SUV Premium)
- [x] **Categorías vacías se ocultan** automáticamente
- [x] **Tucson en categoría "SUV Premium"** (mapeo via `aliasNombres`)
- [x] **Imágenes: Airtable gana sobre base64** (cambios en vivo)
- [x] Asesores cargan desde Airtable (3 asesores)
- [x] Flujo completo: catálogo → financiamiento → proforma → PDF
- [x] **PDF con datos reales de empresa** (RIF, dirección, bancos, email)
- [x] **PDF con desglose fiscal** (PVP/IVA/IGTF/Trámites + USD/Bs)
- [x] Registro de leads en Airtable (con try/catch, no rompe la app)
- [x] Tasa BCV en tiempo real
- [x] Responsive (funciona en móvil y desktop)
- [x] **Timeout 5s en fetch Airtable** (no se cuelga la app)
- [x] Sin login requerido para visitantes
- [x] El visitante no ve el código

---

## 📜 HISTORIAL DE COMMITS RECIENTES

```
8652df1  fix: priorizar URL de Airtable sobre base64 embebido para reflejar cambios de imagen en tiempo real
1faa77d  fix: agregar aliasNombres para mapear nombres viejos de Airtable (Tucson Premium/Limited) a canónicos
8a709fa  fix: usar nombre canonico para match de categorias
33a8426  (re-trigger deploy)
64c19be  feat: agregar categoria SUV Premium para Tucson
f62720d  feat: impuestos locales IVA/IGTF/Trámites + filtro categorías + fallback offline
```

---

## 🎯 PENDIENTE PARA MAÑANA

### Sesión 1 — Ajustes menores de contenido
- [ ] Confirmar horario de la concesionaria
- [ ] Confirmar números de cuenta bancaria (FACEBANK, BNC)
- [ ] Revisar textos, ortografía, formato del PDF
- [ ] Ajustes visuales varios

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

# Cache-buster URL para forzar navegador a recargar
# https://fabiopabonmovilnet-rgb.github.io/automotores-kibun-simulador/hyundai_proforma.html?v=COMMIT_HASH
```

---

## 💡 LECCIONES APRENDIDAS HOY

1. **El navegador cachea MUY agresivamente** GitHub Pages. El usuario tuvo que probar:
   - Ctrl+Shift+R (hard refresh)
   - Ctrl+F5
   - Incógnito (Ctrl+Shift+N)
   - Limpiar cache
   - URL con `?v=COMMIT_HASH` (cache-buster)
   - Re-trigger deploy vacío
   - **Nada funcionó al inicio** porque el deployed file SÍ tenía el cambio; el problema era otro
   
2. **El log de consola del `<img onload>` miente** (muestra el `v.name` interpolado al renderizar, no el canónico). Para debug real, usar `console.info` con log explícito del nombre canónico.

3. **El `staticMatch` en `fetchVehiculos` debe ser flexible**: si Airtable tiene nombres distintos a `configuracionPrecios`, no hay match. Solución: `aliasNombres` como tabla de traducción explícita.

4. **Priorizar Airtable sobre base64 para imágenes** permite que el cliente suba imágenes nuevas sin pedir deploy. El base64 queda como fallback offline.

5. **Siempre validar con `curl` al server antes de culpar al navegador**: confirma si el cambio realmente está desplegado.

---

## 📞 RECORDATORIOS

- El usuario está en **Mérida, Venezuela**
- Trabaja en **Automotores Kibun** (concesionario Hyundai)
- Estilo de comunicación: directo, venezolano, "oe", "porfa", casual
- Nivel técnico: entiende lo básico, no maneja Git/PowerShell fluido
- Frustración previa: "oe haslo de verdad no entiendo porque no sirve en git"
- Tono preferido: respuestas cortas, sin floritura, ir al grano
