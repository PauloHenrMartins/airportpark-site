import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

type ListaStatRow = { lista: number };

/**
 * Retorna números de lista distintos presentes em `email_lista`.
 *
 * O select direto `.from("email_lista").select("lista")` respeita o limite
 * padrão de 1000 linhas do PostgREST — com listas grandes (ex.: Plan 16),
 * listas novas nunca aparecem no dropdown. O RPC agrupa no banco com DISTINCT.
 */
export async function fetchListasDisponiveis(
  supabase?: SupabaseClient
): Promise<number[]> {
  const client = supabase ?? createClient();

  const { data, error } = await client.rpc("get_stats_por_lista");

  if (!error && data) {
    return (data as ListaStatRow[])
      .map((r) => r.lista)
      .sort((a, b) => a - b);
  }

  return fetchListasComPaginacao(client);
}

async function fetchListasComPaginacao(
  supabase: SupabaseClient
): Promise<number[]> {
  const unique = new Set<number>();
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("email_lista")
      .select("lista")
      .order("lista", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) break;

    for (const row of data) {
      unique.add((row as { lista: number }).lista);
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return Array.from(unique).sort((a, b) => a - b);
}
