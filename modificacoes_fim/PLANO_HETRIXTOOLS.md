# Plano de Implementação — Integração HetrixTools no Dashboard

## Objetivo

Adicionar um card de status de blacklist no dashboard do AirportPark, consumindo
a API do HetrixTools para verificar se o domínio `gruairportpark.com.br` está
listado em alguma blacklist de email.

## Stack

- Next.js 14 (App Router) — rota de API server-side
- HetrixTools API v2 — endpoint de blacklist monitors
- Tailwind CSS + Lucide Icons — visual do card

## Regras Gerais

1. A API Key do HetrixTools fica apenas no servidor — nunca exposta no cliente.
2. A rota `app/api/hetrix/route.ts` segue o mesmo padrão de `app/api/metrics/route.ts`.
3. O card no dashboard segue o padrão visual existente — `bg-white border border-gray-200 rounded-lg shadow-sm`.
4. Se a API falhar, o card mostra estado de erro sem quebrar o dashboard.
5. O botão "Atualizar" do bloco de métricas AWS não afeta o card HetrixTools — cada um tem seu próprio estado.

---

## Variável de Ambiente

Adicionar em `.env.local`:

```env
HETRIXTOOLS_API_KEY=sua_api_key_aqui
```

> Nunca usar `NEXT_PUBLIC_` — a key deve ficar apenas no servidor.

---

## Etapa 1 — Rota de API `app/api/hetrix/route.ts`

### Endpoint utilizado

```
GET https://api.hetrixtools.com/v2/<API_TOKEN>/blacklist/monitors/1/10/
```

### O que a API retorna

A API retorna um array de monitores. Cada monitor tem:
- `Monitor_Label` — nome amigável (ex: "AirportPark - Domínio")
- `Monitor_Target` — domínio ou IP monitorado
- `Blacklisted_Count` — quantas blacklists estão bloqueando
- `Blacklisted_On` — array com os nomes das RBLs que estão bloqueando (vazio se limpo)

### Código completo

