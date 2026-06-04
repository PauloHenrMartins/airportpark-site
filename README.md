# AIRPORTPARK-SITE

## Visão Geral

AIRPORTPARK-SITE é uma aplicação web interna construída com Next.js 14 e Supabase para gerenciar disparos de e-mail marketing. O sistema oferece:

- autenticação email/senha via Supabase;
- dashboard com métricas de envios, status e histórico;
- formulário de disparo que aciona um webhook n8n;
- controle de sessão com navegação protegida;
- interface responsiva e focada em operações administrativas.

O foco atual é monitorar envios de `email_lista`, observar resultados de sucesso/erro e iniciar fluxos de disparo via webhook.

## Estrutura do Projeto

- `app/`
  - `page.tsx` — redireciona para `/dashboard`;
  - `dashboard/page.tsx` — dashboard principal com métricas, gráfico e listagem paginada de registros;
  - `disparar/page.tsx` — formulário de disparo para iniciar o fluxo de envio;
  - `login/page.tsx` — tela de login;
  - `layout.tsx` — layout base da aplicação;
  - `globals.css` — estilos globais com Tailwind CSS.
- `components/`
  - `AuthGuard.tsx` — protege páginas autenticadas;
  - `Sidebar.tsx` — navegação lateral com logout;
- `lib/`
  - `supabase.ts` — cliente Supabase compartilhado;
  - `utils.ts` — helper `cn` para classes CSS.
- `public/` — recursos estáticos (logo, imagens, etc.).

## Tecnologias

- Next.js 14 (App Router)
- React 18
- TypeScript
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`, `@supabase/auth-helpers-nextjs`)
- Tailwind CSS
- Recharts
- Lucide icons
- clsx + tailwind-merge

## Fluxo de Autenticação

A aplicação utiliza autenticação Supabase em client-side:

- `login/page.tsx` chama `supabase.auth.signInWithPassword({ email, password })`;
- `AuthGuard.tsx` valida a sessão atual via `supabase.auth.getSession()` e redireciona para `/login` quando não autenticado;
- `Sidebar.tsx` executa `supabase.auth.signOut()` e volta para `/login`.

### Observações de segurança

- A autenticação é verificada apenas no cliente.
- Para maior segurança no futuro, vale mover validação para rotas server-side e utilizar middlewares ou `@supabase/auth-helpers-nextjs` com SSR.

## Dados e Modelo Principal

O sistema trabalha com a tabela `email_lista` do Supabase.

### Tipagem esperada (`EmailLista`)

- `id: string`
- `email: string`
- `lista: number`
- `enviado_em: string | null`
- `status: "success" | "error" | null`
- `feedback: Record<string, unknown> | null`
- `created_at: string`

### Status

- `success` — envio confirmado;
- `error` — envio com falha;
- `null` — pendente / ainda não enviado.

## Páginas e Funcionalidades

### `/dashboard`

- exibe métricas resumidas de envios com contagem de sucesso, erro e pendentes;
- gera gráfico de disparos dos últimos 30 dias;
- lista registros paginados em blocos de 20;
- ordena por `created_at` decrescente;
- usa `AuthGuard` e `Sidebar`.

### `/disparar`

- formulário de entrada para `lista`, `volume` e `assunto`;
- usa webhook configurado em `NEXT_PUBLIC_N8N_WEBHOOK_URL`;
- envia JSON para n8n com payload:
  - `lista: Number(form.lista)`
  - `volume: Number(form.volume)`
  - `assunto: form.assunto`
- adiciona cabeçalho `x-api-key` apenas se `NEXT_PUBLIC_N8N_API_KEY` estiver definido;
- exibe mensagens de sucesso ou erro.

### `/login`

- tela de login simples;
- valida credenciais diretamente com Supabase.

## Integrações

### Supabase

- URL e chave anon são fornecidos via variáveis de ambiente:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- o cliente é criado com `createBrowserClient` de `@supabase/ssr`.
- a aplicação faz consultas diretas usando `supabase.from("email_lista")`.

### n8n

- webhook acionado por `app/disparar/page.tsx`:
  - `process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL`
  - `process.env.NEXT_PUBLIC_N8N_API_KEY` (opcional)
- se o webhook não estiver configurado, o usuário vê mensagem de erro local.

## Variáveis de Ambiente

Crie um arquivo `.env.local` com pelo menos:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anonimo-chave
NEXT_PUBLIC_N8N_WEBHOOK_URL=https://seu-n8n.com/webhook/...
NEXT_PUBLIC_N8N_API_KEY=seu-token-opcional
```

### Importante

- Não suba chaves para o repositório.
- `NEXT_PUBLIC_...` torna as variáveis visíveis no cliente.
- Armazene credenciais sensíveis com cuidado.

## Scripts

- `npm run dev` — inicia servidor de desenvolvimento;
- `npm run build` — gera build de produção;
- `npm run start` — executa aplicação em modo de produção;
- `npm run lint` — executa ESLint.

## Setup Inicial

1. Instale dependências:
   ```bash
   npm install
   ```
2. Crie `.env.local` com as variáveis acima.
3. Inicie em modo de desenvolvimento:
   ```bash
   npm run dev
   ```
4. Acesse `http://localhost:3000`.

## Pontos de Extensão e Planejamento de Novas Features

### Melhorias de arquitetura

- adicionar APIs internas (`/api/*`) para evitar chamadas diretas ao webhook n8n a partir do cliente;
- centralizar chamadas Supabase em serviços e modules reutilizáveis;
- utilizar middlewares de autenticação ou SSR para proteger melhor rotas;
- aplicar roles/permissions no Supabase para separar administração de supervisão.

### Funcionalidades desejadas

- filtro por `status`, `lista` e intervalo de datas no dashboard;
- pesquisa por email e exportação de CSV;
- reenvio manual de emails com falha;
- histórico completo de disparos com timestamps de processamento;
- alertas de falha e retry automático para envios erro;
- separação de ambientes (`dev`, `staging`, `prod`) no Supabase e no n8n.

### Operacional

- criar documentação de processo para cada `lista` e `planilha` usada;
- mapear regras de negócio do `Plan 16`, `Plan 17`, `Plan 18` e volumes aprovados;
- validar o payload aceito pelo fluxo n8n e negociar contrato do webhook;
- adicionar testes unitários e componentes.

## Observações Importantes

- Atualmente, a proteção de sessão é implementada no cliente com `AuthGuard`.
- O envio de disparos ocorre diretamente do browser para o webhook n8n.
- A tabela `email_lista` é a fonte única de verdade para métricas e status.
- O projeto assume que os registros de disparo já estão sendo inseridos no Supabase por um fluxo externo.

## Checklist para Novas Features

1. mapear a necessidade com o negócio e a regra de envio;
2. validar se o recurso deve ser implementado no cliente ou backend;
3. evitar expor segredos e webhooks no frontend;
4. usar rotas API para orquestrar n8n / Supabase sempre que possível;
5. garantir testes e revisão do fluxo de autenticação;
6. documentar novas variáveis de ambiente e mudanças de esquema.

---

Para qualquer expansão do sistema, mantenha este README atualizado com novas integrações, endpoints, tabelas e comportamentos esperados.
