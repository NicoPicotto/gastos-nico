import { useState, type FormEvent } from 'react'
import { useBorrarRecurrente, useCategorias, useGuardarRecurrente, useRecurrentes } from '../lib/api'
import { fmtMonto } from '../lib/format'
import type { Moneda, Recurrente } from '../lib/types'

export function Recurrentes() {
  const { data: recurrentes = [], isLoading } = useRecurrentes()
  const { data: categorias = [] } = useCategorias()
  const guardar = useGuardarRecurrente()
  const borrar = useBorrarRecurrente()
  const [editando, setEditando] = useState<Recurrente | 'nuevo' | null>(null)
  const nombreCat = (id: number) => categorias.find((c) => c.id === id)?.nombre ?? ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Recurrentes</h1>
          <p className="text-sm text-ink-2">
            Los <strong>fijos</strong> se cargan solos el día indicado. Los <strong>variables</strong> quedan pendientes
            hasta que confirmes el monto.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditando('nuevo')}>
          + Nuevo
        </button>
      </div>

      {editando && (
        <section className="card">
          <RecurrenteForm
            key={editando === 'nuevo' ? 'nuevo' : editando.id}
            recurrente={editando === 'nuevo' ? undefined : editando}
            onDone={() => setEditando(null)}
          />
        </section>
      )}

      <section className="card p-0 sm:p-0">
        {isLoading ? (
          <p className="p-4 text-ink-2">Cargando…</p>
        ) : recurrentes.length === 0 ? (
          <p className="p-4 text-ink-2">Todavía no hay recurrentes.</p>
        ) : (
          <ul className="divide-y divide-line">
            {recurrentes.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${r.activo ? '' : 'opacity-60'}`}>
                <span className="tabular w-14 shrink-0 text-ink-2">Día {r.dia_del_mes}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.descripcion}</p>
                  <p className="text-xs text-muted">
                    {nombreCat(r.categoria_id)} · {r.modo === 'fijo' ? 'fijo' : 'variable'}
                    {!r.activo && ' · pausado'}
                  </p>
                </div>
                <span className="tabular">{r.modo === 'fijo' ? fmtMonto(r.monto, r.moneda) : 'a confirmar'}</span>
                <div className="flex gap-1">
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => guardar.mutate({ id: r.id, input: { activo: !r.activo } })}
                  >
                    {r.activo ? 'Pausar' : 'Reactivar'}
                  </button>
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditando(r)}>
                    Editar
                  </button>
                  <button
                    className="btn-ghost px-2 py-1 text-xs text-bad"
                    onClick={() => confirm(`¿Borrar "${r.descripcion}"?`) && borrar.mutate(r.id)}
                  >
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function RecurrenteForm({ recurrente, onDone }: { recurrente?: Recurrente; onDone: () => void }) {
  const { data: categorias = [] } = useCategorias()
  const guardar = useGuardarRecurrente()
  const [categoriaId, setCategoriaId] = useState(recurrente?.categoria_id ?? 21)
  const [descripcion, setDescripcion] = useState(recurrente?.descripcion ?? '')
  const [modo, setModo] = useState<'fijo' | 'variable'>(recurrente?.modo ?? 'fijo')
  const [monto, setMonto] = useState(recurrente?.monto != null ? String(recurrente.monto) : '')
  const [moneda, setMoneda] = useState<Moneda>(recurrente?.moneda ?? 'ARS')
  const [dia, setDia] = useState(String(recurrente?.dia_del_mes ?? 10))

  const grupos = [...Map.groupBy(categorias, (c) => c.grupo).entries()]

  function enviar(e: FormEvent) {
    e.preventDefault()
    guardar.mutate(
      {
        id: recurrente?.id,
        input: {
          categoria_id: categoriaId,
          descripcion: descripcion.trim(),
          modo,
          monto: modo === 'fijo' ? Number(monto) : null,
          moneda,
          dia_del_mes: Number(dia),
        },
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-6">
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs text-ink-2">Categoría</span>
        <select className="field" value={categoriaId} onChange={(e) => setCategoriaId(Number(e.target.value))}>
          {grupos.map(([grupo, cats]) => (
            <optgroup key={grupo} label={grupo}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="sm:col-span-4">
        <span className="mb-1 block text-xs text-ink-2">Descripción</span>
        <input
          required
          className="field"
          placeholder="Ej. Fibra 300MB"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs text-ink-2">Modo</span>
        <select className="field" value={modo} onChange={(e) => setModo(e.target.value as 'fijo' | 'variable')}>
          <option value="fijo">Fijo (se carga solo)</option>
          <option value="variable">Variable (queda pendiente)</option>
        </select>
      </label>
      <label className="sm:col-span-1">
        <span className="mb-1 block text-xs text-ink-2">Monto</span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          required={modo === 'fijo'}
          disabled={modo === 'variable'}
          className="field tabular disabled:opacity-50"
          value={modo === 'fijo' ? monto : ''}
          onChange={(e) => setMonto(e.target.value)}
        />
      </label>
      <label className="sm:col-span-1">
        <span className="mb-1 block text-xs text-ink-2">Moneda</span>
        <select className="field" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
          <option>ARS</option>
          <option>USD</option>
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs text-ink-2">Día del mes</span>
        <input
          type="number"
          min="1"
          max="31"
          required
          className="field tabular"
          value={dia}
          onChange={(e) => setDia(e.target.value)}
        />
      </label>
      <div className="flex items-center justify-end gap-2 sm:col-span-6">
        {guardar.error && <p className="mr-auto text-sm text-bad">{guardar.error.message}</p>}
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancelar
        </button>
        <button className="btn-primary" disabled={guardar.isPending}>
          {recurrente ? 'Guardar' : 'Crear'}
        </button>
      </div>
    </form>
  )
}
