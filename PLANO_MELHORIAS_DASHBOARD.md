# Plano de Implementação — Melhorias Dashboard e Disparar

## Objetivo

1. Juntar "Suprimidos" como métrica dentro do bloco AWS SES
2. Remover card separado de Suppression List
3. Substituir "Total pendentes" por 3 novos cards: Para enviar / Duplicatas / Inválidos
4. Adicionar nova tabela "Quantidade por Lista" no dashboard
5. Nova função SQL `get_quantidade_por_lista`
6. Página `/disparar` — remover 3 cards e colunas Planilha/Acumulado da tabela
7. Página `/listas` — adicionar explicação do regex em linguagem simples
8. Corrigir bug de duplicatas internas no CSV

---

## Etapa 1 — Nova função SQL `get_quantidade_por_lista`

Rodar no SQL Editor do Supabase:

```sql
CREATE OR REPLACE FUNCTION get_quantidade_por_lista()
RETURNS TABLE(
  lista integer,
  para_enviar bigint,
  enviados bigint,
  erros bigint,
  invalidos bigint,
  duplicatas bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    el.lista,
    COUNT(*) FILTER (WHERE el.enviado_em IS NULL AND el.status IS NULL) AS para_enviar,
    COUNT(*) FILTER (WHERE el.status = 'success') AS enviados,
    COUNT(*) FILTER (WHERE el.status = 'error') AS erros,
    COUNT(*) FILTER (WHERE el.status = 'invalid') AS invalidos,
    COUNT(*) FILTER (WHERE el.status = 'duplicate') AS duplicatas
  FROM email_lista el
  GROUP BY el.lista
  ORDER BY el.lista DESC;
END;
$$;
```

### Teste da Etapa 1

```sql
SELECT * FROM get_quantidade_por_lista();
-- Esperado: uma linha por lista com contagens em cada coluna
-- para_enviar deve ser menor que o total (exclui invalid, duplicate, error)
```

---

## Etapa 2 — Atualizar `app/dashboard/page.tsx`

### 2.1 — Adicionar type e state para nova tabela

Adicionar o type junto aos outros no topo do arquivo:

```typescript
type QuantidadeStat = {
  lista: number;
  para_enviar: number;
  enviados: number;
  erros: number;
  invalidos: number;
  duplicatas: number;
};
```

Adicionar os states:

```typescript
const [quantidadeStats, setQuantidadeStats] = useState<QuantidadeStat[]>([]);
const [quantidadeLoading, setQuantidadeLoading] = useState(true);
```

Adicionar os novos counts para os cards:

```typescript
const [paraEnviarCount, setParaEnviarCount] = useState(0);
const [duplicatasCount, setDuplicatasCount] = useState(0);
const [invalidosCount, setInvalidosCount] = useState(0);
```

### 2.2 — Atualizar `fetchStats`

Localizar a função `fetchStats` e substituir por:

```typescript
const fetchStats = useCallback(async () => {
  const [successRes, errorRes, paraEnviarRes, duplicatasRes, invalidosRes] =
    await Promise.all([
      supabase
        .from("email_lista")
        .select("id", { count: "exact", head: true })
        .eq("status", "success"),
      supabase
        .from("email_lista")
        .select("id", { count: "exact", head: true })
        .eq("status", "error"),
      supabase
        .from("email_lista")
        .select("id", { count: "exact", head: true })
        .is("enviado_em", null)
        .is("status", null),
      supabase
        .from("email_lista")
        .select("id", { count: "exact", head: true })
        .eq("status", "duplicate"),
      supabase
        .from("email_lista")
        .select("id", { count: "exact", head: true })
        .eq("status", "invalid"),
    ]);
  setSuccessCount(successRes.count ?? 0);
  setErrorCount(errorRes.count ?? 0);
  setParaEnviarCount(paraEnviarRes.count ?? 0);
  setDuplicatasCount(duplicatasRes.count ?? 0);
  setInvalidosCount(invalidosRes.count ?? 0);
}, [supabase]);
```

### 2.3 — Adicionar fetch de quantidade por lista

Adicionar função após `fetchLoteStats`:

