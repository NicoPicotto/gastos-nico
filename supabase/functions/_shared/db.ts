import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const TZ = "America/Argentina/Cordoba";

let client: SupabaseClient | undefined;

/** Cliente con service role: solo para uso dentro de Edge Functions. */
export function db(): SupabaseClient {
  client ??= createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return client;
}

/** Fecha de hoy en Argentina, formato YYYY-MM-DD. */
export function hoyAR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
