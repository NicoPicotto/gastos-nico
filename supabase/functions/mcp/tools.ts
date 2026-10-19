import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { db, hoyAR } from "../_shared/db.ts";
import { obtenerMep } from "../_shared/fx.ts";

export interface Categoria {
  id: number;
  nombre: string;
  tipo: "gasto" | "ingreso";
  grupo: string;
}

interface MovimientoV {
  id: number;
  categoria: string;
  tipo: "gasto" | "ingreso";
  grupo: string;
  monto: number;
  moneda: "ARS" | "USD";
  cotizacion_mep: number | null;
  monto_ars: number;
  fecha: string;
  descripcion: string | null;
}

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD");
const mesSchema = z.string().regex(/^\d{4}-\d{2}$/, "Formato YYYY-MM");

// Moneda en palabras, nunca "$": la app de Claude (y su voz) lo lee como dólares.
const numArs = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const numUsd = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const fmtArs = { format: (n: number) => `${numArs.format(n)} pesos` };
const fmtUsd = { format: (n: number) => `${numUsd.format(n)} dólares` };

const MONEDA_DESC = 'Casi siempre "ARS" (pesos). "USD" SOLO si el usuario dice explícitamente dólares/USD/verdes.';

function fmtMonto(m: Pick<MovimientoV, "monto" | "moneda" | "monto_ars">): string {
  if (m.moneda === "USD") return `${fmtUsd.format(m.monto)} (≈ ${fmtArs.format(m.monto_ars)})`;
  return fmtArs.format(m.monto);
}

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function linea(m: MovimientoV): string {
  const partes = [`#${m.id}`, fmtFecha(m.fecha), m.categoria, fmtMonto(m)];
  if (m.descripcion) partes.push(`"${m.descripcion}"`);
  return partes.join(" · ");
}

function rangoMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

const ok = (text: string): CallToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): CallToolResult => ({ content: [{ type: "text", text }], isError: true });

/** Envuelve un handler para devolver los errores como resultado de la tool. */
function safe<A>(fn: (args: A) => Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
      return fail(`Error: ${msg}`);
    }
  };
}

async function obtenerMovimiento(id: number): Promise<MovimientoV | null> {
  const { data, error } = await db().from("movimientos_v").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as MovimientoV | null;
}

/** Cotización a guardar: solo para USD. */
async function cotizacionPara(moneda: "ARS" | "USD"): Promise<number | null> {
  return moneda === "USD" ? (await obtenerMep()).venta : null;
}

