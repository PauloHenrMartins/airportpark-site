# Modificação — Lotes Expansíveis por Lista no Dashboard

Edite apenas `app/dashboard/page.tsx`. Não altere nenhum outro arquivo.

---

## Passo 1 — Criar função SQL no Supabase

Rode este SQL no Supabase SQL Editor antes de editar o código:

```sql
CREATE OR REPLACE FUNCTION get_lotes_por_lista()
RETURNS TABLE(
  lista integer,
  enviado_em timestamptz,
  total bigint,
  enviados bigint,
  erros bigint
)
LANGUAGE sql AS $$
  SELECT 
    lista,
    enviado_em,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'success') as enviados,
    COUNT(*) FILTER (WHERE status = 'error') as erros
  FROM email_lista
  WHERE enviado_em IS NOT NULL
  GROUP BY lista, enviado_em
  ORDER BY lista DESC, enviado_em DESC;
$$;
```

---

## Passo 2 — Editar `app/dashboard/page.tsx`

### Adicionar tipo LoteStat

Após o tipo `ListaStat`, adicione:

```typescript
type LoteStat = {
  lista: number;
  enviado_em: string;
  total: number;
  enviados: number;
  erros: number;
};
```

### Adicionar estados

Após `const [listaLoading, setListaLoading] = useState(true);`, adicione:

```typescript
const [loteStats, setLoteStats] = useState<LoteStat[]>([]);
const [expandedListas, setExpandedListas] = useState<Set<number>>(new Set());
```

### Adicionar fetch de lotes

Após a função `fetchListaStats`, adicione:

```typescript
const fetchLoteStats = useCallback(async () => {
  try {
    const { data } = await supabase.rpc("get_lotes_por_lista");
    setLoteStats(data ?? []);
  } catch {
    // silencia erro
  }
}, [supabase]);
```

### Adicionar toggle de expansão

Após `fetchLoteStats`, adicione:

```typescript
function toggleLista(lista: number) {
  setExpandedListas((prev) => {
    const next = new Set(prev);
    if (next.has(lista)) {
      next.delete(lista);
    } else {
      next.add(lista);
    }
    return next;
  });
}
```

### Atualizar useEffect

Substitua o useEffect existente por:

```typescript
useEffect(() => {
  setLoading(true);
  Promise.all([
    fetchStats(),
    fetchChart(),
    fetchListaStats(),
    fetchLoteStats(),
  ]).finally(() => setLoading(false));
}, [fetchStats, fetchChart, fetchListaStats, fetchLoteStats]);
```

### Substituir a seção `{/* Stats por lista */}`

Substitua todo o bloco `{/* Stats por lista */}` pelo código abaixo:

```tsx
{/* Stats por lista com lotes expansíveis */}
<div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
  <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
    <div>
      <h2 className="text-base font-semibold text-gray-900">
        Progresso por Lista
      </h2>
      <p className="text-xs text-gray-500 mt-0.5">
        Clique em uma lista para ver os lotes de disparo
      </p>
    </div>
    <button
      onClick={() => { fetchListaStats(); fetchLoteStats(); }}
      disabled={listaLoading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 text-gray-700 transition-colors"
    >
      {listaLoading ? "Atualizando..." : "↻ Atualizar"}
    </button>
  </div>

  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200 text-sm">
      <thead className="bg-gray-50">
        <tr>
          {["", "Lista", "Total", "Enviados", "Pendentes", "Erros", "Progresso"].map((h) => (
            <th
              key={h}
              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-100">
        {listaLoading ? (
          <tr>
            <td colSpan={7} className="px-5 py-8 text-center text-gray-400">
              Carregando...
            </td>
          </tr>
        ) : listaStats.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-5 py-8 text-center text-gray-400">
              Nenhum dado encontrado.
            </td>
          </tr>
        ) : (
          listaStats.map((row) => {
            const pct =
              row.total > 0
                ? Math.round((row.enviados / row.total) * 100)
                : 0;
            const barColor =
              pct >= 80
                ? "bg-green-500"
                : pct >= 40
                  ? "bg-yellow-400"
                  : "bg-red-400";
            const isExpanded = expandedListas.has(row.lista);
            const lotes = loteStats.filter((l) => l.lista === row.lista);

            return (
              <>
                {/* Linha principal da lista */}
                <tr
                  key={`lista-${row.lista}`}
                  className="hover:bg-gray-50 cursor-pointer select-none"
                  onClick={() => toggleLista(row.lista)}
                >
                  <td className="px-4 py-3 text-gray-400 w-8">
                    <span className="text-xs">
                      {isExpanded ? "▼" : "▶"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    Plan {row.lista}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {Number(row.total).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-green-700 font-medium">
                    {Number(row.enviados).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {Number(row.pendentes).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-red-600">
                    {Number(row.erros).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 w-48">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${barColor} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-8 text-right">
                        {pct}%
                      </span>
                    </div>
                  </td>
                </tr>

                {/* Linhas de lotes (sub-tabela expansível) */}
                {isExpanded && (
                  <tr key={`lotes-${row.lista}`}>
                    <td colSpan={7} className="bg-gray-50 px-0 py-0">
                      {lotes.length === 0 ? (
                        <p className="px-12 py-3 text-xs text-gray-400">
                          Nenhum lote encontrado para esta lista.
                        </p>
                      ) : (
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="pl-12 pr-4 py-2 text-left font-medium text-gray-400 uppercase tracking-wider">
                                Data / Hora
                              </th>
                              <th className="px-4 py-2 text-left font-medium text-gray-400 uppercase tracking-wider">
                                Qtd
                              </th>
                              <th className="px-4 py-2 text-left font-medium text-gray-400 uppercase tracking-wider">
                                Sucesso
                              </th>
                              <th className="px-4 py-2 text-left font-medium text-gray-400 uppercase tracking-wider">
                                Erros
                              </th>
                              <th className="px-4 py-2 text-left font-medium text-gray-400 uppercase tracking-wider">
                                Taxa
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {lotes.map((lote, idx) => {
                              const lotePct =
                                lote.total > 0
                                  ? Math.round((lote.enviados / lote.total) * 100)
                                  : 0;
                              return (
                                <tr
                                  key={idx}
                                  className="border-b border-gray-100 last:border-0 hover:bg-gray-100"
                                >
                                  <td className="pl-12 pr-4 py-2 text-gray-600 font-mono">
                                    {new Date(lote.enviado_em).toLocaleString("pt-BR", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      second: "2-digit",
                                    })}
                                  </td>
                                  <td className="px-4 py-2 text-gray-700 font-medium">
                                    {Number(lote.total).toLocaleString("pt-BR")}
                                  </td>
                                  <td className="px-4 py-2 text-green-700">
                                    {Number(lote.enviados).toLocaleString("pt-BR")}
                                  </td>
                                  <td className="px-4 py-2 text-red-600">
                                    {Number(lote.erros).toLocaleString("pt-BR")}
                                  </td>
                                  <td className="px-4 py-2">
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                        lotePct === 100
                                          ? "bg-green-100 text-green-800"
                                          : lotePct >= 80
                                            ? "bg-yellow-100 text-yellow-800"
                                            : "bg-red-100 text-red-800"
                                      }`}
                                    >
                                      {lotePct}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })
        )}
      </tbody>
    </table>
  </div>
</div>
```

---

## Resumo

1. Rode o SQL no Supabase primeiro
2. Edite apenas `app/dashboard/page.tsx`
3. Não altere nenhum outro arquivo
4. Não mude layout, tema ou autenticação
5. Teste com `npm run dev`

**Comportamento esperado:**
- Cada linha de lista tem um ▶ no início
- Clicar na linha expande e mostra os lotes abaixo
- Clicar novamente recolhe
- Cada lote mostra: data/hora, quantidade, sucesso, erros, taxa %
