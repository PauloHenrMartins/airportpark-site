# Plano de Implementação — Upload de Listas CSV

## Objetivo

Criar uma página `/listas` para upload de arquivos CSV com emails, aplicando
validação regex antes de inserir no Supabase. Emails inválidos e duplicatas
são inseridos com status identificado. A função de disparo é atualizada para
nunca enviar emails com status diferente de `null`.

## Stack

- Next.js 14 (App Router) — página client-side + rota de API server-side
- Supabase — inserção em lotes + verificação de duplicatas
- Tailwind CSS + Lucide Icons — visual padrão do projeto
- TypeScript

## Status do sistema após implementação

| Status | Significado | Dispara? |
|---|---|---|
| `null` | Pendente, nunca processado | ✅ Sim |
| `success` | Enviado com sucesso | ❌ Não (enviado_em preenchido) |
| `error` | Bounce ou suprimido | ❌ Não (enviado_em preenchido) |
| `invalid` | Reprovado no regex | ❌ Não |
| `duplicate` | Email já existe na lista | ❌ Não |

## Regras Gerais

1. Arquivo deve ser `.csv` — rejeitar outros formatos.
2. CSV tem apenas uma coluna de emails, sem cabeçalho.
3. Número da lista: apenas números inteiros positivos.
4. Processamento em lotes de 500 registros para não travar o Supabase.
5. Duplicata = mesmo `email` + mesmo `lista` já existe na tabela.
6. Emails inválidos e duplicatas são inseridos com status identificado, não ignorados.
7. Resumo final mostra: inseridos, inválidos, duplicatas.

## Regex de validação (parte local — antes do @)

O regex valida a parte local do email (antes do `@`):

```typescript
// Regex completo de email — RFC 5321 simplificado
const EMAIL_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9._+-]*[a-zA-Z0-9])?@[^@]+$/;

// Regras aplicadas à parte local (antes do @):
// ✅ Começa com letra ou número
// ✅ Termina com letra ou número
// ✅ Permite: letras, números, . _ + -
// ❌ Começa com ponto, hífen ou underscore
// ❌ Termina com ponto, hífen ou underscore
// ❌ Dois pontos seguidos (..)
// ❌ Espaços
// ❌ Muito curto (menos de 3 caracteres antes do @)
// ❌ Sem @ ou sem parte local
```

Função de validação completa:

```typescript
function isValidEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return false;

  const atIndex = trimmed.indexOf("@");
  if (atIndex < 1) return false;

  const local = trimmed.substring(0, atIndex);
  
  // Mínimo 3 caracteres na parte local
  if (local.length < 3) return false;
  
  // Não pode começar ou terminar com . _ - +
  if (/^[._\-+]|[._\-+]$/.test(local)) return false;
  
  // Não pode ter dois pontos seguidos
  if (/\.{2,}/.test(local)) return false;
  
  // Só caracteres permitidos
  if (!/^[a-zA-Z0-9._+\-]+$/.test(local)) return false;

  return true;
}
```

---

## Etapa 1 — Alterar `get_emails_para_disparo` no Supabase

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
    AND el.status IS NULL
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

**O que mudou:** adicionado `AND el.status IS NULL` — garante que apenas emails
completamente pendentes (sem nenhum status) entram no disparo. Emails `invalid`
e `duplicate` têm `enviado_em = NULL` mas têm `status` preenchido, então são
bloqueados automaticamente.

### Testes da Etapa 1

```sql
-- Teste 1: Inserir email inválido de teste
INSERT INTO email_lista (email, lista, status)
VALUES ('invalido@gmail.com', 17, 'invalid');

-- Não deve aparecer no disparo
SELECT * FROM get_emails_para_disparo(17, 10);
-- Esperado: 0 linhas (lista 17 já foi toda enviada E este tem status)

-- Teste 2: Inserir email pendente puro
INSERT INTO email_lista (email, lista, status)
VALUES ('teste.pendente@gmail.com', 17, NULL);

-- Com provedor configurado, deve aparecer
INSERT INTO lista_provedores (lista, dominio, permitido)
VALUES (17, 'gmail.com', true)
ON CONFLICT (lista, dominio) DO UPDATE SET permitido = true;

SELECT * FROM get_emails_para_disparo(17, 10);
-- Esperado: apenas teste.pendente@gmail.com

-- Limpar testes
DELETE FROM email_lista WHERE email IN ('invalido@gmail.com', 'teste.pendente@gmail.com');
DELETE FROM lista_provedores WHERE lista = 17;
```

