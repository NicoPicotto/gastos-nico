import { useMemo, useState } from 'react'
import { useBorrarMovimiento, useMovimientos } from '../lib/api'
import { colorSlot, fmtArs, fmtFecha, fmtMonto, ultimoDia } from '../lib/format'
import type { Movimiento } from '../lib/types'
import { MovimientoForm } from './MovimientoForm'

const ORIGEN: Record<Movimiento['origen'], string> = { mcp: 'Claude', web: 'Web', cron: 'Auto' }

export function Movimientos({ mes }: { mes: string }) {
  const { data: movs = [], isLoading } = useMovimientos(`${mes}-01`, ultimoDia(mes))
  const borrar = useBorrarMovimiento()
  const [editando, setEditando] = useState<Movimiento | 'nuevo' | null>(null)
  const [filtro, setFiltro] = useState('')
  const [tipo, setTipo] = useState<'todos' | 'gasto' | 'ingreso'>('todos')

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    return movs.filter(
      (m) =>
        (tipo === 'todos' || m.tipo === tipo) &&
        (!q || [m.categoria, m.grupo, m.descripcion ?? ''].some((s) => s.toLowerCase().includes(q))),
    )
  }, [movs, filtro, tipo])

  const total = visibles.reduce((s, m) => s + (m.tipo === 'ingreso' ? 1 : -1) * Number(m.monto_ars), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="field max-w-xs flex-1"
          placeholder="Buscar categoría o descripción"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <select className="field w-auto" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
          <option value="todos">Todos</option>
          <option value="gasto">Gastos</option>
          <option value="ingreso">Ingresos</option>
        </select>
        <button className="btn-primary ml-auto" onClick={() => setEditando('nuevo')}>
          + Nuevo
        </button>
      </div>

      {editando && (
        <section className="card">
          <MovimientoForm
            key={editando === 'nuevo' ? 'nuevo' : editando.id}
            movimiento={editando === 'nuevo' ? undefined : editando}
            onDone={() => setEditando(null)}
          />
        </section>
      )}

      <section className="card overflow-x-auto p-0 sm:p-0">
        {isLoading ? (
          <p className="p-4 text-ink-2">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="p-4 text-ink-2">No hay movimientos.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-ink-2">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Categoría</th>
                <th className="px-4 py-2 font-medium">Descripción</th>
                <th className="px-4 py-2 text-right font-medium">Monto</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibles.map((m) => (
                <tr key={m.id}>
                  <td className="tabular px-4 py-2">{fmtFecha(m.fecha)}</td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: m.tipo === 'ingreso' ? 'var(--s-ingreso)' : colorSlot(m.color_slot) }} />
                      {m.categoria}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {m.descripcion}
                    <span className="ml-2 text-xs text-muted">{ORIGEN[m.origen]}</span>
                  </td>
                  <td className={`tabular px-4 py-2 text-right ${m.tipo === 'ingreso' ? 'text-good' : ''}`}>
                    {m.tipo === 'ingreso' ? '+' : ''}
                    {fmtMonto(m.monto, m.moneda)}
                    {m.moneda === 'USD' && (
                      <span className="block text-xs text-muted">{fmtArs(Number(m.monto_ars))}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditando(m)}>
                      Editar
                    </button>
                    <button
                      className="btn-ghost px-2 py-1 text-xs text-bad"
                      onClick={() => confirm(`¿Borrar ${m.categoria} del ${fmtFecha(m.fecha)}?`) && borrar.mutate(m.id)}
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-ink-2">
                  {visibles.length} movimientos · balance
                </td>
                <td className={`tabular px-4 py-2 text-right font-medium ${total < 0 ? 'text-bad' : 'text-good'}`}>
                  {fmtArs(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </div>
  )
}