```typescript
const fetchQuantidadeStats = useCallback(async () => {
  try {
    const { data } = await supabase.rpc("get_quantidade_por_lista");
    setQuantidadeStats(data ?? []);
  } catch {
    // silencia erro
  } finally {
    setQuantidadeLoading(false);
  }
}, [supabase]);
```

Adicionar no `useEffect` inicial dentro do `Promise.all`:

```typescript
await Promise.all([
  fetchStats(),
  fetchChart(),
  fetchListaStats(true),
  fetchLoteStats(),
  fetchQuantidadeStats(), // ← linha nova
]);
```

### 2.4 — Juntar Suprimidos no bloco AWS SES

Localizar o bloco de métricas AWS — o `grid` com as 5 colunas:

```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
```

Substituir por `lg:grid-cols-6` e adicionar nova coluna "Suprimidos" após "Reclamação":

```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
  {/* ... colunas existentes (Enviados, Entregues, Abertura, Bounce, Reclamação) ... */}

  {/* Nova coluna Suprimidos */}
  <div className="text-center">
    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
      Suprimidos
    </p>
    <p className={`text-2xl font-bold ${
      suppressionLoading
        ? "text-gray-300"
        : (suppressionData?.total ?? 0) === 0
          ? "text-green-600"
          : "text-red-600"
    }`}>
      {suppressionLoading ? "—" : (suppressionData?.total ?? 0)}
    </p>
  </div>
</div>
```

### 2.5 — Remover card separado de Suppression List

Remover completamente o bloco:

```tsx
{/* Card Suppression List — AWS SES */}
<div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6">
  ...
</div>
```

**Atenção:** manter os states e a função `fetchSuppression` — ainda são usados para
atualizar o Supabase e para o novo card de suprimidos no bloco AWS.

### 2.6 — Substituir cards de resumo

Localizar o bloco `{/* Summary cards */}`:

```tsx
{/* Summary cards */}
<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
  <div ...>Total enviados</div>
  <div ...>Total pendentes</div>   {/* ← remover */}
  <div ...>Total com erro</div>
</div>
```

Substituir por 5 cards:

```tsx
{/* Summary cards */}
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
  <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
    <p className="text-sm text-gray-500 mb-1">Total enviados</p>
    <p className="text-3xl font-bold text-green-700">
      {loading ? "—" : successCount.toLocaleString("pt-BR")}
    </p>
  </div>
  <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
    <p className="text-sm text-gray-500 mb-1">Para enviar</p>
    <p className="text-3xl font-bold text-blue-700">
      {loading ? "—" : paraEnviarCount.toLocaleString("pt-BR")}
    </p>
  </div>
  <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
    <p className="text-sm text-gray-500 mb-1">Total com erro</p>
    <p className="text-3xl font-bold text-red-700">
      {loading ? "—" : errorCount.toLocaleString("pt-BR")}
    </p>
  </div>
  <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
    <p className="text-sm text-gray-500 mb-1">Duplicatas</p>
    <p className="text-3xl font-bold text-yellow-600">
      {loading ? "—" : duplicatasCount.toLocaleString("pt-BR")}
    </p>
  </div>
  <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
    <p className="text-sm text-gray-500 mb-1">Inválidos</p>
    <p className="text-3xl font-bold text-orange-600">
      {loading ? "—" : invalidosCount.toLocaleString("pt-BR")}
    </p>
  </div>
</div>
```

### 2.7 — Adicionar tabela "Quantidade por Lista"

Adicionar após o gráfico de barras e antes do bloco "Progresso por Lista":

```tsx
{/* Quantidade por Lista */}
<div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-8">
  <div className="px-5 py-4 border-b border-gray-200">
    <h2 className="text-base font-semibold text-gray-900">
      Quantidade por Lista
    </h2>
    <p className="text-xs text-gray-500 mt-0.5">
      Estado atual de cada lista
    </p>
  </div>
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200 text-sm">
      <thead className="bg-gray-50">
        <tr>
          {["Lista", "Para Enviar", "Enviados", "Erros", "Inválidos", "Duplicatas"].map((h) => (
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
        {quantidadeLoading ? (
          <tr>
            <td colSpan={6} className="px-5 py-8 text-center text-gray-400">
              Carregando...
            </td>
          </tr>
        ) : quantidadeStats.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-5 py-8 text-center text-gray-400">
              Nenhum dado encontrado.
            </td>
          </tr>
        ) : (
          quantidadeStats.map((row) => (
            <tr key={row.lista} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">
                Plan {row.lista}
              </td>
              <td className="px-4 py-3 text-blue-700 font-medium">
                {Number(row.para_enviar).toLocaleString("pt-BR")}
              </td>
              <td className="px-4 py-3 text-green-700">
                {Number(row.enviados).toLocaleString("pt-BR")}
              </td>
              <td className="px-4 py-3 text-red-600">
                {Number(row.erros).toLocaleString("pt-BR")}
              </td>
              <td className="px-4 py-3 text-orange-600">
                {Number(row.invalidos).toLocaleString("pt-BR")}
              </td>
              <td className="px-4 py-3 text-yellow-600">
                {Number(row.duplicatas).toLocaleString("pt-BR")}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
</div>
```

