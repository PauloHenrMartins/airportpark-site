# Plano de Implementação — Suppression List AWS SES no Dashboard

## Objetivo

Adicionar uma seção no dashboard abaixo do card HetrixTools mostrando:
- Total de emails suprimidos pela AWS SES
- Botão para expandir e ver os emails, igual ao "Progresso por Lista"
- Ao expandir: email, motivo (BOUNCE ou COMPLAINT) e data
- Ao carregar: consulta o Supabase e atualiza o `status` de `success` para `error`
  nos emails que estiverem na lista de suprimidos

## Stack

- AWS SDK v3 `@aws-sdk/client-sesv2` — novo client, diferente do CloudWatch
- Supabase — atualização de status dos emails suprimidos
- Next.js 14 App Router — nova rota de API server-side
- Tailwind CSS — visual seguindo padrão existente

## Regras Gerais

1. A rota de API busca a suppression list da AWS e já retorna os dados prontos.
2. A atualização do Supabase acontece **na rota de API** — não no cliente.
3. O card segue exatamente o padrão visual do "Progresso por Lista" existente.
4. Ordenação: mais recentes primeiro (`LastUpdateTime` DESC).
5. Se não houver suprimidos, mostrar `0` e não exibir a tabela expansível.

---

## Etapa 1 — Instalar o pacote SESv2

O projeto já usa `@aws-sdk/client-cloudwatch`. O SESv2 é um pacote separado.

Rodar no terminal do projeto:

```bash
npm install @aws-sdk/client-sesv2
```

### Teste da Etapa 1

```bash
# Verificar se instalou corretamente
cat package.json | grep sesv2
# Esperado: "@aws-sdk/client-sesv2": "^3.x.x"
```

---

## Etapa 2 — Rota de API `app/api/suppression/route.ts`

### O que a rota faz

1. Chama `ListSuppressedDestinationsCommand` no SESv2
2. Ordena por data mais recente
3. Para cada email suprimido, atualiza o Supabase:
   - Busca registros com `email = X` e `status = 'success'`
   - Atualiza para `status = 'error'`
4. Retorna a lista formatada

### Estrutura da resposta AWS

```json
{
  "SuppressedDestinationSummaries": [
    {
      "EmailAddress": "joao@exemplo.com",
      "LastUpdateTime": 1749123456,
      "Reason": "BOUNCE"
    }
  ]
}
```

### Código completo

```typescript
import { NextResponse } from "next/server";
import {
  SESv2Client,
  ListSuppressedDestinationsCommand,
} from "@aws-sdk/client-sesv2";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const sesClient = new SESv2Client({
  region: process.env.AWS_REGION ?? "sa-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Cliente Supabase server-side (usa service role key se disponível, senão anon key)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    // 1. Busca suppression list na AWS
    const cmd = new ListSuppressedDestinationsCommand({
      PageSize: 100,
    });

    const res = await sesClient.send(cmd);
    const items = res.SuppressedDestinationSummaries ?? [];

    // 2. Ordena mais recentes primeiro
    const sorted = [...items].sort(
      (a, b) =>
        (b.LastUpdateTime?.getTime() ?? 0) - (a.LastUpdateTime?.getTime() ?? 0)
    );

    // 3. Atualiza status no Supabase para cada email suprimido
    for (const item of sorted) {
      if (!item.EmailAddress) continue;

      await supabase
        .from("email_lista")
        .update({ status: "error" })
        .eq("email", item.EmailAddress)
        .eq("status", "success");
    }

    // 4. Formata resposta
    const suppressed = sorted.map((item) => ({
      email: item.EmailAddress ?? "",
      reason: item.Reason ?? "BOUNCE",
      date: item.LastUpdateTime
        ? new Date(item.LastUpdateTime).toISOString()
        : null,
    }));

    return NextResponse.json({
      total: suppressed.length,
      items: suppressed,
    });
  } catch (error) {
    console.error("Suppression list error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar suppression list" },
      { status: 500 }
    );
  }
}
```

### Observação sobre SUPABASE_SERVICE_ROLE_KEY

O cliente Supabase no servidor precisa de permissão para fazer UPDATE na tabela.
Se o anon key tiver RLS bloqueando updates, será necessário adicionar a service role key:

```env
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

Encontrada em: Supabase Dashboard → Project Settings → API → `service_role` key.

> **Atenção:** nunca usar `NEXT_PUBLIC_` nessa key — ela deve ficar apenas no servidor.

### Teste da Etapa 2

Acessar no browser:
```
http://localhost:3000/api/suppression
```

Resposta esperada:
```json
{
  "total": 3,
  "items": [
    {
      "email": "exemplo@dominio.com",
      "reason": "BOUNCE",
      "date": "2026-06-09T15:48:55.000Z"
    }
  ]
}
```

---

## Etapa 3 — Atualizar `app/dashboard/page.tsx`

### 3.1 — Adicionar type

Junto aos outros types no topo do arquivo:

```typescript
type SuppressionItem = {
  email: string;
  reason: "BOUNCE" | "COMPLAINT";
  date: string | null;
};

