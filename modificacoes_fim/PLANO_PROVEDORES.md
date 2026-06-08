# Plano de Implementação — Filtro de Provedores por Lista

## Contexto

Sistema de disparo de email marketing (AirportPark) que precisa filtrar provedores
de email por lista antes de disparar. A função SQL `get_emails_para_disparo` deve
retornar apenas emails de domínios autorizados. Se uma lista não tiver nenhum
provedor configurado, nenhum email é retornado (comportamento fechado por padrão).

## Stack

- Next.js 14 (App Router) — `'use client'` em todas as páginas
- Supabase — cliente via `createBrowserClient` em `lib/supabase.ts`
- Tailwind CSS
- Lucide Icons
- TypeScript

## Regras Gerais

1. Nunca salvar dois registros com o mesmo `(lista, dominio)` — usar UPSERT.
2. Lista sem provedores configurados = nenhum email disparado.
3. O botão de disparar em `/disparar` deve validar provedores antes de enviar ao webhook.
4. A página `/provedores` pode ser acessada múltiplas vezes para a mesma lista — sempre atualiza, nunca duplica.
5. Seguir exatamente o padrão visual e de código das páginas existentes.

---

## Etapa 1 — Banco de Dados: Tabela `lista_provedores`

> Já executada. Documentada aqui para referência.

```sql
create table public.lista_provedores (
  id uuid not null default gen_random_uuid(),
  lista integer not null,
  dominio text not null,
  permitido boolean not null default true,
  created_at timestamp with time zone default now(),
  constraint lista_provedores_pkey primary key (id),
  constraint lista_provedores_unique unique (lista, dominio)
);

create index idx_lista_provedores_lista
  on public.lista_provedores using btree (lista);
```

**Campos:**

- `lista` — número da lista (igual ao campo `lista` de `email_lista`)
- `dominio` — ex: `gmail.com`, `hotmail.com`
- `permitido` — `true` = pode enviar | `false` = bloqueado

---

## Etapa 2 — Banco de Dados: Alterar `get_emails_para_disparo`

> Já executada. Documentada aqui para referência.

Rodar no SQL Editor do Supabase:

```sql
CREATE OR REPLACE FUNCTION get_emails_para_disparo(p_lista integer, p_quantidade integer)
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT el.id, el.email
  FROM email_lista el
  WHERE el.lista = p_lista
    AND el.enviado_em IS NULL
    AND SPLIT_PART(el.email, '@', 2) IN (
      SELECT dominio
      FROM lista_provedores
      WHERE lista = p_lista AND permitido = true
    )
  ORDER BY RANDOM()
  LIMIT p_quantidade;
END;
$$;
```

**O que mudou em relação à função anterior:**

- Adicionado o filtro `AND SPLIT_PART(el.email, '@', 2) IN (...)` antes do `LIMIT`
- O `LIMIT p_quantidade` respeita o filtro — sempre retorna a quantidade pedida de emails permitidos
- Se `lista_provedores` estiver vazia para aquela lista, retorna 0 emails

### Testes da Etapa 2

```sql
-- Teste 1: Tabela vazia deve retornar 0 emails
-- (garante comportamento fechado por padrão)
SELECT * FROM get_emails_para_disparo(16, 10);
-- Esperado: 0 linhas

-- Teste 2: Com provedor permitido deve retornar apenas emails daquele domínio
INSERT INTO lista_provedores (lista, dominio, permitido)
VALUES (16, 'gmail.com', true);

SELECT * FROM get_emails_para_disparo(16, 10);
-- Esperado: até 10 emails @gmail.com da lista 16 com enviado_em IS NULL

-- Teste 3: Verificar que domínio bloqueado não aparece
INSERT INTO lista_provedores (lista, dominio, permitido)
VALUES (16, 'hotmail.com', false);

SELECT * FROM get_emails_para_disparo(16, 100);
-- Esperado: apenas @gmail.com, nunca @hotmail.com

-- Limpar após testes
DELETE FROM lista_provedores WHERE lista = 16;
```

---

## Etapa 3 — Tipo TypeScript em `lib/supabase.ts`

> Já executada. Documentada aqui para referência.

Adicionar o tipo `ListaProvedor` no final do arquivo `lib/supabase.ts`:

```typescript
export type ListaProvedor = {
  id: string;
  lista: number;
  dominio: string;
  permitido: boolean;
  created_at: string;
};
```

