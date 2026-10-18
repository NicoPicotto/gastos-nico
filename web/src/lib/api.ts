import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Categoria, Movimiento, MovimientoInput, Recurrente, RecurrenteInput } from './types'

function check<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

export function useCategorias() {
  return useQuery({
    queryKey: ['categorias'],
    staleTime: Infinity,
    queryFn: async (): Promise<Categoria[]> => {
      const rows = check(
        await supabase
          .from('categorias')
          .select('id, nombre, tipo, orden, grupo_id, grupos(nombre, orden, color_slot)')
          .order('grupo_id')
          .order('orden'),
      )
      return rows.map((r) => {
        const g = r.grupos as unknown as { nombre: string; orden: number; color_slot: number | null }
        return {
          id: r.id,
          nombre: r.nombre,
          tipo: r.tipo,
          orden: r.orden,
          grupo_id: r.grupo_id,
          grupo: g.nombre,
          grupo_orden: g.orden,
          color_slot: g.color_slot,
        }
      })
    },
  })
}

export function useMovimientos(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['movimientos', desde, hasta],
    queryFn: async (): Promise<Movimiento[]> =>
      check(
        await supabase
          .from('movimientos_v')
          .select('*')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('fecha', { ascending: false })
          .order('id', { ascending: false }),
      ),
  })
}

export function usePendientes() {
  return useQuery({
    queryKey: ['movimientos', 'pendientes'],
    queryFn: async (): Promise<Movimiento[]> =>
      check(await supabase.from('movimientos_v').select('*').eq('estado', 'pendiente').order('fecha')),
  })
}

export function useCotizacion() {
  return useQuery({
    queryKey: ['cotizacion'],
    queryFn: async (): Promise<{ fecha: string; mep_venta: number } | null> =>
      check(
        await supabase
          .from('cotizaciones')
          .select('fecha, mep_venta')
          .order('fecha', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
  })
}

export function useRecurrentes() {
  return useQuery({
    queryKey: ['recurrentes'],
    queryFn: async (): Promise<Recurrente[]> =>
      check(await supabase.from('recurrentes').select('*').order('dia_del_mes')),
  })
}

/** Cotización a congelar en un movimiento USD cargado desde la web. */
async function cotizacionParaGuardar(moneda: 'ARS' | 'USD'): Promise<number | null> {
  if (moneda === 'ARS') return null
  const row = check<{ mep_venta: number } | null>(
    await supabase.from('cotizaciones').select('mep_venta').order('fecha', { ascending: false }).limit(1).maybeSingle(),
  )
  if (!row) throw new Error('No hay cotización MEP cargada todavía.')
  return Number(row.mep_venta)
}

function useInvalidar(...keys: string[]) {
  const qc = useQueryClient()
  return () => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })))
}

export function useGuardarMovimiento() {
  const invalidar = useInvalidar('movimientos')
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: MovimientoInput }) => {
      const row = { ...input, cotizacion_mep: await cotizacionParaGuardar(input.moneda) }
      if (id) check(await supabase.from('movimientos').update({ ...row, estado: 'confirmado' }).eq('id', id))
      else check(await supabase.from('movimientos').insert({ ...row, origen: 'web' }))
    },
    onSuccess: invalidar,
  })
}

export function useBorrarMovimiento() {
  const invalidar = useInvalidar('movimientos')
  return useMutation({
    mutationFn: async (id: number) => {
      check(await supabase.from('movimientos').delete().eq('id', id))
    },
    onSuccess: invalidar,
  })
}

export function useGuardarRecurrente() {
  const invalidar = useInvalidar('recurrentes')
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: Partial<RecurrenteInput> & { activo?: boolean } }) => {
      if (id) check(await supabase.from('recurrentes').update(input).eq('id', id))
      else check(await supabase.from('recurrentes').insert(input))
    },
    onSuccess: invalidar,
  })
}

export function useBorrarRecurrente() {
  const invalidar = useInvalidar('recurrentes')
  return useMutation({
    mutationFn: async (id: number) => {
      check(await supabase.from('recurrentes').delete().eq('id', id))
    },
    onSuccess: invalidar,
  })
}