---

## Etapa 2 — Rota de API `app/api/upload-lista/route.ts`

A rota recebe os dados já processados do cliente (array de emails classificados)
e insere no Supabase em lotes de 500.

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type EmailRecord = {
  email: string;
  lista: number;
  status: "invalid" | "duplicate" | null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { records } = body as { records: EmailRecord[] };

    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: "Nenhum registro para inserir" },
        { status: 400 }
      );
    }

    const BATCH_SIZE = 500;
    let inserted = 0;
    let errors = 0;

    // Processa em lotes de 500
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      const { error } = await supabase
        .from("email_lista")
        .insert(
          batch.map((r) => ({
            email: r.email.trim().toLowerCase(),
            lista: r.lista,
            status: r.status,
          }))
        );

      if (error) {
        errors += batch.length;
        console.error("Batch insert error:", error);
      } else {
        inserted += batch.length;
      }
    }

    return NextResponse.json({ inserted, errors });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Erro ao processar upload" },
      { status: 500 }
    );
  }
}
```

---

## Etapa 3 — Sidebar: Adicionar item "Listas"

Arquivo: `components/Sidebar.tsx`

### 3.1 — Adicionar import do ícone

Localizar:
```typescript
import { LayoutDashboard, Send, Filter, LogOut, Menu, X } from "lucide-react";
```

Substituir por:
```typescript
import { LayoutDashboard, Send, Filter, Upload, LogOut, Menu, X } from "lucide-react";
```

### 3.2 — Adicionar item no array `navItems`

Localizar:
```typescript
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/disparar", label: "Disparar", icon: Send },
  { href: "/provedores", label: "Provedores", icon: Filter },
];
```

Substituir por:
```typescript
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/disparar", label: "Disparar", icon: Send },
  { href: "/provedores", label: "Provedores", icon: Filter },
  { href: "/listas", label: "Listas", icon: Upload },
];
```

### 3.3 — Atualizar `pageTitle`

Localizar:
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

Substituir por:
```typescript
const pageTitle =
  pathname === "/dashboard"
    ? "Dashboard"
    : pathname === "/disparar"
      ? "Disparar"
      : pathname === "/provedores"
        ? "Provedores"
        : pathname === "/listas"
          ? "Listas"
          : "";
```

---

## Etapa 4 — Página `app/listas/page.tsx`

### Fluxo da página

```
1. Usuário arrasta/seleciona arquivo CSV
2. Informa número da lista
3. Clica em "Processar"
4. Frontend:
   a. Lê o CSV linha a linha
   b. Aplica regex em cada email
   c. Consulta Supabase para encontrar duplicatas da lista
   d. Classifica cada email: válido / inválido / duplicata
   e. Envia para a rota de API em lotes
5. Exibe resumo final
```

### Código completo

```typescript
"use client";

export const dynamic = "force-dynamic";

import { useState, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import { createClient } from "@/lib/supabase";
import { Upload } from "lucide-react";

function isValidEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return false;

  const atIndex = trimmed.indexOf("@");
  if (atIndex < 1) return false;

  const local = trimmed.substring(0, atIndex);

  if (local.length < 3) return false;
  if (/^[._\-+]|[._\-+]$/.test(local)) return false;
  if (/\.{2,}/.test(local)) return false;
  if (!/^[a-zA-Z0-9._+\-]+$/.test(local)) return false;

  return true;
}

type Resumo = {
  inseridos: number;
  invalidos: number;
  duplicatas: number;
  errosInsercao: number;
};

