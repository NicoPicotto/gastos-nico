import { db, hoyAR } from "./db.ts";

const DOLAR_API_MEP = "https://dolarapi.com/v1/dolares/bolsa";
/** Antigüedad máxima del cache antes de volver a consultar la API. */
const CACHE_MAX_MS = 60 * 60 * 1000;

export interface Cotizacion {
  venta: number;
  fecha: string;
  fuente: "api" | "cache";
}

/** Consulta dolarapi.com y guarda la cotización MEP del día. */
export async function refrescarMep(): Promise<Cotizacion> {
  const res = await fetch(DOLAR_API_MEP, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`dolarapi respondió ${res.status}`);
  const { venta } = (await res.json()) as { venta: number };
  if (!(venta > 0)) throw new Error("dolarapi devolvió una cotización inválida");

  const fecha = hoyAR();
  const { error } = await db()
    .from("cotizaciones")
    .upsert({ fecha, mep_venta: venta, actualizado_at: new Date().toISOString() });
  if (error) throw error;
  return { venta, fecha, fuente: "api" };
}

/**
 * Cotización MEP vigente: usa el cache si es reciente; si la API falla,
 * cae a la última cotización guardada.
 */
export async function obtenerMep(): Promise<Cotizacion> {
  const { data: cache } = await db()
    .from("cotizaciones")
    .select("fecha, mep_venta, actualizado_at")
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fresca = cache &&
    cache.fecha === hoyAR() &&
    Date.now() - new Date(cache.actualizado_at).getTime() < CACHE_MAX_MS;
  if (fresca) return { venta: Number(cache.mep_venta), fecha: cache.fecha, fuente: "cache" };

  try {
    return await refrescarMep();
  } catch (err) {
    if (cache) return { venta: Number(cache.mep_venta), fecha: cache.fecha, fuente: "cache" };
    throw err;
  }
}