Não alterar nada do que já existe no arquivo — apenas adicionar o tipo novo no final.

---

## Etapa 4 — Sidebar: Adicionar item "Provedores"

Arquivo: `components/Sidebar.tsx`

### 4.1 — Adicionar import do ícone

Localizar a linha de import dos ícones:

```typescript
import { LayoutDashboard, Send, LogOut, Menu, X } from "lucide-react";
```

Substituir por:

```typescript
import { LayoutDashboard, Send, Filter, LogOut, Menu, X } from "lucide-react";
```

### 4.2 — Adicionar item no array `navItems`

Localizar:

```typescript
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/disparar", label: "Disparar", icon: Send },
];
```

Substituir por:

```typescript
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/disparar", label: "Disparar", icon: Send },
  { href: "/provedores", label: "Provedores", icon: Filter },
];
```

### 4.3 — Atualizar `pageTitle`

Localizar:

```typescript
const pageTitle =
  pathname === "/dashboard"
    ? "Dashboard"
    : pathname === "/disparar"
      ? "Disparar"
      : "";
```

Substituir por:

```typescript
const pageTitle =
  pathname === "/dashboard"
    ? "Dashboard"
    : pathname === "/disparar"
      ? "Disparar"
      : pathname === "/provedores"
        ? "Provedores"
        : "";
```

---

## Etapa 5 — Página `/provedores`

Criar o arquivo `app/provedores/page.tsx` com o conteúdo abaixo.

### Comportamento esperado

1. Usuário vê dropdown com todas as listas disponíveis em `email_lista`
2. Seleciona uma lista e clica em "Carregar Provedores"
3. Sistema busca todos os domínios daquela lista agrupados com contagem
4. Cruza com `lista_provedores` para saber o estado atual de cada domínio
5. Domínio já configurado → mostra o valor salvo de `permitido`
6. Domínio novo (nunca configurado) → toggle **desligado** por padrão
7. Usuário ajusta os toggles livremente
8. Clica em "Salvar Configuração"
9. Sistema faz UPSERT de todos os domínios listados
10. Exibe confirmação de sucesso

### Queries utilizadas

**Buscar listas disponíveis:**

```sql
SELECT DISTINCT lista FROM email_lista ORDER BY lista ASC
```

**Buscar domínios da lista selecionada:**

```sql
SELECT
  SPLIT_PART(email, '@', 2) as dominio,
  COUNT(*) as quantidade
FROM email_lista
WHERE lista = [selecionada]
GROUP BY dominio
ORDER BY quantidade DESC
```

**Buscar configuração salva:**

```sql
SELECT dominio, permitido FROM lista_provedores WHERE lista = [selecionada]
```

**Salvar (UPSERT):**

```typescript
await supabase.from("lista_provedores").upsert(
  provedores.map((p) => ({
    lista: Number(listaSelecionada),
    dominio: p.dominio,
    permitido: p.permitido,
  })),
  { onConflict: "lista,dominio" },
);
```

### Código completo

