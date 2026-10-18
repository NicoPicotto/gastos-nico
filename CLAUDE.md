# Gastos Nico

App personal (un solo usuario) de gastos e ingresos. La carga se hace hablándole a Claude a través de un MCP remoto, y la visualización en un dashboard web. Todo en español rioplatense: código, UI, mensajes y nombres de tablas.

## Stack y estructura

- `supabase/migrations/`: SQL numerado (schema, categorías, recurrentes, cron)
- `supabase/functions/mcp/`: servidor MCP (Deno, `@modelcontextprotocol/sdk` con `WebStandardStreamableHTTPServerTransport`, Hono). Las tools están en `tools.ts` y las instrucciones del server en `index.ts`.
- `supabase/functions/fx-refresh/`: guarda la cotización MEP (dolarapi.com `/v1/dolares/bolsa`) en `cotizaciones`
- `supabase/functions/_shared/`: cliente con service role (`db.ts`) y cotización con cache y fallback (`fx.ts`)
- `web/`: Vite + React + TS, Tailwind v4, Recharts, TanStack Query. Deploy en Vercel (root `web/`).

Proyecto Supabase: `ouddvtxkejykmjskznqf` (región São Paulo).

## Flujo de trabajo (importante)

- **Cambios de base de datos:** crear un archivo NUEVO en `supabase/migrations/` (nunca editar uno ya aplicado). Nico lo pega y ejecuta a mano en el SQL Editor del dashboard: no usar `supabase db push` ni asumir Docker. Entregarlo como un snippet autocontenido.
- **Edge Functions:** `npx supabase functions deploy <nombre> --use-api` (no requiere Docker; el proyecto ya está linkeado).
- **Frontend local:** `cd web && npm run dev`, apuntando al Supabase real vía `web/.env.local` (gitignored).
- Typecheck del front: `cd web && npx tsc -b`.
- No crear datos de prueba en producción. Para probar end-to-end hay un stack local opcional (`npx supabase start -x vector,logflare,realtime,storage-api,imgproxy,studio,postgres-meta,supavisor`); avisar antes de levantarlo.

## Reglas de negocio

- **Categorías fijas** (seed en `..._categorias.sql`, agrupadas en `grupos`). No hay ABM: se cambian con una migración nueva. El MCP expone los nombres como `z.enum`, así que Claude no puede inventar categorías.
- **Tarjeta de crédito:** solo se registra el pago del resumen (categoría "Tarjeta crédito"). Las compras con crédito NO se cargan sueltas. `medio_pago` no tiene la opción crédito a propósito.
- **USD:** cada movimiento congela `cotizacion_mep` al cargarse, y `monto_ars` es una columna generada. Los totales del dashboard suman `monto_ars`; el toggle USD divide por el MEP actual.
- **Recurrentes:** el modo `fijo` genera un movimiento confirmado; el `variable` genera uno `pendiente` sin monto. `generar_recurrentes()` corre por pg_cron a las 09:00 UTC, es idempotente por `ultimo_generado` y ajusta el día al último del mes. Si un recurrente se crea con el día ya pasado, arranca el mes siguiente (trigger).
- **Pendientes:** no suman en los totales. `registrar_movimiento` confirma automáticamente el pendiente de la misma categoría del mes (salvo `forzar_nuevo`).
- **Fechas** siempre en `America/Argentina/Cordoba`.

## Seguridad

- **Auth:** email + contraseña, signups deshabilitados (el proveedor Email queda activo). El rol `authenticated` = el único usuario.
- **Permisos:** explícitos en la migración 01 (`revoke` + `grant`); `anon` no tiene ninguno. El proyecto no expone tablas nuevas automáticamente, así que **cada tabla nueva necesita sus `grant` y su RLS en la migración**.
- **MCP:** se autentica con un token en el path (`/functions/v1/mcp/<MCP_TOKEN>`), `verify_jwt = false` en `config.toml`, y compara el token en tiempo constante. El conector de claude.ai está configurado como "Sin inicio de sesión".

## Gotchas del MCP

- `supabase secrets list` muestra el **hash SHA-256** del secret, no su valor.
- Si el server devuelve 401, claude.ai asume OAuth y falla el registro del conector.
- Es stateless: GET/DELETE devuelven 405.
- Los montos en las respuestas van en palabras ("20.000 pesos", "20 dólares"), nunca con "$": la app de Claude, sobre todo por voz, lo interpreta como dólares.
- Claude no siempre respeta las *instrucciones del server*. Las reglas críticas (como qué va en cada categoría) tienen que estar también en la `description` de la tool o del parámetro.
- `borrar_movimiento` pide (opcionales) categoría, monto y fecha: se muestran en el diálogo de permiso y, si vienen, se validan contra el registro antes de borrar.
- **claude.ai cachea el schema de las tools del conector**, incluso entre chats nuevos. Al cambiar una tool, mantener compatibilidad hacia atrás: no agregar parámetros obligatorios nuevos a una tool existente (hacerlos opcionales y validar si vienen). Para forzar el refresco: desconectar y reconectar el conector.

## Frontend

- Colores semánticos como tokens CSS en `web/src/index.css`, con modo claro y oscuro. Las clases propias se definen con `@utility` (Tailwind v4 no permite `@apply` sobre clases comunes).
- Los gráficos usan la paleta categórica por **slot** (`grupos.color_slot` → `var(--sN)`), validada para daltonismo. Los colores siguen a la entidad, nunca al ranking. Las barras llevan el valor escrito y la evolución mensual tiene vista de tabla, porque algunos colores no llegan a 3:1 de contraste en modo claro.
