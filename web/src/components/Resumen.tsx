import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMepPorMes, useMovimientos } from '../lib/api'
import {
  colorSlot,
  fmtFecha,
  fmtTotal,
  fmtValor,
  fmtValorCompacto,
  hoyAR,
  mesActual,
  nombreMes,
  sumarMeses,
  ultimoDia,
  valorEnVista,
  type Vista,
} from '../lib/format'
import type { Movimiento } from '../lib/types'

interface Props {
  mes: string
  vista: Vista
  mep: number | null
}

const sumar = (ms: Movimiento[]) => ms.reduce((s, m) => s + Number(m.monto_ars), 0)

export function Resumen({ mes, vista, mep }: Props) {
  const desde = `${sumarMeses(mes, -11)}-01`
  const { data: movs = [], isLoading } = useMovimientos(desde, ultimoDia(mes))
  const { data: mepPorMes } = useMepPorMes(desde, ultimoDia(mes))
  const fmt = (n: number) => fmtTotal(n, vista, mep)

  const datos = useMemo(() => {
    const delMes = (m: string) => movs.filter((x) => x.fecha.startsWith(m))
    const actual = delMes(mes)
    // Con el mes en curso se compara contra el mismo tramo del mes anterior
    // (del 1 al día de hoy), no contra el mes anterior completo.
    const mesAnterior = sumarMeses(mes, -1)
    const enCurso = mes === mesActual()
    const corte = enCurso ? `${mesAnterior}-${hoyAR().slice(8)}` : ultimoDia(mesAnterior)
    const anterior = delMes(mesAnterior).filter((m) => m.fecha <= corte)
    const gastos = actual.filter((m) => m.tipo === 'gasto')
    const ingresos = actual.filter((m) => m.tipo === 'ingreso')

    // En USD cada mes se convierte con su propio MEP promedio.
    const evolucion = Array.from({ length: 12 }, (_, i) => {
      const m = sumarMeses(mes, i - 11)
      const del = delMes(m)
      const total = (ms: Movimiento[]) => ms.reduce((s, x) => s + valorEnVista(x, vista, mepPorMes?.get(m) ?? mep), 0)
      return {
        mes: m,
        label: nombreMes(m, true),
        ingresos: total(del.filter((x) => x.tipo === 'ingreso')),
        gastos: total(del.filter((x) => x.tipo === 'gasto')),
      }
    })

    return {
      gastos,
      totalGastos: sumar(gastos),
      totalIngresos: sumar(ingresos),
      gastosAnterior: sumar(anterior.filter((m) => m.tipo === 'gasto')),
      notaVariacion: enCurso ? `vs mismo período de ${nombreMes(mesAnterior, true)}` : 'vs mes anterior',
      evolucion,
      top: [...gastos].sort((a, b) => Number(b.monto_ars) - Number(a.monto_ars)).slice(0, 5),
    }
  }, [movs, mes, vista, mep, mepPorMes])

  if (isLoading) return <p className="text-ink-2">Cargando…</p>

  const balance = datos.totalIngresos - datos.totalGastos
  const ahorro = datos.totalIngresos > 0 ? Math.round((balance / datos.totalIngresos) * 100) : null
  const variacion = datos.gastosAnterior > 0 ? (datos.totalGastos / datos.gastosAnterior - 1) * 100 : null

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Gastos"
          valor={fmt(datos.totalGastos)}
          nota={
            variacion != null
              ? `${variacion > 0 ? '▲' : '▼'} ${Math.abs(Math.round(variacion))}% ${datos.notaVariacion}`
              : undefined
          }
        />
        <Kpi label="Ingresos" valor={fmt(datos.totalIngresos)} />
        <Kpi label="Balance" valor={fmt(balance)} tono={balance < 0 ? 'bad' : undefined} />
        <Kpi
          label="Ahorro"
          valor={ahorro != null ? `${ahorro}%` : '—'}
          tono={ahorro != null && ahorro < 0 ? 'bad' : undefined}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <GastosPorGrupo gastos={datos.gastos} total={datos.totalGastos} fmt={fmt} />
        </section>
        <section className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">Gastos más grandes</h2>
          {datos.top.length === 0 && <p className="text-sm text-ink-2">Sin gastos este mes.</p>}
          <ul className="divide-y divide-line">
            {datos.top.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{m.descripcion || m.categoria}</p>
                  <p className="text-xs text-muted">
                    {fmtFecha(m.fecha)} · {m.categoria}
                  </p>
                </div>
                <span className="tabular shrink-0 font-medium">{fmt(Number(m.monto_ars))}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <Evolucion datos={datos.evolucion} vista={vista} />
      </section>
    </div>
  )
}

export function Kpi({ label, valor, nota, tono }: { label: string; valor: string; nota?: string; tono?: 'bad' }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-2">{label}</p>
      <p className={`tabular mt-1 text-xl font-semibold sm:text-2xl ${tono === 'bad' ? 'text-bad' : ''}`}>{valor}</p>
      {nota && <p className="mt-1 text-xs text-muted">{nota}</p>}
    </div>
  )
}