type SuppressionData = {
  total: number;
  items: SuppressionItem[];
} | null;
```

### 3.2 — Adicionar states

```typescript
const [suppressionData, setSuppressionData] = useState<SuppressionData>(null);
const [suppressionLoading, setSuppressionLoading] = useState(true);
const [suppressionError, setSuppressionError] = useState(false);
const [suppressionExpanded, setSuppressionExpanded] = useState(false);
```

### 3.3 — Adicionar função de fetch

```typescript
async function fetchSuppression() {
  setSuppressionLoading(true);
  setSuppressionError(false);
  try {
    const res = await fetch("/api/suppression");
    if (!res.ok) throw new Error();
    const data = await res.json();
    setSuppressionData(data);
  } catch {
    setSuppressionError(true);
  } finally {
    setSuppressionLoading(false);
  }
}
```

Chamar no `useEffect` inicial junto com as outras chamadas:

```typescript
useEffect(() => {
  // chamadas já existentes...
  fetchSuppression();
}, []);
```

### 3.4 — Adicionar card no JSX

Adicionar abaixo do card HetrixTools:

```tsx
{/* Card Suppression List — AWS SES */}
<div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6">
  <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
    <div>
      <h2 className="text-sm font-semibold text-gray-900">
        Suprimidos — AWS SES
      </h2>
      <p className="text-xs text-gray-500 mt-0.5">
        Emails bloqueados por bounce ou reclamação
      </p>
    </div>
  </div>

  <div className="px-4 py-4">
    {suppressionLoading && (
      <p className="text-sm text-gray-400">Carregando...</p>
    )}

    {suppressionError && !suppressionLoading && (
      <p className="text-sm text-red-600">
        Erro ao carregar suppression list.
      </p>
    )}

    {!suppressionLoading && !suppressionError && suppressionData && (
      <>
        {/* Linha clicável com total — igual ao Progresso por Lista */}
        <button
          onClick={() =>
            suppressionData.total > 0 &&
            setSuppressionExpanded((prev) => !prev)
          }
          className={`w-full flex items-center justify-between py-2 ${
            suppressionData.total > 0
              ? "cursor-pointer hover:bg-gray-50"
              : "cursor-default"
          } rounded-md px-2 transition-colors`}
        >
          <div className="flex items-center gap-2">
            {suppressionData.total > 0 && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`text-gray-400 transition-transform ${
                  suppressionExpanded ? "rotate-90" : ""
                }`}
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            )}
            <span className="text-sm font-medium text-gray-700">
              Total suprimidos
            </span>
          </div>
          <span
            className={`text-sm font-bold ${
              suppressionData.total === 0
                ? "text-green-600"
                : "text-red-600"
            }`}
          >
            {suppressionData.total}
          </span>
        </button>

        {/* Tabela expansível — só aparece se expanded e houver itens */}
        {suppressionExpanded && suppressionData.total > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Email", "Motivo", "Data"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {suppressionData.items.map((item) => (
                  <tr key={item.email} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900 font-medium">
                      {item.email}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          item.reason === "BOUNCE"
                            ? "bg-orange-100 text-orange-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {item.reason === "BOUNCE" ? "Bounce" : "Reclamação"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {item.date
                        ? new Date(item.date).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    )}
  </div>
</div>
```

---

## Resultado Esperado no Dashboard

**Com suprimidos (expandido):**
```
Suprimidos — AWS SES
Emails bloqueados por bounce ou reclamação

▶ Total suprimidos                                    3

  EMAIL                    MOTIVO       DATA
  joao@exemplo.com         Bounce       09/06/2026 15:48
  maria@hotmail.com        Bounce       08/06/2026 12:30
  teste@yahoo.com          Reclamação   07/06/2026 09:15
```

**Sem suprimidos:**
```
Suprimidos — AWS SES
Emails bloqueados por bounce ou reclamação

  Total suprimidos                                    0
```

---

## Testes de Validação

### Teste A — Rota retorna dados corretos
```
GET http://localhost:3000/api/suppression
```
Esperado: JSON com `total` e array `items` com email, reason e date.

### Teste B — Supabase atualizado
Após chamar a rota, verificar no Supabase:
```sql
SELECT email, status 
FROM email_lista 
WHERE email IN ('emails_que_aparecem_na_suppression_list');
-- Esperado: status = 'error'
```

### Teste C — Card no dashboard
- Total suprimidos aparece em vermelho se > 0, verde se = 0
- Clicar na linha expande a tabela
- Clicar novamente fecha
- Se total = 0, linha não é clicável

### Teste D — Responsividade
Verificar no mobile que a tabela rola horizontalmente sem quebrar o layout.

---

## Resumo das Etapas

| # | O que fazer | Onde | Status |
|---|---|---|---|
| 1 | `npm install @aws-sdk/client-sesv2` | Terminal | ⬜ Pendente |
| 2 | Verificar/adicionar `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` | Arquivo local | ⬜ Pendente |
| 3 | Criar `app/api/suppression/route.ts` | Código | ⬜ Pendente |
| 4 | Testar rota no browser | Browser | ⬜ Pendente |
| 5 | Atualizar `app/dashboard/page.tsx` | Código | ⬜ Pendente |
| 6 | Validar card e expansão no dashboard | Browser | ⬜ Pendente |
| 7 | Verificar atualização no Supabase | SQL Editor | ⬜ Pendente |