---

## Etapa 3 — Atualizar `app/disparar/page.tsx`

### 3.1 — Remover os 3 cards de métricas

Localizar e remover completamente o bloco:

```tsx
{/* Metric cards */}
<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
  <div ...>Emails usados ... 1.932</div>
  <div ...>Meta abertura ... > 30%</div>
  <div ...>Meta spam ... < 0,3%</div>
</div>
```

### 3.2 — Simplificar tabela Fase 1

Localizar o array `fase1Rows`:

```typescript
const fase1Rows = [
  { dia: "Dia 1", volume: 20, planilha: "Plan 16", acumulado: 20 },
  ...
];
```

Substituir por:

```typescript
const fase1Rows = [
  { dia: "Dia 1", volume: 20 },
  { dia: "Dias 2–3", volume: 50 },
  { dia: "Dias 4–7", volume: 100 },
  { dia: "Dias 8–11", volume: 150 },
  { dia: "Dias 12–14", volume: 200 },
];
```

Localizar o cabeçalho da tabela:

```tsx
{["Dia", "Volume/dia", "Planilha", "Acumulado"].map((h) => (
```

Substituir por:

```tsx
{["Dia", "Volume/dia"].map((h) => (
```

Localizar o corpo da tabela e remover as colunas `planilha` e `acumulado`:

```tsx
{fase1Rows.map((row) => (
  <tr key={row.dia} className="hover:bg-gray-50">
    <td className="px-3 py-2 font-medium text-gray-900">
      {row.dia}
    </td>
    <td className="px-3 py-2 text-gray-700">{row.volume}</td>
  </tr>
))}
```

---

## Etapa 4 — Corrigir bug de duplicatas internas no CSV

Arquivo: `app/listas/page.tsx`

### O problema

Dois emails iguais no mesmo CSV passam como `null` porque a verificação de
duplicatas só consulta o banco — não detecta repetições dentro do próprio arquivo.

### A correção

Localizar no `handleProcessar`, após o loop de validação:

```typescript
// Separar válidos e inválidos
const validos: string[] = [];
const invalidos: string[] = [];

for (const linha of linhas) {
  if (isValidEmail(linha)) {
    validos.push(linha);
  } else {
    invalidos.push(linha);
  }
}
```

Adicionar logo após:

```typescript
// Deduplica dentro do próprio CSV
const validosUnicos = [...new Set(validos)];
const duplicatasInternas = validos.length - validosUnicos.length;
```

Substituir todas as ocorrências de `validos` (nas etapas seguintes do processamento)
por `validosUnicos`.

No resumo final, somar as duplicatas internas às duplicatas do banco:

```typescript
setResumo({
  inseridos: validosUnicos.filter((e) => !duplicatasSet.has(e)).length,
  invalidos: invalidos.length,
  duplicatas: duplicatasSet.size + duplicatasInternas, // ← somar aqui
  errosInsercao: totalErros,
});
```

E nos records enviados para a API, adicionar as duplicatas internas como `duplicate`:

```typescript
const records = [
  // Emails válidos únicos não duplicados no banco
  ...validosUnicos
    .filter((e) => !duplicatasSet.has(e))
    .map((e) => ({ email: e, lista: Number(lista), status: null })),
  // Duplicatas no banco
  ...validosUnicos
    .filter((e) => duplicatasSet.has(e))
    .map((e) => ({ email: e, lista: Number(lista), status: "duplicate" as const })),
  // Duplicatas internas do CSV (emails repetidos no mesmo arquivo)
  ...validos
    .filter((e, i) => validos.indexOf(e) !== i) // pega apenas as repetições
    .map((e) => ({ email: e, lista: Number(lista), status: "duplicate" as const })),
  // Inválidos
  ...invalidos.map((e) => ({
    email: e,
    lista: Number(lista),
    status: "invalid" as const,
  })),
];
```

