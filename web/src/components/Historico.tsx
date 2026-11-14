import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useCategorias, useMepPorMes, useMovimientos } from '../lib/api'
import { colorSlot, fmtValor, fmtValorCompacto, hoyAR, mesActual, nombreMes, valorEnVista, type Vista } from '../lib/format'
import type { Categoria, FiltroCategorias, Movimiento } from '../lib/types'
import { Kpi } from './Resumen'

interface Props {
  año: number
  vista: Vista
  mep: number | null
  verMovimientos: (mes: string, filtro: FiltroCategorias) => void
}

interface Fila {
  id: string
  nombre: string
  nivel: 'grupo' | 'categoria' | 'total'
  color: string
  valores: number[]
  /** Categorías que suma la fila (para ver sus movimientos). */
  ids: number[]
}

const sumaArr = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const sumarFilas = (filas: number[][]) => Array.from({ length: 12 }, (_, i) => sumaArr(filas.map((f) => f[i])))

export function Historico({ año, vista, mep, verMovimientos }: Props) {
  const desde = `${año - 1}-01-01`
  const hasta = `${año}-12-31`
  const { data: movs = [], isLoading } = useMovimientos(desde, hasta)
  const { data: categorias = [], isLoading: cargandoCats } = useCategorias()
  const { data: mepPorMes } = useMepPorMes(desde, hasta)
  const [seleccion, setSeleccion] = useState('total-gastos')

  const meses = useMemo(() => Array.from({ length: 12 }, (_, i) => `${año}-${String(i + 1).padStart(2, '0')}`), [año])
  const actual = mesActual()
  // Meses transcurridos del año (para el promedio y para atenuar los futuros).
  const transcurridos = meses.filter((m) => m <= actual).length

  const datos = useMemo(() => {
    const valorEn = (v: Vista) => (m: Movimiento) => valorEnVista(m, v, mepPorMes?.get(m.fecha.slice(0, 7)) ?? mep)
    const valor = valorEn(vista)
    const total = (ms: Movimiento[], val = valor) => ms.reduce((s, m) => s + val(m), 0)

    // Acumulado del año, contra el mismo tramo del año anterior.
    const corte = String(año) === actual.slice(0, 4) ? hoyAR() : `${año}-12-31`
    const delAño = movs.filter((m) => m.fecha.startsWith(String(año)) && m.fecha <= corte)
    const delAnterior = movs.filter((m) => m.fecha.startsWith(String(año - 1)))
    const tramoAnterior = delAnterior.filter((m) => m.fecha <= `${año - 1}${corte.slice(4)}`)
    const acumulado = (ms: Movimiento[], val = valor) => ({
      gastos: total(ms.filter((m) => m.tipo === 'gasto'), val),
      ingresos: total(ms.filter((m) => m.tipo === 'ingreso'), val),
    })
    // En ARS la variación anual es casi toda inflación: se muestra también
    // medida en USD, pero solo si todos los meses tienen su MEP (si no, se
    // usaría el de hoy y la comparación engañaría).
    const conMep = (ms: Movimiento[]) => ms.every((m) => m.moneda === 'USD' || mepPorMes?.has(m.fecha.slice(0, 7)))
    const usd = valorEn('USD')
    const enUsd =
      vista === 'ARS' && tramoAnterior.length > 0 && conMep(delAño) && conMep(tramoAnterior)
        ? { actual: acumulado(delAño, usd), anterior: acumulado(tramoAnterior, usd) }
        : null

    // Matriz categoría × mes.
    const porCat = new Map<number, number[]>()
    for (const m of movs) {
      const i = meses.indexOf(m.fecha.slice(0, 7))
      if (i < 0) continue
      const fila = porCat.get(m.categoria_id) ?? Array<number>(12).fill(0)
      fila[i] += valor(m)
      porCat.set(m.categoria_id, fila)
    }
    const valoresCat = (c: Categoria) => porCat.get(c.id) ?? Array<number>(12).fill(0)

    const bloque = (tipo: Categoria['tipo']) => {
      const filas: Fila[] = []
      const cats = categorias.filter((c) => c.tipo === tipo).sort((a, b) => a.grupo_orden - b.grupo_orden || a.orden - b.orden)
      for (const [, delGrupo] of Map.groupBy(cats, (c) => c.grupo_id)) {
        const g = delGrupo[0]
        const color = colorSlot(g.color_slot)
        // Un grupo de una sola categoría se muestra como una única fila.
        if (delGrupo.length === 1) {
          filas.push({ id: `c${g.id}`, nombre: g.nombre, nivel: 'grupo', color, valores: valoresCat(g), ids: [g.id] })
          continue
        }
        filas.push({
          id: `g${g.grupo_id}`,
          nombre: g.grupo,
          nivel: 'grupo',
          color,
          valores: sumarFilas(delGrupo.map(valoresCat)),
          ids: delGrupo.map((c) => c.id),
        })
        for (const c of delGrupo) {
          filas.push({ id: `c${c.id}`, nombre: c.nombre, nivel: 'categoria', color, valores: valoresCat(c), ids: [c.id] })
        }
      }
      return { filas, total: sumarFilas(cats.map(valoresCat)), ids: cats.map((c) => c.id) }
    }

    const gastos = bloque('gasto')
    const ingresos = bloque('ingreso')
    const totalGastos: Fila = {
      id: 'total-gastos',
      nombre: 'Total gastos',
      nivel: 'total',
      color: 'var(--s-gasto)',
      valores: gastos.total,
      ids: gastos.ids,
    }
    const totalIngresos: Fila = {
      id: 'total-ingresos',
      nombre: 'Total ingresos',
      nivel: 'total',
      color: 'var(--s-ingreso)',
      valores: ingresos.total,
      ids: ingresos.ids,
    }
    const balance: Fila = {
      id: 'balance',
      nombre: 'Balance',
      nivel: 'total',
      color: 'var(--s-neutral)',
      valores: ingresos.total.map((v, i) => v - gastos.total[i]),
      ids: [...gastos.ids, ...ingresos.ids],
    }

    return {
      acumulado: acumulado(delAño),
      anterior: delAnterior.length > 0 ? acumulado(tramoAnterior) : null,
      enUsd,
      secciones: [
        { titulo: 'Gastos', filas: [...gastos.filas, totalGastos] },
        { titulo: 'Ingresos', filas: [...ingresos.filas, totalIngresos] },
        { titulo: null, filas: [balance] },
      ],
    }
  }, [movs, categorias, meses, año, actual, vista, mep, mepPorMes])

  if (isLoading || cargandoCats) return <p className="text-ink-2">Cargando…</p>

  const fmt = (n: number) => fmtValor(n, vista)
  const { acumulado, anterior, enUsd } = datos
  const balance = acumulado.ingresos - acumulado.gastos
  const ahorro = acumulado.ingresos > 0 ? Math.round((balance / acumulado.ingresos) * 100) : null
  const variacion = (actualV: number, previo: number | undefined) =>
    previo ? `${actualV >= previo ? '▲' : '▼'} ${Math.abs(Math.round((actualV / previo - 1) * 100))}%` : null
  const nota = (clave: 'gastos' | 'ingresos') => {
    const v = variacion(acumulado[clave], anterior?.[clave])
    if (!v) return undefined
    const vUsd = enUsd && variacion(enUsd.actual[clave], enUsd.anterior[clave])
    return (
      <>
        <p>
          {v} vs mismo período {año - 1}
        </p>
        {vUsd && <p>en USD {vUsd}</p>}
      </>
    )
  }

  const filas = datos.secciones.flatMap((s) => s.filas)
  const elegida = filas.find((f) => f.id === seleccion) ?? filas.find((f) => f.id === 'total-gastos')!

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Gastos ${año}`} valor={fmt(acumulado.gastos)} nota={nota('gastos')} />
        <Kpi label={`Ingresos ${año}`} valor={fmt(acumulado.ingresos)} nota={nota('ingresos')} />
        <Kpi label="Balance" valor={fmt(balance)} tono={balance < 0 ? 'bad' : undefined} />
        <Kpi label="Ahorro" valor={ahorro != null ? `${ahorro}%` : '—'} tono={ahorro != null && ahorro < 0 ? 'bad' : undefined} />
      </section>

      <section className="card">
        <Detalle
          fila={elegida}
          meses={meses}
          transcurridos={transcurridos}
          vista={vista}
          onMes={(m) => verMovimientos(m, { etiqueta: elegida.nombre, ids: elegida.ids })}
        />
      </section>

      <section className="card">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">Mes a mes · {año}</h2>
          {vista === 'USD' && <span className="text-xs text-muted">USD al MEP de cada mes</span>}
        </div>
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="tabular w-full min-w-[64rem] text-sm">
            <thead className="text-ink-2">
              <tr>
                <th className="sticky left-0 bg-surface py-1 pl-4 text-left font-medium sm:pl-5">Ítem</th>
                {meses.map((m) => (
                  <th key={m} className={`px-2 py-1 text-right font-medium ${m > actual ? 'text-muted' : ''}`}>
                    {nombreMes(m, true)}
                  </th>
                ))}
                <th className="px-2 py-1 text-right font-medium">Total</th>
                <th className="py-1 pr-4 pl-2 text-right font-medium sm:pr-5">Prom.</th>
              </tr>
            </thead>
            {datos.secciones.map((s, si) => (
              <tbody key={si} className="border-t border-line">
                {s.titulo && (
                  <tr>
                    <td colSpan={15} className="sticky left-0 bg-surface pt-3 pb-1 pl-4 text-xs font-medium tracking-wide text-muted uppercase sm:pl-5">
                      {s.titulo}
                    </td>
                  </tr>
                )}
                {s.filas.map((f) => {
                  const total = sumaArr(f.valores)
                  const activa = f.id === elegida.id
                  const fondo = activa ? 'bg-surface-2' : 'bg-surface group-hover:bg-surface-2'
                  return (
                    <tr
                      key={f.id}
                      onClick={() => setSeleccion(f.id)}
                      className={`group cursor-pointer ${activa ? 'bg-surface-2' : 'hover:bg-surface-2'} ${f.nivel !== 'categoria' ? 'font-medium' : ''}`}
                    >
                      <td className={`sticky left-0 max-w-48 py-1.5 pr-2 pl-4 sm:pl-5 ${fondo}`}>
                        <button
                          className={`flex w-full min-w-0 items-center gap-2 text-left ${f.nivel === 'categoria' ? 'pl-4 text-ink-2' : ''}`}
                          aria-pressed={activa}
                        >
                          {f.nivel !== 'categoria' && <span className="size-2 shrink-0 rounded-full" style={{ background: f.color }} />}
                          <span className="truncate">{f.nombre}</span>
                        </button>
                      </td>
                      {f.valores.map((v, i) => (
                        <td
                          key={i}
                          className={`px-2 py-1.5 text-right ${meses[i] > actual ? 'text-muted' : ''} ${v < 0 ? 'text-bad' : ''}`}
                        >
                          {meses[i] > actual ? '' : v ? fmtValorCompacto(v, vista) : '—'}
                        </td>
                      ))}
                      <td className={`px-2 py-1.5 text-right ${total < 0 ? 'text-bad' : ''}`}>{total ? fmt(total) : '—'}</td>
                      <td className={`py-1.5 pr-4 pl-2 text-right text-ink-2 sm:pr-5 ${total < 0 ? 'text-bad' : ''}`}>
                        {total && transcurridos ? fmtValorCompacto(total / transcurridos, vista) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Tocá una fila para ver su evolución. El promedio es sobre los meses transcurridos.</p>
      </section>
    </div>
  )
}

function Detalle({
  fila,
  meses,
  transcurridos,
  vista,
  onMes,
}: {
  fila: Fila
  meses: string[]
  transcurridos: number
  vista: Vista
  onMes: (mes: string) => void
}) {
  const puntos = meses.map((m, i) => ({ mes: m, label: nombreMes(m, true), valor: i < transcurridos ? fila.valores[i] : null }))
  const total = sumaArr(fila.valores)
  const promedio = transcurridos ? total / transcurridos : 0
  const etiqueta = (v: unknown) => (typeof v === 'number' && v !== 0 ? fmtValorCompacto(v, vista) : '')

  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="size-2.5 rounded-full" style={{ background: fila.color }} />
          {fila.nombre}
        </h2>
        <p className="tabular text-sm text-ink-2">
          Total {fmtValor(total, vista)} · promedio {fmtValor(promedio, vista)}/mes
        </p>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={puntos} margin={{ top: 20, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
            <YAxis
              width={56}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
              tickFormatter={(v: number) => fmtValorCompacto(v, vista)}
            />
            {promedio !== 0 && (
              <ReferenceLine
                y={promedio}
                stroke="var(--ink-2)"
                strokeDasharray="4 4"
                label={{ value: 'prom.', position: 'insideTopRight', fill: 'var(--ink-2)', fontSize: 11 }}
              />
            )}
            <Bar
              dataKey="valor"
              name={fila.nombre}
              fill={fila.color}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
              cursor="pointer"
              onClick={(_, i) => onMes(meses[i])}
            >
              <LabelList dataKey="valor" position="top" formatter={etiqueta} fill="var(--ink-2)" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted">Tocá una barra para ver los movimientos de ese mes.</p>
    </>
  )
}