function GastosPorGrupo({ gastos, total, fmt }: { gastos: Movimiento[]; total: number; fmt: (n: number) => string }) {
  const [grupo, setGrupo] = useState<string | null>(null)

  const filas = useMemo(() => {
    const fuente = grupo ? gastos.filter((m) => m.grupo === grupo) : gastos
    const clave = (m: Movimiento) => (grupo ? m.categoria : m.grupo)
    return [...Map.groupBy(fuente, clave).entries()]
      .map(([nombre, ms]) => ({ nombre, total: sumar(ms), cantidad: ms.length, color: colorSlot(ms[0].color_slot) }))
      .sort((a, b) => b.total - a.total)
  }, [gastos, grupo])

  const totalVista = grupo ? sumar(gastos.filter((m) => m.grupo === grupo)) : total
  const max = Math.max(...filas.map((f) => f.total), 1)

  return (
    <>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          {grupo ? (
            <>
              <button className="text-ink-2 hover:text-ink" onClick={() => setGrupo(null)}>
                Gastos por grupo
              </button>{' '}
              / {grupo}
            </>
          ) : (
            'Gastos por grupo'
          )}
        </h2>
        <span className="tabular text-sm text-ink-2">{fmt(totalVista)}</span>
      </div>
      {filas.length === 0 && <p className="text-sm text-ink-2">Sin gastos este mes.</p>}
      <ul className="space-y-1">
        {filas.map((f) => (
          <li key={f.nombre}>
            <button
              disabled={!!grupo}
              onClick={() => setGrupo(f.nombre)}
              className="group grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg px-1 py-1.5 text-left text-sm enabled:hover:bg-surface-2 sm:grid-cols-[minmax(0,9rem)_1fr_auto]"
              title={`${f.cantidad} movimiento${f.cantidad === 1 ? '' : 's'}`}
            >
              <span className="truncate">{f.nombre}</span>
              <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                <span
                  className="block h-3 rounded-r-[4px]"
                  style={{ width: `${Math.max((f.total / max) * 100, 0.5)}%`, background: f.color }}
                />
              </span>
              <span className="tabular text-right">
                {fmt(f.total)}
                <span className="ml-2 inline-block w-9 text-xs text-muted">
                  {Math.round((f.total / (totalVista || 1)) * 100)}%
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!grupo && filas.length > 0 && <p className="mt-2 text-xs text-muted">Tocá un grupo para ver el detalle.</p>}
    </>
  )
}

interface PuntoEvolucion {
  mes: string
  label: string
  ingresos: number
  gastos: number
}

function Evolucion({ datos, vista }: { datos: PuntoEvolucion[]; vista: Vista }) {
  const [tabla, setTabla] = useState(false)
  const fmt = (n: number) => fmtValor(n, vista)

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Ingresos vs gastos · últimos 12 meses</h2>
          {vista === 'USD' && <p className="text-xs text-muted">USD al MEP de cada mes</p>}
        </div>
        <button className="btn-ghost shrink-0 whitespace-nowrap px-2 py-1 text-xs" onClick={() => setTabla(!tabla)}>
          {tabla ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>
      {tabla ? (
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead className="text-left text-ink-2">
              <tr>
                <th className="py-1 font-medium">Mes</th>
                <th className="py-1 text-right font-medium">Ingresos</th>
                <th className="py-1 text-right font-medium">Gastos</th>
                <th className="py-1 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {datos.map((d) => (
                <tr key={d.mes}>
                  <td className="py-1.5">{nombreMes(d.mes)}</td>
                  <td className="py-1.5 text-right">{fmt(d.ingresos)}</td>
                  <td className="py-1.5 text-right">{fmt(d.gastos)}</td>
                  <td className={`py-1.5 text-right ${d.ingresos - d.gastos < 0 ? 'text-bad' : ''}`}>
                    {fmt(d.ingresos - d.gastos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datos} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
              <YAxis
                width={56}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted)', fontSize: 12 }}
                tickFormatter={(v: number) => fmtValorCompacto(v, vista)}
              />
              <Tooltip
                cursor={{ fill: 'var(--surface-2)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as PuntoEvolucion
                  return (
                    <div className="tabular rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-md">
                      <p className="mb-1 font-medium">{nombreMes(d.mes)}</p>
                      <p className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: 'var(--s-ingreso)' }} />
                        Ingresos {fmt(d.ingresos)}
                      </p>
                      <p className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: 'var(--s-gasto)' }} />
                        Gastos {fmt(d.gastos)}
                      </p>
                      <p className="mt-1 text-ink-2">Balance {fmt(d.ingresos - d.gastos)}</p>
                    </div>
                  )
                }}
              />
              <Legend
                itemSorter={null}
                iconType="circle"
                iconSize={8}
                formatter={(v: string) => <span style={{ color: 'var(--ink-2)' }}>{v}</span>}
              />
              <Bar dataKey="ingresos" name="Ingresos" fill="var(--s-ingreso)" radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="gastos" name="Gastos" fill="var(--s-gasto)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}