export function registrarTools(server: McpServer, categorias: Categoria[]) {
  const nombres = categorias.map((c) => c.nombre) as [string, ...string[]];
  const porNombre = new Map(categorias.map((c) => [c.nombre, c]));
  const grupos = [...new Set(categorias.map((c) => c.grupo))] as [string, ...string[]];
  const categoriaSchema = z.enum(nombres).describe(
    "Supermercado: súper, kioscos, almacén, verdulería, carnicería, dietética. " +
      "Gastos Hogar: limpieza, ferretería, arreglos, muebles. Gastos Auto: nafta, mecánico, lavado, estacionamiento. " +
      "Esparcimiento: bares, restaurantes, delivery, cine, recitales, salidas, hobbies, streaming. " +
      "Cápitas Logia: cuota o cápita de la logia. " +
      "Tarjeta crédito: SOLO el pago del resumen. Otros: únicamente si ninguna otra encaja.",
  );

  server.registerTool(
    "fecha_actual",
    {
      description: "Devuelve la fecha de hoy en Argentina. Usala antes de interpretar 'ayer', 'el lunes', etc.",
      annotations: { readOnlyHint: true },
    },
    safe(async () => {
      const hoy = hoyAR();
      const dia = new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Cordoba",
        weekday: "long",
      }).format(new Date());
      return ok(`Hoy es ${dia} ${hoy}.`);
    }),
  );

  server.registerTool(
    "listar_categorias",
    {
      description: "Lista las categorías válidas agrupadas.",
      annotations: { readOnlyHint: true },
    },
    safe(async () => {
      const texto = grupos
        .map((g) => {
          const cats = categorias.filter((c) => c.grupo === g);
          return `${g} (${cats[0].tipo}): ${cats.map((c) => c.nombre).join(", ")}`;
        })
        .join("\n");
      return ok(texto);
    }),
  );

  server.registerTool(
    "registrar_movimiento",
    {
      description:
        "Registra un gasto o ingreso (el tipo lo define la categoría). NO usar para compras con tarjeta de crédito: " +
        "esas entran con el pago del resumen (categoría 'Tarjeta crédito').",
      inputSchema: {
        categoria: categoriaSchema,
        monto: z.number().positive().describe("Monto en la moneda indicada. '12 lucas' = 12000."),
        moneda: z.enum(["ARS", "USD"]).default("ARS").describe(MONEDA_DESC),
        fecha: fechaSchema.optional().describe("YYYY-MM-DD. Por defecto, hoy en Argentina."),
        descripcion: z.string().max(200).optional(),
      },
    },
    safe(async ({ categoria, monto, moneda, fecha, descripcion }) => {
      const cat = porNombre.get(categoria)!;
      const cotizacion_mep = await cotizacionPara(moneda);

      const { data, error } = await db()
        .from("movimientos")
        .insert({
          categoria_id: cat.id,
          monto,
          moneda,
          cotizacion_mep,
          fecha: fecha ?? hoyAR(),
          descripcion: descripcion ?? null,
          origen: "mcp",
        })
        .select("id")
        .single();
      if (error) throw error;
      const mov = (await obtenerMovimiento(data.id))!;
      return ok(`Registrado ${cat.tipo}: ${linea(mov)}`);
    }),
  );

  server.registerTool(
    "listar_movimientos",
    {
      description: "Lista movimientos con filtros opcionales, del más reciente al más antiguo.",
      inputSchema: {
        desde: fechaSchema.optional(),
        hasta: fechaSchema.optional(),
        categoria: categoriaSchema.optional(),
        grupo: z.enum(grupos).optional(),
        tipo: z.enum(["gasto", "ingreso"]).optional(),
        texto: z.string().optional().describe("Busca en la descripción."),
        limite: z.number().int().min(1).max(200).default(30),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ desde, hasta, categoria, grupo, tipo, texto, limite }) => {
      let q = db().from("movimientos_v").select("*");
      if (desde) q = q.gte("fecha", desde);
      if (hasta) q = q.lte("fecha", hasta);
      if (categoria) q = q.eq("categoria", categoria);
      if (grupo) q = q.eq("grupo", grupo);
      if (tipo) q = q.eq("tipo", tipo);
      if (texto) q = q.ilike("descripcion", `%${texto}%`);
      const { data, error } = await q
        .order("fecha", { ascending: false })
        .order("id", { ascending: false })
        .limit(limite);
      if (error) throw error;
      if (!data.length) return ok("No hay movimientos con esos filtros.");
      return ok((data as MovimientoV[]).map(linea).join("\n"));
    }),
  );

  server.registerTool(
    "resumen",
    {
      description:
        "Resumen de un período: gastos por grupo y categoría, ingresos y balance, todo en ARS " +
        "(USD convertidos a la cotización MEP de cada movimiento). Por defecto, el mes actual.",
      inputSchema: {
        mes: mesSchema.optional().describe("YYYY-MM. Ignorado si se pasa desde/hasta."),
        desde: fechaSchema.optional(),
        hasta: fechaSchema.optional(),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ mes, desde, hasta }) => {
      const rango = desde || hasta
        ? { desde: desde ?? "1900-01-01", hasta: hasta ?? hoyAR() }
        : rangoMes(mes ?? hoyAR().slice(0, 7));

      const { data, error } = await db()
        .from("movimientos_v")
        .select("*")
        .gte("fecha", rango.desde)
        .lte("fecha", rango.hasta);
      if (error) throw error;
      const movs = data as MovimientoV[];

      const sumar = (ms: MovimientoV[]) => ms.reduce((s, m) => s + Number(m.monto_ars), 0);
      const gastos = movs.filter((m) => m.tipo === "gasto");
      const ingresos = movs.filter((m) => m.tipo === "ingreso");
      const totalGastos = sumar(gastos);
      const totalIngresos = sumar(ingresos);

      const lineas = [
        `Período ${fmtFecha(rango.desde)} – ${fmtFecha(rango.hasta)} (montos en pesos argentinos)`,
        `Ingresos: ${fmtArs.format(totalIngresos)}`,
        `Gastos: ${fmtArs.format(totalGastos)}`,
        `Balance: ${fmtArs.format(totalIngresos - totalGastos)}` +
        (totalIngresos > 0 ? ` (ahorro ${Math.round(((totalIngresos - totalGastos) / totalIngresos) * 100)}%)` : ""),
        "",
        "Gastos por grupo:",
      ];

      const porGrupo = Map.groupBy(gastos, (m) => m.grupo);
      const gruposOrdenados = [...porGrupo.entries()]
        .map(([g, ms]) => ({ g, ms, total: sumar(ms) }))
        .sort((a, b) => b.total - a.total);
      for (const { g, ms, total } of gruposOrdenados) {
        lineas.push(`- ${g}: ${fmtArs.format(total)}`);
        const porCat = [...Map.groupBy(ms, (m) => m.categoria).entries()]
          .map(([c, cms]) => ({ c, total: sumar(cms) }))
          .sort((a, b) => b.total - a.total);
        for (const { c, total: t } of porCat) lineas.push(`    · ${c}: ${fmtArs.format(t)}`);
      }
      if (!gruposOrdenados.length) lineas.push("- (sin gastos)");
      return ok(lineas.join("\n"));
    }),
  );

  server.registerTool(
    "editar_movimiento",
    {
      description: "Corrige campos de un movimiento existente (por id).",
      inputSchema: {
        id: z.number().int(),
        categoria: categoriaSchema.optional(),
        monto: z.number().positive().optional(),
        moneda: z.enum(["ARS", "USD"]).optional(),
        fecha: fechaSchema.optional(),
        descripcion: z.string().max(200).optional(),
      },
    },
    safe(async ({ id, categoria, moneda, ...resto }) => {
      const actual = await obtenerMovimiento(id);
      if (!actual) return fail(`No existe el movimiento #${id}.`);

      const cambios: Record<string, unknown> = Object.fromEntries(
        Object.entries(resto).filter(([, v]) => v !== undefined),
      );
      if (categoria) cambios.categoria_id = porNombre.get(categoria)!.id;
      if (moneda && moneda !== actual.moneda) {
        cambios.moneda = moneda;
        cambios.cotizacion_mep = await cotizacionPara(moneda);
      }
      if (!Object.keys(cambios).length) return fail("No indicaste ningún cambio.");

      const { error } = await db().from("movimientos").update(cambios).eq("id", id);
      if (error) throw error;
      return ok(`Actualizado: ${linea((await obtenerMovimiento(id))!)}`);
    }),
  );

  server.registerTool(
    "borrar_movimiento",
    {
      description:
        "Borra un movimiento. Pasá SIEMPRE categoría, monto y fecha tal como figuran en listar_movimientos: " +
        "se muestran al usuario al pedir permiso y se validan contra el registro antes de borrar.",
      // Solo id es obligatorio: claude.ai puede tener cacheado un schema viejo (solo id).
      inputSchema: {
        id: z.number().int(),
        categoria: z.enum(nombres).optional(),
        monto: z.number().positive().optional(),
        moneda: z.enum(["ARS", "USD"]).optional(),
        fecha: fechaSchema.optional(),
        descripcion: z.string().optional(),
      },
      annotations: { destructiveHint: true },
    },
    safe(async ({ id, categoria, monto, moneda, fecha }) => {
      const actual = await obtenerMovimiento(id);
      if (!actual) return fail(`No existe el movimiento #${id}.`);
      const coincide = (categoria === undefined || actual.categoria === categoria) &&
        (fecha === undefined || actual.fecha === fecha) &&
        (moneda === undefined || actual.moneda === moneda) &&
        (monto === undefined || Number(actual.monto) === monto);
      if (!coincide) {
        return fail(`Los datos no coinciden con el movimiento #${id}, no se borró nada. El registro es: ${linea(actual)}`);
      }
      const { error } = await db().from("movimientos").delete().eq("id", id);
      if (error) throw error;
      return ok(`Borrado: ${linea(actual)}`);
    }),
  );

  server.registerTool(
    "cotizacion_actual",
    {
      description: "Cotización del dólar MEP (venta) que se usa para convertir USD a ARS.",
      annotations: { readOnlyHint: true },
    },
    safe(async () => {
      const c = await obtenerMep();
      const venta = c.venta.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return ok(`Dólar MEP venta: ${venta} pesos por dólar (${fmtFecha(c.fecha)}).`);
    }),
  );
}
