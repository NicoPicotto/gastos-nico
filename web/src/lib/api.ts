import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Categoria, Movimiento, MovimientoInput } from './types'

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

// PostgREST corta cada respuesta en max_rows (1000): se pide por páginas.
const PAGINA = 1000

export function useMovimientos(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['movimientos', desde, hasta],
    queryFn: async (): Promise<Movimiento[]> => {
      const todos: Movimiento[] = []
      for (let from = 0; ; from += PAGINA) {
        const pagina = check<Movimiento[]>(
          await supabase
            .from('movimientos_v')
            .select('*')
            .gte('fecha', desde)
            .lte('fecha', hasta)
            .order('fecha', { ascending: false })
            .order('id', { ascending: false })
            .range(from, from + PAGINA - 1),
        )
        todos.push(...pagina)
        if (pagina.length < PAGINA) return todos
      }
    },
  })
}

/** MEP promedio de cada mes ('YYYY-MM') dentro del rango. */
export function useMepPorMes(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['cotizaciones', desde, hasta],
    queryFn: async (): Promise<Map<string, number>> => {
      const rows = check<{ fecha: string; mep_venta: number }[]>(
        await supabase.from('cotizaciones').select('fecha, mep_venta').gte('fecha', desde).lte('fecha', hasta),
      )
      return new Map(
        [...Map.groupBy(rows, (r) => r.fecha.slice(0, 7)).entries()].map(([mes, rs]) => [
          mes,
          rs.reduce((s, r) => s + Number(r.mep_venta), 0) / rs.length,
        ]),
      )
    },
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
      if (id) check(await supabase.from('movimientos').update(row).eq('id', id))
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
