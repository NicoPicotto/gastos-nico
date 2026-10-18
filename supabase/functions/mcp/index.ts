// Servidor MCP remoto (Streamable HTTP, stateless).
// URL: https://<ref>.supabase.co/functions/v1/mcp/<MCP_TOKEN>
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { timingSafeEqual } from "hono/utils/buffer";
import { db } from "../_shared/db.ts";
import { type Categoria, registrarTools } from "./tools.ts";

const INSTRUCCIONES = `
Registro de gastos e ingresos personales de Nico (Córdoba, Argentina).
- Respondé en español rioplatense, breve.
- Fechas en hora de Argentina. Si no se aclara la fecha, es hoy (omití el parámetro). Para "ayer", "el lunes", etc. llamá a fecha_actual.
- Moneda por defecto ARS (pesos); USD solo si el usuario dice explícitamente dólares. "lucas" = miles ("12 lucas" = 12000).
- Al responder, nombrá la moneda en palabras ("20.000 pesos"), nunca el signo "$" solo: se confunde con dólares, sobre todo por voz.
- Las categorías son fijas: elegí la más adecuada de la lista. Súper, kioscos y almacén van a "Supermercado". Si ninguna encaja, usá "Otros" y aclaralo.
- Compras con TARJETA DE CRÉDITO: NO las registres. Avisá que entran con el pago del resumen (categoría "Tarjeta crédito"). Débito, efectivo y transferencia sí se registran.
- Si el pago corresponde a un recurrente pendiente (luz, gas, resumen de tarjeta), registrar_movimiento lo confirma solo.
- Si te mandan una foto de un ticket, extraé total, fecha y comercio, y registralo.
- Ante ambigüedad (monto, categoría o medio de pago crítico), preguntá antes de cargar. Antes de borrar, confirmá.
`.trim();

let categoriasCache: Categoria[] | undefined;

async function cargarCategorias(): Promise<Categoria[]> {
  if (categoriasCache) return categoriasCache;
  const { data, error } = await db()
    .from("categorias")
    .select("id, nombre, tipo, grupos(nombre, orden), orden")
    .order("grupo_id")
    .order("orden");
  if (error) throw error;
  categoriasCache = data.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    tipo: c.tipo,
    grupo: (c.grupos as unknown as { nombre: string }).nombre,
  }));
  return categoriasCache;
}

async function crearServidor(): Promise<McpServer> {
  const server = new McpServer(
    { name: "gastos-nico", version: "1.0.0" },
    { instructions: INSTRUCCIONES },
  );
  registrarTools(server, await cargarCategorias());
  return server;
}

const app = new Hono().basePath("/mcp");

app.all("/:token", async (c) => {
  const esperado = Deno.env.get("MCP_TOKEN");
  if (!esperado || !(await timingSafeEqual(c.req.param("token"), esperado))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  // Stateless: sin stream SSE de servidor a cliente (GET) ni sesiones (DELETE).
  if (c.req.method !== "POST") {
    return c.json({ error: "method not allowed" }, 405, { Allow: "POST" });
  }

  // Un servidor y transporte por request.
  const server = await crearServidor();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

app.all("*", (c) => c.json({ error: "not found" }, 404));

Deno.serve(app.fetch);
