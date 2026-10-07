# 💳 FinPay — Sistema de Pagos y Recaudos

Aplicación fintech completa tipo Efecty/Baloto con panel admin, panel de comercios, control de saldos y antifraude.

---

## 🗂️ Estructura del Proyecto

```
fintech-app/
├── supabase_schema.sql        ← Script completo para la base de datos
├── src/
│   ├── lib/supabase.js        ← Cliente Supabase + helpers
│   ├── hooks/useAuth.jsx      ← Contexto de autenticación
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── admin/
│   │   │   ├── AdminLayout.jsx
│   │   │   ├── AdminDashboard.jsx   ← Métricas en tiempo real
│   │   │   ├── AdminCommerces.jsx   ← Gestión de comercios
│   │   │   ├── AdminTransactions.jsx ← Todas las transacciones + reversión
│   │   │   ├── AdminReports.jsx     ← Reportes + gráficas + Excel
│   │   │   └── AdminAlerts.jsx      ← Alertas antifraude
│   │   └── commerce/
│   │       ├── CommerceLayout.jsx
│   │       ├── CommerceDashboard.jsx ← Saldo en tiempo real
│   │       ├── CommerceOperations.jsx ← POS: Recaudo/Retiro/Transfer.
│   │       └── CommerceHistory.jsx   ← Historial + Excel
│   ├── index.css              ← Tema dark fintech completo
│   └── main.jsx               ← Router + Auth provider
├── .env.example               ← Variables de entorno
├── netlify.toml               ← Deploy en Netlify (gratis)
└── package.json
```

---

## 🚀 Guía de Instalación Paso a Paso

### PASO 1 — Crear proyecto en Supabase (GRATIS)

1. Ve a [https://supabase.com](https://supabase.com) y crea una cuenta
2. Haz clic en **"New project"**
3. Ponle un nombre (ej: `finpay`) y elige una contraseña para la BD
4. Espera ~2 minutos a que se inicialice

### PASO 2 — Ejecutar el schema de base de datos

1. En tu proyecto Supabase, ve a **SQL Editor** (ícono de consola en el sidebar)
2. Haz clic en **"New query"**
3. Copia y pega **todo** el contenido de `supabase_schema.sql`
4. Haz clic en **"Run"** (▶)
5. Verifica que salga: `Success. No rows returned`

### PASO 3 — Obtener credenciales

1. Ve a **Settings → API** en tu proyecto Supabase
2. Copia:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon public** key → la clave larga que empieza con `eyJ...`

### PASO 4 — Configurar variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local` y reemplaza con tus datos:
```
VITE_SUPABASE_URL=https://TU_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...TU_ANON_KEY
```

### PASO 5 — Instalar y ejecutar localmente

```bash
npm install
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173)

---

## 👤 Crear el primer usuario Administrador

1. En Supabase → **Authentication → Users → Add user**
2. Ingresa email y contraseña
3. Ve a **Table Editor → profiles**
4. Busca el usuario recién creado y cambia `role` de `commerce` a `admin`
5. ¡Listo! Ya puedes hacer login como admin

---

## 🏪 Crear usuario de Comercio

### Opción A — Desde el panel Admin (recomendado en producción)
*(Requiere Service Role Key configurada en el backend)*

### Opción B — Manual (para pruebas)
1. Crea un comercio en **Admin → Comercios → "+ Nuevo Comercio"**
2. En Supabase → **Authentication → Users → Add user** con el email del comercio
3. En **Table Editor → profiles**, actualiza el registro:
   - `role` = `commerce`
   - `commerce_id` = el UUID del comercio creado en el paso 1

---

## 🔧 Funcionalidades Implementadas

### Panel Admin
- ✅ Dashboard con métricas en tiempo real (WebSocket)
- ✅ Cuenta concentradora con saldo global
- ✅ Gestión de comercios (crear, editar, suspender, ajustar saldo)
- ✅ Todas las transacciones con filtros avanzados
- ✅ Reversión de transacciones con auditoría
- ✅ Alertas de fraude en tiempo real
- ✅ Reportes con gráficas (7 días, semana, mes)
- ✅ Ranking de comercios
- ✅ Exportación a Excel (.xlsx)

### Panel Comercio
- ✅ Saldo en tiempo real (actualización automática)
- ✅ POS con 3 botones grandes: Recaudo / Retiro / Transferencia
- ✅ Flujo de 4 pasos: Seleccionar → Formulario → Confirmar → Éxito
- ✅ Validación de saldo insuficiente
- ✅ Doble confirmación con monto grande destacado
- ✅ Historial con filtros y exportación Excel
- ✅ Alertas visuales por saldo bajo

### Modelo Financiero
- ✅ Función SQL atómica `execute_transaction` (sin race conditions)
- ✅ Libro contable completo (wallet_ledger)
- ✅ Saldo prepago: recaudo suma, retiro resta
- ✅ Validación de saldo antes de retiro/transferencia
- ✅ Comisión configurable por recaudo (0.5% por defecto)

### Seguridad y Antifraude
- ✅ Row Level Security (RLS) en todas las tablas
- ✅ ID único por transacción (código alfanumérico)
- ✅ Registro de usuario y hora exacta
- ✅ Alertas automáticas por montos altos
- ✅ Bloqueo manual de comercios sospechosos
- ✅ Log de auditoría completo
- ✅ Política: comercios solo ven sus propias transacciones

---

## 🌐 Deploy Gratuito en Netlify

1. Sube el proyecto a GitHub
2. Ve a [https://netlify.com](https://netlify.com) → "Add new site" → "Import from Git"
3. En **Environment variables** agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Build command: `npm run build`
5. Publish directory: `dist`
6. ¡Deploy automático!

---

## 💰 Costos (Todo Gratis)

| Servicio | Plan | Límite Gratis |
|----------|------|---------------|
| Supabase | Free | 500 MB DB, 50.000 usuarios |
| Netlify  | Starter | 100 GB bandwidth/mes |
| Total    | **$0** | Para escala inicial |

---

## 📦 Tecnologías Usadas

- **React 18** + Vite
- **Supabase** (PostgreSQL + Auth + Realtime)
- **react-router-dom v6**
- **recharts** — gráficas
- **xlsx** — exportación Excel
- CSS puro con variables (sin Tailwind)

---

## 🛡️ Seguridad en Producción

Antes de ir a producción, asegúrate de:

1. **Revisar las políticas RLS** en Supabase → Table Editor → RLS Policies
2. **Configurar email confirmation** en Authentication → Settings
3. **Cambiar la tasa de comisión** en `CommerceOperations.jsx` línea: `const FEE_RATE = 0.005`
4. **Ajustar umbrales** de alerta al crear cada comercio
5. **Activar 2FA** en tu cuenta de Supabase

---

## 📞 Extensiones Sugeridas

- [ ] Notificaciones por WhatsApp (Twilio/Meta API)
- [ ] Recibo PDF imprimible por transacción
- [ ] App móvil (React Native con mismo backend)
- [ ] Conciliación bancaria automática
- [ ] Integración con pasarela de pagos (PSE/Nequi)
