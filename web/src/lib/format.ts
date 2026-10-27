const TZ = 'America/Argentina/Cordoba'

const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const usd = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usdExacto = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' })
const compacto = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 })

export type Vista = 'ARS' | 'USD'

/** Formatea un total en ARS, o convertido a USD con la cotización indicada. */
export function fmtTotal(montoArs: number, vista: Vista, mep: number | null): string {
  if (vista === 'USD' && mep) return usd.format(montoArs / mep)
  return ars.format(montoArs)
}

/**
 * Valor de un movimiento en la vista elegida. En USD usa el MEP del mes del
 * movimiento (no el de hoy), así los meses viejos no se distorsionan.
 */
export function valorEnVista(
  m: { monto: number; moneda: 'ARS' | 'USD'; monto_ars: number },
  vista: Vista,
  mepMes: number | null | undefined,
): number {
  if (vista === 'ARS') return Number(m.monto_ars)
  if (m.moneda === 'USD') return Number(m.monto)
  return mepMes ? Number(m.monto_ars) / mepMes : 0
}

/** Formatea un número ya expresado en la moneda de la vista. */
export function fmtValor(n: number, vista: Vista): string {
  return (vista === 'USD' ? usd : ars).format(n)
}

export function fmtValorCompacto(n: number, vista: Vista): string {
  return `${vista === 'USD' ? 'US$' : '$'}${compacto.format(n)}`
}

export function fmtMonto(monto: number, moneda: 'ARS' | 'USD'): string {
  return moneda === 'USD' ? usdExacto.format(monto) : ars.format(monto)
}

export const fmtArs = (n: number) => ars.format(n)

export function hoyAR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

export function mesActual(): string {
  return hoyAR().slice(0, 7)
}

/** Suma n meses a un 'YYYY-MM'. */
export function sumarMeses(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function ultimoDia(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

export function nombreMes(mes: string, corto = false): string {
  const [y, m] = mes.split('-').map(Number)
  const nombre = new Intl.DateTimeFormat('es-AR', { month: corto ? 'short' : 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  )
  return corto ? nombre.replace('.', '') : `${nombre[0].toUpperCase()}${nombre.slice(1)} ${y}`
}

export function fmtFecha(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function colorSlot(slot: number | null): string {
  return slot ? `var(--s${slot})` : 'var(--s-neutral)'
}