---

## Etapa 5 — Adicionar explicação do regex na página `/listas`

Arquivo: `app/listas/page.tsx`

Adicionar bloco informativo abaixo do `<h2>` "Importar lista de emails",
antes do campo "Número da lista":

```tsx
{/* Explicação do processamento */}
<div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 mb-5">
  <p className="text-xs font-semibold text-blue-800 mb-1">
    O que acontece ao importar?
  </p>
  <ul className="text-xs text-blue-700 space-y-1">
    <li>
      <span className="font-medium">✅ Válido</span> — email com formato correto,
      inserido como pendente para disparo.
    </li>
    <li>
      <span className="font-medium">❌ Inválido</span> — email com formato errado
      (ex: sem @, com espaço, começando com ponto). Inserido como inválido,
      nunca será disparado.
    </li>
    <li>
      <span className="font-medium">⚠️ Duplicata</span> — email que já existe
      nessa lista ou que aparece mais de uma vez no arquivo.
      Inserido como duplicata, nunca será disparado.
    </li>
  </ul>
</div>
```

---

## Testes de Validação

### Teste A — Função SQL
```sql
SELECT * FROM get_quantidade_por_lista();
-- Esperado: lista 16 com para_enviar < total (exclui invalid/duplicate/error)
-- lista 99 deve ter invalidos e duplicatas dos testes anteriores
```

### Teste B — Cards do dashboard
Abrir dashboard e verificar:
- "Total pendentes" não existe mais
- Aparecem: Total enviados / Para enviar / Total com erro / Duplicatas / Inválidos
- "Suprimidos" aparece no bloco AWS SES como 6ª métrica

### Teste C — Tabela Quantidade por Lista
Verificar se aparece no dashboard com colunas corretas e valores coerentes
com os testes A.

### Teste D — Página Disparar simplificada
- 3 cards removidos ✅
- Tabela só tem colunas "Dia" e "Volume/dia" ✅

### Teste E — Bug duplicatas CSV
Criar `teste_dup.csv`:
```
joao@gmail.com
joao@gmail.com
maria@hotmail.com
```
Fazer upload na lista 98.
Esperado:
- 2 inseridos (joao + maria)
- 1 duplicata interna (joao repetido)
- Verificar no Supabase: 1 `null`, 1 `duplicate`, 1 `null`

### Teste F — Explicação na página Listas
Verificar se o bloco azul aparece acima do formulário.

---

## Resumo das Etapas

| # | O que fazer | Onde | Status |
|---|---|---|---|
| 1 | Criar `get_quantidade_por_lista` | Supabase SQL Editor | ⬜ Pendente |
| 2 | Testar função SQL | Supabase SQL Editor | ⬜ Pendente |
| 3 | Atualizar types e states no dashboard | `app/dashboard/page.tsx` | ⬜ Pendente |
| 4 | Atualizar `fetchStats` | `app/dashboard/page.tsx` | ⬜ Pendente |
| 5 | Adicionar `fetchQuantidadeStats` | `app/dashboard/page.tsx` | ⬜ Pendente |
| 6 | Juntar Suprimidos no bloco AWS | `app/dashboard/page.tsx` | ⬜ Pendente |
| 7 | Remover card separado Suppression List | `app/dashboard/page.tsx` | ⬜ Pendente |
| 8 | Substituir cards de resumo (5 novos) | `app/dashboard/page.tsx` | ⬜ Pendente |
| 9 | Adicionar tabela Quantidade por Lista | `app/dashboard/page.tsx` | ⬜ Pendente |
| 10 | Remover 3 cards e simplificar tabela | `app/disparar/page.tsx` | ⬜ Pendente |
| 11 | Corrigir bug duplicatas internas CSV | `app/listas/page.tsx` | ⬜ Pendente |
| 12 | Adicionar explicação do regex | `app/listas/page.tsx` | ⬜ Pendente |
