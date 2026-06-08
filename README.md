# AIRPORTPARK-SITE

## Visão Geral

AIRPORTPARK-SITE é uma aplicação interna de controle de disparos de email marketing com foco em aquecimento de domínio e monitoramento de métricas. O sistema une Next.js 14, Supabase e AWS SES para:

- autenticar usuários por email/senha;
- visualizar métricas de envio e reputação;
- disparar volumes por lista via webhook n8n;
- acompanhar o progresso por lista e por lote;
- operar a partir de uma interface leve, responsiva e protegida.

O fluxo principal do produto é iniciar uma campanha de disparo e acompanhar o comportamento de `email_lista` através de métricas internas e dados AWS.

## Arquitetura do Projeto

- `app/`
  - `page.tsx` — redireciona automaticamente para `/dashboard`;
  - `dashboard/page.tsx` — dashboard principal com resumo, gráfico, métricas AWS e progresso por lista/lote;
  - `disparar/page.tsx` — formulário de disparo com seletores dinâmicos de lista e tabela de referência;
  - `login/page.tsx` — tela de login para autenticação Supabase;
  - `layout.tsx` — layout global da aplicação;
  - `globals.css` — estilos base com Tailwind CSS.
- `app/api/metrics/route.ts` — rota de API server-side para buscar métricas AWS SES do CloudWatch.
- `components/`
  - `AuthGuard.tsx` — proteção de rotas client-side que redireciona usuários não autenticados;
  - `Sidebar.tsx` — navegação lateral com logo, itens de menu e drawer móvel.
- `lib/`
  - `supabase.ts` — cliente compartilhado Supabase usando `createBrowserClient`;
- `public/` — assets estáticos, incluindo o logo do AirportPark.

## Tecnologias Principais

- Next.js 14 (App Router)
- React 18
- TypeScript
- Supabase
- AWS SDK para JavaScript (`@aws-sdk/client-cloudwatch`)
- Tailwind CSS
- Recharts
- Lucide Icons

## Fluxo de Autenticação

O login é feito no cliente com Supabase:

- `/login` autentica via `supabase.auth.signInWithPassword`;
- `AuthGuard` verifica a sessão com `supabase.auth.getSession()` e força redirecionamento para `/login` se não houver sessão;
- `Sidebar` faz `supabase.auth.signOut()` e envia o usuário para a tela de login.

> Observação: a proteção é client-side. Para maior segurança, recomenda-se migrar para validação server-side ou middleware em futuras versões.

## Modelo de Dados

A base de dados principal é a tabela Supabase `email_lista`.

### Estrutura esperada de `EmailLista`

- `id: string`
- `email: string`
- `lista: number`
- `enviado_em: string | null`
- `status: "success" | "error" | null`
- `feedback: Record<string, unknown> | null`
- `created_at: string`

### Interpretação de status

- `success` — email enviado com sucesso;
- `error` — envio apresentou erro;
- `null` — pendente ou ainda não processado.

## Visão Geral das Páginas

### `/dashboard`

O dashboard é a página central de monitoramento e exibe:

- cards de resumo com totais de enviados, pendentes e com erro;
- gráfico de barras de disparos dos últimos 30 dias, calculado a partir de `enviado_em`;
- bloco de métricas AWS SES/CloudWatch para reputação de envio;
- tabela de progresso por lista com expansão para lotes detalhados.

#### Progresso por Lista e Lotes

A tabela principal usa duas funções RPC no Supabase:

- `get_stats_por_lista()` — retorna métricas agregadas por `lista`:
  - `lista`, `total`, `enviados`, `pendentes`, `erros`;
- `get_lotes_por_lista()` — retorna lotes por `lista` e `enviado_em`:
  - `lista`, `enviado_em`, `total`, `enviados`, `erros`.

A cada linha da lista é possível expandir o detalhe de lotes para ver:

- data/hora de envio do lote;
- total do lote;
- quantidade de sucesso;
- quantidade de erro;
- taxa de sucesso em porcentagem.

### `/disparar`

A página de disparo permite iniciar fluxos de envio para listas existentes.

Funcionalidades:

- busca dinâmicamente as listas (`lista`) disponíveis em `email_lista`;
- preenche o seletor com as listas encontradas e define o primeiro valor disponível como padrão;
- permite enviar um volume numérico de emails por lista;
- dispara um POST para o webhook n8n configurado;
- exibe feedback de sucesso ou erro ao usuário;
- traz a tabela de referência da Fase 1 e métricas de abertura/spam para contextualizar o envio.