export default function ListasPage() {
  const [lista, setLista] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validarArquivo(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validarArquivo(file);
  }

  function validarArquivo(file: File) {
    if (!file.name.endsWith(".csv")) {
      setErro("Apenas arquivos .csv são aceitos.");
      setArquivo(null);
      return;
    }
    setErro("");
    setArquivo(file);
    setResumo(null);
  }

  async function handleProcessar() {
    if (!arquivo) { setErro("Selecione um arquivo CSV."); return; }
    if (!lista || isNaN(Number(lista)) || Number(lista) <= 0) {
      setErro("Informe um número de lista válido.");
      return;
    }

    setProcessando(true);
    setErro("");
    setResumo(null);
    setProgresso("Lendo arquivo...");

    try {
      // 1. Ler CSV
      const text = await arquivo.text();
      const linhas = text
        .split(/\r?\n/)
        .map((l) => l.trim().toLowerCase())
        .filter(Boolean);

      setProgresso(`${linhas.length} linhas encontradas. Validando...`);

      // 2. Separar válidos e inválidos
      const validos: string[] = [];
      const invalidos: string[] = [];

      for (const linha of linhas) {
        if (isValidEmail(linha)) {
          validos.push(linha);
        } else {
          invalidos.push(linha);
        }
      }

      setProgresso(`${validos.length} válidos, ${invalidos.length} inválidos. Verificando duplicatas...`);

      // 3. Buscar emails já existentes na lista (duplicatas)
      const supabase = createClient();
      const emailsParaVerificar = validos;
      const duplicatasSet = new Set<string>();

      // Consulta em lotes de 500 para não estourar o limite da query
      const QUERY_BATCH = 500;
      for (let i = 0; i < emailsParaVerificar.length; i += QUERY_BATCH) {
        const lote = emailsParaVerificar.slice(i, i + QUERY_BATCH);
        const { data } = await supabase
          .from("email_lista")
          .select("email")
          .eq("lista", Number(lista))
          .in("email", lote);

        if (data) {
          data.forEach((r: { email: string }) => duplicatasSet.add(r.email));
        }
      }

      setProgresso(`${duplicatasSet.size} duplicatas encontradas. Inserindo...`);

      // 4. Montar records para inserção
      const records = [
        // Emails válidos não duplicados
        ...validos
          .filter((e) => !duplicatasSet.has(e))
          .map((e) => ({ email: e, lista: Number(lista), status: null })),
        // Duplicatas
        ...validos
          .filter((e) => duplicatasSet.has(e))
          .map((e) => ({ email: e, lista: Number(lista), status: "duplicate" as const })),
        // Inválidos
        ...invalidos.map((e) => ({
          email: e,
          lista: Number(lista),
          status: "invalid" as const,
        })),
      ];

      // 5. Enviar para API em lotes
      const INSERT_BATCH = 500;
      let totalInseridos = 0;
      let totalErros = 0;

      for (let i = 0; i < records.length; i += INSERT_BATCH) {
        const lote = records.slice(i, i + INSERT_BATCH);
        setProgresso(
          `Inserindo... ${Math.min(i + INSERT_BATCH, records.length)} de ${records.length}`
        );

        const res = await fetch("/api/upload-lista", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: lote }),
        });

        const data = await res.json();
        totalInseridos += data.inserted ?? 0;
        totalErros += data.errors ?? 0;
      }

      // 6. Resumo final
      setResumo({
        inseridos: validos.filter((e) => !duplicatasSet.has(e)).length,
        invalidos: invalidos.length,
        duplicatas: duplicatasSet.size,
        errosInsercao: totalErros,
      });
      setProgresso("");
    } catch (e) {
      console.error(e);
      setErro("Erro inesperado ao processar o arquivo.");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-gray-50 pt-14 md:pt-0">
        <Sidebar />

        <main className="flex-1 p-4 md:p-8 min-w-0 overflow-y-auto">
          <h1 className="hidden md:block text-2xl font-bold text-gray-900 mb-6">
            Listas
          </h1>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 max-w-lg">
            <h2 className="text-base font-semibold text-gray-900 mb-5">
              Importar lista de emails
            </h2>

            {/* Número da lista */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Número da lista
              </label>
              <input
                type="number"
                min={1}
                value={lista}
                onChange={(e) => setLista(e.target.value)}
                placeholder="Ex: 18"
                disabled={processando}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Área de upload */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => !processando && inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-4 ${
                dragging
                  ? "border-blue-400 bg-blue-50"
                  : arquivo
                  ? "border-green-400 bg-green-50"
                  : "border-gray-300 hover:border-gray-400 bg-gray-50"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload
                size={24}
                className={`mx-auto mb-2 ${
                  arquivo ? "text-green-500" : "text-gray-400"
                }`}
              />
              {arquivo ? (
                <div>
                  <p className="text-sm font-medium text-green-700">
                    {arquivo.name}
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {(arquivo.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-600">
                    Arraste o arquivo CSV aqui
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    ou clique para selecionar
                  </p>
                </div>
              )}
            </div>

            {/* Erro */}
            {erro && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
                {erro}
              </div>
            )}

            {/* Progresso */}
            {progresso && (
              <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 mb-4">
                {progresso}
              </div>
            )}

            {/* Resumo */}
            {resumo && (
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-4 space-y-1.5">
                <p className="text-sm font-semibold text-gray-900 mb-2">
                  Resultado do upload
                </p>
                <p className="text-sm text-green-700">
                  ✅ {resumo.inseridos.toLocaleString("pt-BR")} inseridos com sucesso
                </p>
                <p className="text-sm text-orange-700">
                  ❌ {resumo.invalidos.toLocaleString("pt-BR")} inválidos (regex)
                </p>
                <p className="text-sm text-yellow-700">
                  ⚠️ {resumo.duplicatas.toLocaleString("pt-BR")} duplicatas ignoradas
                </p>
                {resumo.errosInsercao > 0 && (
                  <p className="text-sm text-red-700">
                    🔴 {resumo.errosInsercao.toLocaleString("pt-BR")} erros de inserção
                  </p>
                )}
              </div>
            )}

            {/* Botão */}
            <button
              onClick={handleProcessar}
              disabled={processando || !arquivo || !lista}
              className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {processando ? "Processando..." : "Processar e importar"}
            </button>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
```

---

## Testes de Validação Final

### Teste A — Função SQL atualizada
```sql
-- Email com status invalid não deve ser retornado
INSERT INTO email_lista (email, lista, status)
VALUES ('invalido@gmail.com', 16, 'invalid');

SELECT * FROM get_emails_para_disparo(16, 100);
-- Esperado: invalido@gmail.com não aparece

-- Limpar
DELETE FROM email_lista WHERE email = 'invalido@gmail.com';
```

### Teste B — Upload de CSV pequeno
Criar arquivo `teste.csv`:
```
joao@gmail.com
maria@hotmail.com
email_invalido
..teste@gmail.com
joao@gmail.com
```
Fazer upload na lista 99 (número que não existe ainda).
Esperado:
- 2 inseridos (`joao` e `maria` — joao aparece 2x então 1 válido + 1 duplicata)
- 2 inválidos (`email_invalido` e `..teste@gmail.com`)
- 1 duplicata (`joao@gmail.com` segunda vez)

### Teste C — Verificar no Supabase após upload
```sql
SELECT email, lista, status
FROM email_lista
WHERE lista = 99
ORDER BY status;

-- Esperado:
-- joao@gmail.com     | 99 | null      (inserido)
-- maria@hotmail.com  | 99 | null      (inserido)
-- email_invalido     | 99 | invalid
-- ..teste@gmail.com  | 99 | invalid
-- joao@gmail.com     | 99 | duplicate
```

### Teste D — Arquivo não CSV
Tentar enviar um `.xlsx` ou `.txt`.
Esperado: mensagem "Apenas arquivos .csv são aceitos."

### Teste E — Lista inválida
Deixar campo lista vazio ou colocar texto.
Esperado: mensagem "Informe um número de lista válido."

---

## Resumo das Etapas

| # | O que fazer | Onde | Status |
|---|---|---|---|
| 1 | Alterar `get_emails_para_disparo` | Supabase SQL Editor | ⬜ Pendente |
| 2 | Testar função SQL (Testes A) | Supabase SQL Editor | ⬜ Pendente |
| 3 | Criar `app/api/upload-lista/route.ts` | Código | ⬜ Pendente |
| 4 | Adicionar ícone `Upload` na Sidebar | `components/Sidebar.tsx` | ⬜ Pendente |
| 5 | Criar `app/listas/page.tsx` | Código | ⬜ Pendente |
| 6 | Testar upload com CSV pequeno (Teste B) | Browser | ⬜ Pendente |
| 7 | Verificar resultados no Supabase (Teste C) | SQL Editor | ⬜ Pendente |
| 8 | Testar validações de arquivo e lista (Testes D e E) | Browser | ⬜ Pendente |