```typescript
import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.HETRIXTOOLS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "HETRIXTOOLS_API_KEY não configurada" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://api.hetrixtools.com/v2/${apiKey}/blacklist/monitors/1/10/`,
      { next: { revalidate: 0 } } // sem cache — sempre busca dados frescos
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Erro HetrixTools: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Encontra o monitor do domínio principal
    const monitors = Array.isArray(data) ? data : data?.monitors ?? [];

    const monitor = monitors.find(
      (m: Record<string, unknown>) =>
        String(m.Monitor_Target ?? "")
          .toLowerCase()
          .includes("gruairportpark.com.br")
    ) ?? monitors[0] ?? null;

    if (!monitor) {
      return NextResponse.json({ error: "Monitor não encontrado" }, { status: 404 });
    }

    const blacklistedCount: number = Number(monitor.Blacklisted_Count ?? 0);
    const blacklistedOn: string[] = Array.isArray(monitor.Blacklisted_On)
      ? monitor.Blacklisted_On
      : [];
    const totalRbls: number = Number(monitor.RBLs ?? 23);

    return NextResponse.json({
      domain: monitor.Monitor_Target,
      label: monitor.Monitor_Label,
      blacklistedCount,
      blacklistedOn,
      totalRbls,
      status: blacklistedCount === 0 ? "clean" : "blacklisted",
    });
  } catch {
    return NextResponse.json(
      { error: "Erro ao conectar com HetrixTools" },
      { status: 500 }
    );
  }
}
```

### Teste da Etapa 1

Após criar o arquivo, acessar no browser:
```
http://localhost:3000/api/hetrix
```

Resposta esperada (domínio limpo):
```json
{
  "domain": "gruairportpark.com.br",
  "label": "AirportPark - Domínio",
  "blacklistedCount": 0,
  "blacklistedOn": [],
  "totalRbls": 23,
  "status": "clean"
}
```

---

## Etapa 2 — Atualizar `app/dashboard/page.tsx`

### 2.1 — Adicionar type para os dados do HetrixTools

Adicionar junto aos outros types no topo do arquivo (após os imports):

```typescript
type HetrixData = {
  domain: string;
  label: string;
  blacklistedCount: number;
  blacklistedOn: string[];
  totalRbls: number;
  status: "clean" | "blacklisted";
} | null;
```

### 2.2 — Adicionar state

Localizar os estados existentes no componente e adicionar:

```typescript
const [hetrixData, setHetrixData] = useState<HetrixData>(null);
const [hetrixLoading, setHetrixLoading] = useState(true);
const [hetrixError, setHetrixError] = useState(false);
```

### 2.3 — Adicionar fetch do HetrixTools

Criar função separada para buscar dados do HetrixTools e chamá-la no `useEffect` inicial:

```typescript
async function fetchHetrix() {
  setHetrixLoading(true);
  setHetrixError(false);
  try {
    const res = await fetch("/api/hetrix");
    if (!res.ok) throw new Error();
    const data = await res.json();
    setHetrixData(data);
  } catch {
    setHetrixError(true);
  } finally {
    setHetrixLoading(false);
  }
}
```

Chamar dentro do `useEffect` que já existe no dashboard, junto com as outras chamadas iniciais:

```typescript
useEffect(() => {
  // chamadas já existentes...
  fetchHetrix();
}, []);
```

### 2.4 — Adicionar o card no JSX

Adicionar o card abaixo do bloco de métricas AWS SES, antes da tabela de progresso por lista.

```tsx
{/* Card Blacklist Monitor — HetrixTools */}
<div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6">
  <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
    <div>
      <h2 className="text-sm font-semibold text-gray-900">
        Blacklist Monitor — HetrixTools
      </h2>
      <p className="text-xs text-gray-500 mt-0.5">
        Verificação de listas negras de email
      </p>
    </div>
    {hetrixData && (
      <span className="text-xs text-gray-400">
        {hetrixData.domain}
      </span>
    )}
  </div>

  <div className="px-4 py-4">
    {hetrixLoading && (
      <p className="text-sm text-gray-400">Carregando...</p>
    )}

    {hetrixError && !hetrixLoading && (
      <p className="text-sm text-red-600">
        Erro ao carregar dados do HetrixTools.
      </p>
    )}

    {!hetrixLoading && !hetrixError && hetrixData && (
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Status principal */}
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              hetrixData.status === "clean"
                ? "bg-green-100"
                : "bg-red-100"
            }`}
          >
            {hetrixData.status === "clean" ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            )}
          </div>
          <div>
            <p className={`text-base font-bold ${
              hetrixData.status === "clean" ? "text-green-700" : "text-red-700"
            }`}>
              {hetrixData.status === "clean" ? "Domínio Limpo" : `Listado em ${hetrixData.blacklistedCount} blacklist${hetrixData.blacklistedCount > 1 ? "s" : ""}`}
            </p>
            <p className="text-xs text-gray-500">
              {hetrixData.totalRbls} blacklists verificadas
            </p>
          </div>
        </div>

        {/* Lista de blacklists bloqueando (só aparece se houver) */}
        {hetrixData.blacklistedOn.length > 0 && (
          <div className="flex flex-wrap gap-1.5 sm:ml-4">
            {hetrixData.blacklistedOn.map((rbl) => (
              <span
                key={rbl}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"
              >
                {rbl}
              </span>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
</div>
```

---

## Resultado Esperado no Dashboard

**Domínio limpo (situação atual):**
```
Blacklist Monitor — HetrixTools        gruairportpark.com.br
Verificação de listas negras de email

  ✅  Domínio Limpo
      23 blacklists verificadas
```

**Se cair em alguma blacklist:**
```
Blacklist Monitor — HetrixTools        gruairportpark.com.br
Verificação de listas negras de email

  ❌  Listado em 2 blacklists
      23 blacklists verificadas
      [dbl.spamhaus.org]  [PhishTank]
```

---

## Testes de Validação

### Teste A — Rota de API funcionando
```
GET http://localhost:3000/api/hetrix
```
Esperado: JSON com `status: "clean"`, `blacklistedCount: 0`, `totalRbls: 23`

### Teste B — Variável de ambiente ausente
Remover `HETRIXTOOLS_API_KEY` do `.env.local` temporariamente e acessar a rota.
Esperado: JSON `{ "error": "HETRIXTOOLS_API_KEY não configurada" }` com status 500.
Restaurar a key após o teste.

### Teste C — Card aparece no dashboard
Abrir `http://localhost:3000/dashboard`.
Esperado: card "Blacklist Monitor — HetrixTools" visível com status verde.

### Teste D — Responsividade mobile
Abrir o dashboard no celular.
Esperado: card legível, sem overflow horizontal.

---

## Resumo das Etapas

| # | O que fazer | Onde | Status |
|---|---|---|---|
| 1 | Adicionar `HETRIXTOOLS_API_KEY` no `.env.local` | Arquivo local | ⬜ Pendente |
| 2 | Criar rota `app/api/hetrix/route.ts` | Código | ⬜ Pendente |
| 3 | Atualizar `app/dashboard/page.tsx` | Código | ⬜ Pendente |
| 4 | Testar rota direto no browser | Browser | ⬜ Pendente |
| 5 | Validar card no dashboard | Browser | ⬜ Pendente |
