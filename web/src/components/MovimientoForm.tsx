import { useState, type FormEvent } from 'react'
import { useCategorias, useGuardarMovimiento } from '../lib/api'
import { hoyAR } from '../lib/format'
import { MEDIOS_PAGO, type MedioPago, type Moneda, type Movimiento } from '../lib/types'

interface Props {
  movimiento?: Movimiento
  onDone: () => void
}

export function MovimientoForm({ movimiento, onDone }: Props) {
  const { data: categorias = [] } = useCategorias()
  const guardar = useGuardarMovimiento()
  const [categoriaId, setCategoriaId] = useState(movimiento?.categoria_id ?? 1)
  const [monto, setMonto] = useState(movimiento?.monto != null ? String(movimiento.monto) : '')
  const [moneda, setMoneda] = useState<Moneda>(movimiento?.moneda ?? 'ARS')
  const [fecha, setFecha] = useState(movimiento?.fecha ?? hoyAR())
  const [medio, setMedio] = useState<MedioPago | ''>(movimiento?.medio_pago ?? 'debito')
  const [descripcion, setDescripcion] = useState(movimiento?.descripcion ?? '')

  const grupos = [...Map.groupBy(categorias, (c) => c.grupo).entries()]

  function enviar(e: FormEvent) {
    e.preventDefault()
    guardar.mutate(
      {
        id: movimiento?.id,
        input: {
          categoria_id: categoriaId,
          monto: Number(monto),
          moneda,
          fecha,
          medio_pago: medio || null,
          descripcion: descripcion.trim() || null,
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
      <label className="sm:col-span-1">
        <span className="mb-1 block text-xs text-ink-2">Monto</span>
        <input
          type="number"
          required
          min="0.01"
          step="0.01"
          inputMode="decimal"
          className="field tabular"
          value={monto}
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
        <span className="mb-1 block text-xs text-ink-2">Fecha</span>
        <input type="date" required className="field" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs text-ink-2">Medio de pago</span>
        <select className="field" value={medio} onChange={(e) => setMedio(e.target.value as MedioPago | '')}>
          <option value="">—</option>
          {MEDIOS_PAGO.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-4">
        <span className="mb-1 block text-xs text-ink-2">Descripción</span>
        <input className="field" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </label>
      <div className="flex items-center justify-end gap-2 sm:col-span-6">
        {guardar.error && <p className="mr-auto text-sm text-bad">{guardar.error.message}</p>}
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancelar
        </button>
        <button className="btn-primary" disabled={guardar.isPending}>
          {movimiento ? 'Guardar' : 'Agregar'}
        </button>
      </div>
    </form>
  )
}
