# Modificação — Métricas por Lista no Dashboard

Edite apenas `app/dashboard/page.tsx`. Não altere nenhum outro arquivo.

---

## Passo 1 — Criar a função no Supabase

Antes de editar o código, rode este SQL no Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION get_stats_por_lista()
RETURNS TABLE(
  lista integer,
  total bigint,
  enviados bigint,
  pendentes bigint,
  erros bigint
)
LANGUAGE sql AS $$
  SELECT 
    lista,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'success') as enviados,
    COUNT(*) FILTER (WHERE enviado_em IS NULL) as pendentes,
    COUNT(*) FILTER (WHERE status = 'error') as erros
  FROM email_lista
  GROUP BY lista
  ORDER BY lista DESC;
$$;
```

---

## Passo 2 — Editar `app/dashboard/page.tsx`

### Adicionar tipo

Após a definição de `AwsMetrics`, adicione:

```typescript
type ListaStat = {
  lista: number;
  total: number;
  enviados: number;
  pendentes: number;
  erros: number;
};
```

### Adicionar estado

Dentro do componente, após `const [awsLoading, setAwsLoading] = useState(false);`, adicione:

```typescript
const [listaStats, setListaStats] = useState<ListaStat[]>([]);
const [listaLoading, setListaLoading] = useState(true);
```

### Adicionar função de fetch

Após a função `fetchAwsMetrics`, adicione:

```typescript
const fetchListaStats = useCallback(async () => {
  setListaLoading(true);
  try {
    const { data } = await supabase.rpc("get_stats_por_lista");
    setListaStats(data ?? []);
  } catch {
    // silencia erro
  } finally {
    setListaLoading(false);
  }
}, [supabase]);
```

### Atualizar useEffect

Substitua o useEffect existente por:

```typescript
useEffect(() => {
  setLoading(true);
  Promise.all([fetchStats(), fetchChart(), fetchListaStats()]).finally(() =>
    setLoading(false)
  );
}, [fetchStats, fetchChart, fetchListaStats]);
```

### Adicionar seção de tabela por lista

Adicione este bloco após o fechamento do `{/* Chart */}` e antes do fechamento do `<main>`:

```tsx
{/* Stats por lista */}
<div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
  <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
    <div>
      <h2 className="text-base font-semibold text-gray-900">
        Progresso por Lista
      </h2>
      <p className="text-xs text-gray-500 mt-0.5">
        Status de envio agrupado por planilha
      </p>
    </div>
    <button
      onClick={() => fetchListaStats()}
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
          {["Lista", "Total", "Enviados", "Pendentes", "Erros", "Progresso"].map((h) => (
            <th
              key={h}
              className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-100">
        {listaLoading ? (
          <tr>
            <td colSpan={6} className="px-5 py-8 text-center text-gray-400">
              Carregando...
            </td>
          </tr>
        ) : listaStats.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-5 py-8 text-center text-gray-400">
              Nenhum dado encontrado.
            </td>
          </tr>
        ) : (
          listaStats.map((row) => {
            const pct = row.total > 0 ? Math.round((row.enviados / row.total) * 100) : 0;
            const barColor =
              pct >= 80 ? "bg-green-500" : pct >= 40 ? "bg-yellow-400" : "bg-red-400";
            return (
              <tr key={row.lista} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">
                  Plan {row.lista}
                </td>
                <td className="px-5 py-3 text-gray-700">
                  {Number(row.total).toLocaleString("pt-BR")}
                </td>
                <td className="px-5 py-3 text-green-700 font-medium">
                  {Number(row.enviados).toLocaleString("pt-BR")}
                </td>
                <td className="px-5 py-3 text-gray-600">
                  {Number(row.pendentes).toLocaleString("pt-BR")}
                </td>
                <td className="px-5 py-3 text-red-600">
                  {Number(row.erros).toLocaleString("pt-BR")}
                </td>
                <td className="px-5 py-3 w-48">
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
2. Edite apenas `app/dashboard/page.tsx` conforme acima
3. Não altere nenhum outro arquivo
4. Não mude layout, tema ou autenticação
