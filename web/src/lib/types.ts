export type Tipo = 'gasto' | 'ingreso'
export type Moneda = 'ARS' | 'USD'
export type MedioPago = 'debito' | 'efectivo' | 'transferencia' | 'otro'
export type Estado = 'confirmado' | 'pendiente'

export const MEDIOS_PAGO: { value: MedioPago; label: string }[] = [
  { value: 'debito', label: 'Débito' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'otro', label: 'Otro' },
]

export interface Categoria {
  id: number
  nombre: string
  tipo: Tipo
  orden: number
  grupo_id: number
  grupo: string
  grupo_orden: number
  color_slot: number | null
}

export interface Movimiento {
  id: number
  categoria_id: number
  categoria: string
  tipo: Tipo
  grupo_id: number
  grupo: string
  color_slot: number | null
  monto: number | null
  moneda: Moneda
  cotizacion_mep: number | null
  monto_ars: number | null
  fecha: string
  descripcion: string | null
  medio_pago: MedioPago | null
  estado: Estado
  recurrente_id: number | null
  origen: 'mcp' | 'web' | 'cron'
}

export interface Recurrente {
  id: number
  categoria_id: number
  descripcion: string
  modo: 'fijo' | 'variable'
  monto: number | null
  moneda: Moneda
  dia_del_mes: number
  activo: boolean
  ultimo_generado: string | null
}

export interface MovimientoInput {
  categoria_id: number
  monto: number
  moneda: Moneda
  fecha: string
  descripcion: string | null
  medio_pago: MedioPago | null
}

export interface RecurrenteInput {
  categoria_id: number
  descripcion: string
  modo: 'fijo' | 'variable'
  monto: number | null
  moneda: Moneda
  dia_del_mes: number
}
