-- Generación de movimientos recurrentes.
-- fijo     -> movimiento confirmado con el monto del recurrente
-- variable -> movimiento pendiente sin monto, a confirmar desde el MCP o la web
-- Idempotente: cada recurrente se genera a lo sumo una vez por mes. Si el cron
-- se saltea días, se pone al día en la siguiente corrida.

create or replace function generar_recurrentes(
  p_hoy date default (now() at time zone 'America/Argentina/Cordoba')::date
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  r recurrentes;
  v_inicio_mes date := date_trunc('month', p_hoy)::date;
  v_ultimo_dia int := extract(day from (v_inicio_mes + interval '1 month - 1 day'))::int;
  v_dia int;
  v_cot numeric;
  v_estado estado_movimiento;
  v_count int := 0;
begin
  select mep_venta into v_cot
  from cotizaciones
  where fecha <= p_hoy
  order by fecha desc
  limit 1;

  for r in
    select * from recurrentes
    where activo and (ultimo_generado is null or ultimo_generado < v_inicio_mes)
    for update
  loop
    -- Día 31 en un mes de 30 días -> último día del mes.
    v_dia := least(r.dia_del_mes, v_ultimo_dia);
    continue when extract(day from p_hoy)::int < v_dia;

    -- Un fijo en USD sin cotización disponible queda pendiente en vez de fallar.
    v_estado := case
      when r.modo = 'fijo' and (r.moneda = 'ARS' or v_cot is not null) then 'confirmado'
      else 'pendiente'
    end;

    insert into movimientos (
      categoria_id, monto, moneda, cotizacion_mep, fecha,
      descripcion, estado, recurrente_id, origen
    ) values (
      r.categoria_id, r.monto, r.moneda,
      case when r.moneda = 'USD' and v_estado = 'confirmado' then v_cot end,
      v_inicio_mes + (v_dia - 1),
      r.descripcion, v_estado, r.id, 'cron'
    );

    update recurrentes set ultimo_generado = p_hoy where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function generar_recurrentes(date) from public, anon, authenticated;

-- Al crear un recurrente cuyo día ya pasó este mes, arranca el mes que viene
-- (probablemente ese pago ya se cargó a mano).
create or replace function recurrentes_set_inicio()
returns trigger
language plpgsql
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Cordoba')::date;
begin
  if new.ultimo_generado is null and extract(day from v_hoy)::int > new.dia_del_mes then
    new.ultimo_generado := v_hoy;
  end if;
  return new;
end;
$$;

create trigger recurrentes_set_inicio
before insert on recurrentes
for each row execute function recurrentes_set_inicio();
