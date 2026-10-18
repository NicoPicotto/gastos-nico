// Refresca la cotización MEP. Lo invoca pg_cron (ver migración de cron).
import { refrescarMep } from "../_shared/fx.ts";

Deno.serve(async () => {
  try {
    return Response.json(await refrescarMep());
  } catch (err) {
    console.error(err);
    return Response.json({ error: String(err) }, { status: 502 });
  }
});
