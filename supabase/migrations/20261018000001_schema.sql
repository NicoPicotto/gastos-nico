-- Esquema base: categorías fijas agrupadas, movimientos (gastos/ingresos),
-- recurrentes y cache de cotización MEP.

create type tipo_movimiento as enum ('gasto', 'ingreso');
create type moneda as enum ('ARS', 'USD');
create type medio_pago as enum ('debito', 'efectivo', 'transferencia', 'otro');
create type estado_movimiento as enum ('confirmado', 'pendiente');
create type origen_movimiento as enum ('mcp', 'web', 'cron');
create type modo_recurrente as enum ('fijo', 'variable');

create table grupos (
  id smallint primary key,
  nombre text not null unique,
  orden smallint not null,
  -- Slot de la paleta categórica del front (1..8); null = gris neutro.
  color_slot smallint check (color_slot between 1 and 8)
);

create table categorias (
  id smallint primary key,
  nombre text not null unique,
  grupo_id smallint not null references grupos (id),
  tipo tipo_movimiento not null,
  orden smallint not null
);

create table cotizaciones (
  fecha date primary key,
  mep_venta numeric(12, 2) not null check (mep_venta > 0),
  actualizado_at timestamptz not null default now()
);

create table recurrentes (
  id bigint generated always as identity primary key,
  categoria_id smallint not null references categorias (id),
  descripcion text not null,
  modo modo_recurrente not null,
  monto numeric(14, 2) check (monto > 0),
  moneda moneda not null default 'ARS',
  dia_del_mes smallint not null check (dia_del_mes between 1 and 31),
  activo boolean not null default true,
  -- Fecha en que se generó por última vez; evita duplicados dentro del mes.
  ultimo_generado date,
  created_at timestamptz not null default now(),
  constraint fijo_requiere_monto check (modo = 'variable' or monto is not null)
);

create table movimientos (
  id bigint generated always as identity primary key,
  categoria_id smallint not null references categorias (id),
  monto numeric(14, 2) check (monto > 0),
  moneda moneda not null default 'ARS',
  -- Cotización MEP congelada al momento de la carga (solo USD).
  cotizacion_mep numeric(12, 2) check (cotizacion_mep > 0),
  monto_ars numeric(16, 2) generated always as (
    case when moneda = 'USD' then round(monto * cotizacion_mep, 2) else monto end
  ) stored,
  fecha date not null default (now() at time zone 'America/Argentina/Cordoba')::date,
  descripcion text,
  medio_pago medio_pago,
  estado estado_movimiento not null default 'confirmado',
  recurrente_id bigint references recurrentes (id) on delete set null,
  origen origen_movimiento not null default 'web',
  created_at timestamptz not null default now(),
  constraint confirmado_requiere_monto check (estado = 'pendiente' or monto is not null),
  constraint usd_confirmado_requiere_cotizacion check (
    moneda = 'ARS' or estado = 'pendiente' or cotizacion_mep is not null
  )
);

create index movimientos_fecha_idx on movimientos (fecha);
create index movimientos_categoria_fecha_idx on movimientos (categoria_id, fecha);
create index movimientos_pendientes_idx on movimientos (fecha) where estado = 'pendiente';

-- Vista desnormalizada para el dashboard y el MCP.
create view movimientos_v with (security_invoker = true) as
select
  m.*,
  c.nombre as categoria,
  c.tipo,
  g.id as grupo_id,
  g.nombre as grupo,
  g.color_slot
from movimientos m
join categorias c on c.id = m.categoria_id
join grupos g on g.id = c.grupo_id;

-- Permisos explícitos (el proyecto no expone tablas nuevas automáticamente).
-- anon no recibe nada: sin sesión no hay acceso.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant select on grupos, categorias, cotizaciones, movimientos_v to authenticated;
grant select, insert, update, delete on movimientos, recurrentes to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- RLS: app de un solo usuario. Los signups están deshabilitados, así que
-- "authenticated" es únicamente el dueño. anon no tiene acceso a nada.
alter table grupos enable row level security;
alter table categorias enable row level security;
alter table cotizaciones enable row level security;
alter table recurrentes enable row level security;
alter table movimientos enable row level security;

create policy "lectura dueño" on grupos for select to authenticated using (true);
create policy "lectura dueño" on categorias for select to authenticated using (true);
create policy "lectura dueño" on cotizaciones for select to authenticated using (true);
create policy "acceso dueño" on recurrentes for all to authenticated using (true) with check (true);
create policy "acceso dueño" on movimientos for all to authenticated using (true) with check (true);
