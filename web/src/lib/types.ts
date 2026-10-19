export type Tipo = 'gasto' | 'ingreso'
export type Moneda = 'ARS' | 'USD'

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
  monto: number
  moneda: Moneda
  cotizacion_mep: number | null
  monto_ars: number
  fecha: string
  descripcion: string | null
  origen: 'mcp' | 'web' | 'cron'
}

export interface MovimientoInput {
  categoria_id: number
  monto: number
  moneda: Moneda
  fecha: string
  descripcion: string | null
}
