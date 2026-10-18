import { useState } from 'react'
import { useCotizacion } from '../lib/api'
import { mesActual, nombreMes, sumarMeses, type Vista } from '../lib/format'
import { supabase } from '../lib/supabase'
import { Movimientos } from './Movimientos'
import { Recurrentes } from './Recurrentes'
import { Resumen } from './Resumen'

type Tab = 'resumen' | 'movimientos' | 'recurrentes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'recurrentes', label: 'Recurrentes' },
]

export function Dashboard() {
  const [tab, setTab] = useState<Tab>('resumen')
  const [mes, setMes] = useState(mesActual())
  const [vista, setVista] = useState<Vista>('ARS')
  const { data: cotizacion } = useCotizacion()
  const mep = cotizacion ? Number(cotizacion.mep_venta) : null

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <nav className="flex gap-0.5 rounded-xl bg-surface-2 p-1 sm:gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`btn px-2.5 py-1.5 sm:px-3 ${tab === t.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>
          Salir
        </button>
      </header>

      {tab !== 'recurrentes' && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button className="btn-ghost px-2" aria-label="Mes anterior" onClick={() => setMes(sumarMeses(mes, -1))}>
              ‹
            </button>
            <h1 className="min-w-44 text-center text-lg font-semibold">{nombreMes(mes)}</h1>
            <button
              className="btn-ghost px-2"
              aria-label="Mes siguiente"
              disabled={mes >= mesActual()}
              onClick={() => setMes(sumarMeses(mes, 1))}
            >
              ›
            </button>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {mep && <span className="text-muted tabular">MEP ${mep.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>}
            <div className="flex rounded-lg bg-surface-2 p-0.5">
              {(['ARS', 'USD'] as const).map((v) => (
                <button
                  key={v}
                  disabled={v === 'USD' && !mep}
                  onClick={() => setVista(v)}
                  className={`btn px-2.5 py-1 ${vista === v ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'resumen' && <Resumen mes={mes} vista={vista} mep={mep} />}
      {tab === 'movimientos' && <Movimientos mes={mes} />}
      {tab === 'recurrentes' && <Recurrentes />}
    </div>
  )
}