```typescript
"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import { createClient } from "@/lib/supabase";

type ProvedorRow = {
  dominio: string;
  quantidade: number;
  permitido: boolean;
};

export default function ProvedoresPage() {
  const [listas, setListas] = useState<number[]>([]);
  const [listaSelecionada, setListaSelecionada] = useState<string>("");
  const [provedores, setProvedores] = useState<ProvedorRow[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [mensagem, setMensagem] = useState("");

  // Busca listas disponíveis ao montar a página
  useEffect(() => {
    async function fetchListas() {
      const supabase = createClient();
      const { data } = await supabase
        .from("email_lista")
        .select("lista")
        .order("lista", { ascending: true });

      if (data) {
        const unique = data
          .map((r: { lista: number }) => r.lista)
          .filter((v: number, i: number, a: number[]) => a.indexOf(v) === i)
          .sort((a: number, b: number) => a - b);
        setListas(unique);
        if (unique.length > 0) {
          setListaSelecionada(String(unique[0]));
        }
      }
    }
    fetchListas();
  }, []);

  // Reseta a tabela ao trocar de lista
  function handleListaChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setListaSelecionada(e.target.value);
    setProvedores([]);
    setCarregado(false);
    setStatus("idle");
    setMensagem("");
  }

  async function handleCarregar() {
    if (!listaSelecionada) return;
    setCarregando(true);
    setStatus("idle");
    setMensagem("");

    const supabase = createClient();

    // 1. Busca domínios agrupados da lista
    const { data: emailData, error: emailError } = await supabase.rpc(
      "get_dominios_por_lista",
      { p_lista: Number(listaSelecionada) }
    );

    if (emailError || !emailData) {
      setStatus("error");
      setMensagem("Erro ao buscar domínios da lista.");
      setCarregando(false);
      return;
    }

    // 2. Busca configuração salva
    const { data: configData } = await supabase
      .from("lista_provedores")
      .select("dominio, permitido")
      .eq("lista", Number(listaSelecionada));

    const configMap: Record<string, boolean> = {};
    if (configData) {
      configData.forEach((c: { dominio: string; permitido: boolean }) => {
        configMap[c.dominio] = c.permitido;
      });
    }

    // 3. Cruza: domínio novo = desligado por padrão
    const merged: ProvedorRow[] = emailData.map(
      (row: { dominio: string; quantidade: number }) => ({
        dominio: row.dominio,
        quantidade: row.quantidade,
        permitido: configMap[row.dominio] ?? false,
      })
    );

    setProvedores(merged);
    setCarregado(true);
    setCarregando(false);
  }

  function handleToggle(dominio: string) {
    setProvedores((prev) =>
      prev.map((p) =>
        p.dominio === dominio ? { ...p, permitido: !p.permitido } : p
      )
    );
  }

  async function handleSalvar() {
    if (!listaSelecionada || provedores.length === 0) return;
    setSalvando(true);
    setStatus("idle");
    setMensagem("");

    const supabase = createClient();

    const { error } = await supabase.from("lista_provedores").upsert(
      provedores.map((p) => ({
        lista: Number(listaSelecionada),
        dominio: p.dominio,
        permitido: p.permitido,
      })),
      { onConflict: "lista,dominio" }
    );

    if (error) {
      setStatus("error");
      setMensagem("Erro ao salvar configuração. Tente novamente.");
    } else {
      setStatus("success");
      setMensagem(
        `Configuração da Lista ${listaSelecionada} salva com sucesso.`
      );
    }

    setSalvando(false);
  }

  const totalPermitidos = provedores.filter((p) => p.permitido).length;
  const totalBloqueados = provedores.filter((p) => !p.permitido).length;

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-gray-50 pt-14 md:pt-0">
        <Sidebar />

        <main className="flex-1 p-4 md:p-8 min-w-0 overflow-y-auto">
          <h1 className="hidden md:block text-2xl font-bold text-gray-900 mb-6">
            Provedores
          </h1>

          {/* Seletor de lista */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 max-w-lg mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Selecionar Lista
            </h2>
            <div className="flex gap-3">
              <select
                value={listaSelecionada}
                onChange={handleListaChange}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {listas.map((l) => (
                  <option key={l} value={String(l)}>
                    Plan {l}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCarregar}
                disabled={carregando || !listaSelecionada}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-md transition-colors"
              >
                {carregando ? "Carregando..." : "Carregar"}
              </button>
            </div>
          </div>

          {/* Tabela de provedores */}
          {carregado && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    Provedores — Plan {listaSelecionada}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {totalPermitidos} permitidos · {totalBloqueados} bloqueados
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Domínio
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quantidade
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Permitido
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {provedores.map((p) => (
                      <tr key={p.dominio} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {p.dominio}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {p.quantidade.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggle(p.dominio)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                              p.permitido ? "bg-blue-600" : "bg-gray-200"
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                p.permitido ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer com botão salvar */}
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  {status === "success" && (
                    <p className="text-sm text-green-700">{mensagem}</p>
                  )}
                  {status === "error" && (
                    <p className="text-sm text-red-700">{mensagem}</p>
                  )}
                </div>
                <button
                  onClick={handleSalvar}
                  disabled={salvando}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium rounded-md transition-colors"
                >
                  {salvando ? "Salvando..." : "Salvar Configuração"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
```

---

## Etapa 6 — Função SQL auxiliar `get_dominios_por_lista`

A página `/provedores` usa uma RPC para buscar domínios agrupados. Criar no Supabase:

