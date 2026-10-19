# Gastos Nico

App personal de gastos e ingresos. Los movimientos se cargan hablándole a Claude (MCP remoto) y se ven en un dashboard web.

```
Claude app (celu) ──HTTP──> Edge Function /mcp/<token> ──> Postgres (Supabase)
                                                              ▲
Dashboard (Vite+React, Vercel) ── supabase-js + Auth (RLS) ───┘
pg_cron ──> fx-refresh (cotización MEP)
```

- `supabase/migrations/`: esquema, categorías fijas, jobs de cron y cambios posteriores
- `supabase/functions/mcp/`: servidor MCP (tools en `tools.ts`)
- `supabase/functions/fx-refresh/`: guarda la cotización MEP de dolarapi.com
- `web/`: dashboard

## Reglas de negocio

- **Categorías fijas**: viven en la migración `..._categorias.sql`. Para cambiarlas, agregá una migración nueva.
- **Tarjeta de crédito**: solo se carga el pago del resumen (categoría *Tarjeta crédito*). Las compras con crédito no se registran sueltas.
- **USD**: cada movimiento congela la cotización MEP del momento de la carga (`cotizacion_mep`) y `monto_ars` se calcula a partir de ella.

## Desarrollo local

Requiere Docker.

```sh
npx supabase start -x vector,logflare,realtime,storage-api,imgproxy,studio,postgres-meta,supavisor
echo "MCP_TOKEN=token-local" > supabase/functions/.env
npx supabase functions serve --env-file supabase/functions/.env

# Usuario local (los signups están deshabilitados)
curl -X POST http://127.0.0.1:54321/auth/v1/admin/users \
  -H "apikey: <SERVICE_ROLE_KEY>" -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H 'content-type: application/json' -d '{"email":"vos@mail.com","password":"<contraseña>","email_confirm":true}'

cd web
cp .env.example .env.local   # completá VITE_SUPABASE_ANON_KEY con `npx supabase status`
npm install && npm run dev
```


MCP local: `http://127.0.0.1:54321/functions/v1/mcp/token-local` (probalo con `npx @modelcontextprotocol/inspector`).

## Deploy

### 1. Supabase

**Base de datos**: en el SQL Editor del dashboard, pegá y ejecutá en orden los archivos de `supabase/migrations/` (en orden de nombre). Para el 04 (cron) antes hay que activar las extensiones **pg_cron** y **pg_net** en *Database → Extensions*.

**Edge Functions** (se suben con la CLI, sin Docker):

```sh
npx supabase login
npx supabase link --project-ref <ref>
npx supabase secrets set MCP_TOKEN=$(openssl rand -hex 32)   # guardalo: va en la URL del conector
npx supabase functions deploy mcp --use-api
npx supabase functions deploy fx-refresh --use-api
```

En el SQL Editor (lo usa el cron para llamar a `fx-refresh`):

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
```

Cargá la primera cotización: `curl -X POST https://<ref>.supabase.co/functions/v1/fx-refresh`

En el dashboard de Supabase, sección **Authentication**:
- **Sign In / Providers**: desactivá *Allow new users to sign up* y dejá el proveedor Email activo.
- **Users → Add user**: creá tu usuario con email y contraseña (tildá *Auto Confirm User*).
- **URL Configuration**: en *Site URL* poné la URL de Vercel (solo se usa en mails de recuperación).

### 2. Conector en Claude

En claude.ai, **Settings → Connectors → Add custom connector**, con esta URL:

```
https://<ref>.supabase.co/functions/v1/mcp/<MCP_TOKEN>
```

En **Autenticación** elegí **"Sin inicio de sesión"**. Ojo: `supabase secrets list` muestra el *hash* del token, no su valor. Usá el valor que generaste. Una vez agregado, también aparece en la app del celular. El token es la única protección del MCP: si se filtra, rotalo con `supabase secrets set` y actualizá el conector.

### 3. Vercel

Importá el repo con **Root Directory** `web` (Vite se detecta solo) y configurá estas variables de entorno:

- `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = la publishable/anon key del proyecto

## Jobs (pg_cron, UTC)

| Job | Horario | Qué hace |
|---|---|---|
| `fx-refresh` | 08:45 y 21:00 (05:45 y 18:00 ART) | Guarda la cotización MEP del día |
