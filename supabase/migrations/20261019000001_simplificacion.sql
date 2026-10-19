-- Simplificación: se eliminan los recurrentes (y con ellos los movimientos
-- pendientes) y el medio de pago. Se suman las categorías "Esparcimiento"
-- y "Cápitas Logia".

begin;

-- Recurrentes: cron y función generadora (la tabla se borra más abajo,
-- después de sacar la FK movimientos.recurrente_id).
select cron.unschedule('generar-recurrentes');
drop function generar_recurrentes(date);

-- Los pendientes son placeholders sin confirmar (sin pago real).
delete from movimientos where estado = 'pendiente';

-- La vista usa m.* y bloquea el drop de columnas: se recrea abajo.
drop view movimientos_v;

-- Al dropear estado caen sus checks y el índice parcial de pendientes.
alter table movimientos
  drop column medio_pago,
  drop column estado,
  drop column recurrente_id;

alter table movimientos
  alter column monto set not null,
  add constraint usd_requiere_cotizacion check (moneda = 'ARS' or cotizacion_mep is not null);

drop table recurrentes;
drop function recurrentes_set_inicio();

drop type medio_pago;
drop type estado_movimiento;
drop type modo_recurrente;

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

grant select on movimientos_v to authenticated;
grant select on movimientos_v to service_role;

-- Categorías nuevas. "Otros" queda último dentro de su grupo.
insert into categorias (id, nombre, grupo_id, tipo, orden) values
  (7, 'Esparcimiento', 1, 'gasto', 7),
  (51, 'Cápitas Logia', 6, 'gasto', 1);
update categorias set orden = 2 where id = 50;

commit;