```sql
CREATE OR REPLACE FUNCTION get_dominios_por_lista(p_lista integer)
RETURNS TABLE(dominio text, quantidade bigint)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    SPLIT_PART(el.email, '@', 2) AS dominio,
    COUNT(*) AS quantidade
  FROM email_lista el
  WHERE el.lista = p_lista
  GROUP BY SPLIT_PART(el.email, '@', 2)
  ORDER BY quantidade DESC;
END;
$$;
```

### Teste da Etapa 6

```sql
-- Deve retornar todos os domínios da lista 16 com contagem
SELECT * FROM get_dominios_por_lista(16);
-- Esperado: linhas com dominio e quantidade, ordenadas por quantidade DESC
```

---

## Etapa 7 — Validação de Provedores na Página `/disparar`

Arquivo: `app/disparar/page.tsx`

### O que adicionar

Antes de enviar ao webhook, verificar se a lista tem ao menos 1 provedor com `permitido = true`.

### 7.1 — Nova função de validação (adicionar antes do `handleSubmit`)

```typescript
async function validarProvedores(lista: string): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from("lista_provedores")
    .select("id")
    .eq("lista", Number(lista))
    .eq("permitido", true)
    .limit(1);

  return !!(data && data.length > 0);
}
```

### 7.2 — Alterar `handleSubmit`

Localizar dentro de `handleSubmit`, logo após `setMessage("")`:

```typescript
setStatus("loading");
setMessage("");

const webhookUrl = ...
```

Substituir por:

```typescript
setStatus("loading");
setMessage("");

// Valida provedores antes de disparar
const provedoresOk = await validarProvedores(form.lista);
if (!provedoresOk) {
  setStatus("error");
  setMessage(
    `Lista ${form.lista} sem provedores configurados. Configure em Provedores antes de disparar.`
  );
  return;
}

const webhookUrl = ...
```

---

## Testes de Validação Final

Após todas as etapas implementadas, executar os seguintes testes:

### Teste A — Comportamento fechado

1. Garantir que a lista 16 não tem registros em `lista_provedores`
2. Ir em `/disparar`, selecionar Plan 16, colocar volume 10
3. Clicar em "Iniciar disparo"
4. **Esperado:** mensagem de erro sobre provedores não configurados, webhook NÃO chamado

### Teste B — Página de provedores (primeira vez)

1. Ir em `/provedores`
2. Selecionar Plan 16 e clicar em "Carregar"
3. **Esperado:** tabela com todos os domínios, todos com toggle **desligado**

### Teste C — Salvar e recarregar

1. Na tabela, ligar toggle de `gmail.com` e `hotmail.com`
2. Clicar em "Salvar Configuração"
3. **Esperado:** mensagem de sucesso
4. Clicar em "Carregar" novamente
5. **Esperado:** `gmail.com` e `hotmail.com` com toggle **ligado**, demais **desligados**

### Teste D — Disparo liberado

1. Com `gmail.com` permitido na lista 16
2. Ir em `/disparar`, selecionar Plan 16, volume 10
3. Clicar em "Iniciar disparo"
4. **Esperado:** webhook chamado normalmente

### Teste E — Verificar SQL direto

```sql
-- Após Teste C, confirmar no banco:
SELECT * FROM lista_provedores WHERE lista = 16;
-- gmail.com e hotmail.com devem ter permitido = true
-- demais devem ter permitido = false

-- Confirmar que a função retorna apenas emails permitidos:
SELECT * FROM get_emails_para_disparo(16, 20);
-- Deve retornar apenas @gmail.com e @hotmail.com
```

---

## Resumo das Etapas

| #   | O que fazer                               | Onde                      | Status       |
| --- | ----------------------------------------- | ------------------------- | ------------ |
| 1   | Criar tabela `lista_provedores`           | Supabase SQL Editor       | ✅ Concluído |
| 2   | Alterar `get_emails_para_disparo`         | Supabase SQL Editor       | ✅ Concluído |
| 3   | Adicionar tipo `ListaProvedor`            | `lib/supabase.ts`         | ✅ Concluído |
| 4   | Adicionar item "Provedores" na Sidebar    | `components/Sidebar.tsx`  | ✅ Concluído |
| 5   | Criar página `/provedores`                | `app/provedores/page.tsx` | ✅ Concluído |
| 6   | Criar função `get_dominios_por_lista`     | Supabase SQL Editor       | ✅ Concluído |
| 7   | Adicionar validação na página `/disparar` | `app/disparar/page.tsx`   | ✅ Concluído |