> Observação: o campo `assunto` foi removido; o payload enviado ao webhook contém apenas `lista` e `volume`.

### `/login`

A tela de login é minimalista e usa email e senha.

- não há fluxo de cadastro ou recuperação de senha implementado;
- usuários devem ser criados diretamente no Supabase.

## Integração AWS SES / CloudWatch

A aplicação contém uma rota de API interna em `app/api/metrics/route.ts` que consulta métricas AWS SES no CloudWatch.

### O que é coletado

A rota `GET /api/metrics` consulta os seguintes metrics do namespace `AWS/SES`:

- `Send`
- `Delivery`
- `Open`
- `Click`
- `Bounce`
- `Complaint`

Cada métrica é solicitada com `GetMetricStatisticsCommand` e estatística `Sum` para os últimos 30 dias.

### Como são calculadas as taxas

A partir dos valores retornados pela AWS, o backend calcula:

- `deliveryRate = deliveries / sends`
- `openRate = opens / deliveries`
- `clickRate = clicks / deliveries`
- `bounceRate = bounces / sends`
- `complaintRate = complaints / sends`

Os resultados são enviados para o cliente como porcentagens formatadas.

### Uso no Dashboard

O dashboard mostra:

- `Enviados` — total de envios `Send`;
- `Entregues` — taxa de entrega;
- `Abertura` — taxa de abertura;
- `Bounce` — taxa de bounce;
- `Reclamação` — taxa de complaint.

Também há um botão de atualizar que consulta novamente a rota `/api/metrics` e atualiza os cards.

### Requisitos de ambiente AWS

A rota depende das variáveis de ambiente:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (padrão `sa-east-1` se não definido)

Essas credenciais são usadas apenas no servidor para autenticar a chamada ao CloudWatch.

## Integração n8n

O disparo em `app/disparar/page.tsx` envia uma requisição POST para o webhook configurado em:

- `NEXT_PUBLIC_N8N_WEBHOOK_URL`

Opcionalmente, adiciona o header:

- `x-api-key: NEXT_PUBLIC_N8N_API_KEY`

O payload atual enviado pelo cliente é:

```json
{ "lista": Number(form.lista), "volume": Number(form.volume) }
```

Se o webhook não estiver configurado, o formulário exibe erro local e não tenta disparar.

## Estrutura de Login e Sessão

- `AuthGuard.tsx` bloqueia o acesso a `/dashboard` e `/disparar` para usuários não autenticados.
- `Sidebar.tsx` exibe o menu e o botão de logout.
- no mobile, o sidebar usa um drawer com botão hamburguer e overlay.

## Dependências Relevantes

- `@aws-sdk/client-cloudwatch`
- `@supabase/auth-helpers-nextjs`
- `@supabase/ssr`
- `@supabase/supabase-js`
- `recharts`
- `lucide-react`
- `tailwindcss`

## Variáveis de Ambiente

Crie ou atualize `.env.local` com:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anonimo-chave
NEXT_PUBLIC_N8N_WEBHOOK_URL=https://seu-n8n.com/webhook/...
NEXT_PUBLIC_N8N_API_KEY=seu-token-opcional
AWS_ACCESS_KEY_ID=sua_access_key
AWS_SECRET_ACCESS_KEY=sua_secret_key
AWS_REGION=sa-east-1
```

> Importante: não compartilhe essas chaves e não as comite em repositórios públicos.

## Scripts Disponíveis

- `npm install` — instala dependências;
- `npm run dev` — inicia o servidor de desenvolvimento;
- `npm run build` — constrói para produção;
- `npm run start` — executa a build de produção;
- `npm run lint` — executa lint.

## Como Rodar

1. Instale dependências:
   ```bash
   npm install
   ```
2. Defina as variáveis de ambiente em `.env.local`.
3. Rode:
   ```bash
   npm run dev
   ```
4. Acesse `http://localhost:3000`.

## Recomendações Operacionais

- Mantenha as funções SQL no Supabase atualizadas para `get_stats_por_lista` e `get_lotes_por_lista`.
- Use o dashboard para avaliar envio por lista e identificar lotes com erro.
- Monitore as métricas AWS SES para reputação e bounce/complaint.
- Não exponha chaves AWS ou webhook em repositórios públicos.

---

Este README está alinhado com a implementação atual do projeto e descreve o fluxo de dados, as integrações e os pontos de operação principais.
