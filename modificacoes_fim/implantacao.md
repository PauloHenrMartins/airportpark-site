# Implantação de Modificações — AirportPark Site

## Modificação 1 — Integração AWS CloudWatch no Dashboard

**Data**: 04/06/2026

### O que foi feito

#### 1. Instalação de dependência

- Instalado `@aws-sdk/client-cloudwatch` (40 pacotes adicionados)

#### 2. Criação de API Route

**Arquivo**: `app/api/metrics/route.ts`

- Nova rota GET que conecta ao AWS CloudWatch
- Busca 6 métricas do namespace `AWS/SES`:
  - `Send` — total de emails enviados
  - `Delivery` — total entregues
  - `Open` — total de aberturas
  - `Click` — total de cliques
  - `Bounce` — total de bounces
  - `Complaint` — total de reclamações
- Calcula taxas (percentuais) baseadas nas métricas:
  - `deliveryRate` = (deliveries / sends) × 100
  - `openRate` = (opens / deliveries) × 100
  - `clickRate` = (clicks / deliveries) × 100
  - `bounceRate` = (bounces / sends) × 100
  - `complaintRate` = (complaints / sends) × 100
- Período: últimos 30 dias
- Retorna JSON com todas as métricas e taxas

#### 3. Modificação do Dashboard

**Arquivo**: `app/dashboard/page.tsx`

**Removido**:

- Seção completa `{/* Table */}` — tabela de paginação com registros de email_lista
- Estados: `rows`, `page`, `total`
- Callbacks: `fetchPage`, `handlePageChange`
- Variáveis: `totalPages`, `PAGE_SIZE`
- Funções auxiliares: `formatDate()`, `StatusBadge()`
- Import não utilizado: `EmailLista`

**Adicionado**:

- Tipo `AwsMetrics` — estrutura tipada com todas as métricas e taxas
- Estados: `awsMetrics` (null ou dados), `awsLoading` (boolean)
- Função `fetchAwsMetrics()` — busca em `/api/metrics` via GET
- Seção visual "Métricas de Reputação — AWS SES" com:
  - Header com título, descrição e botão de atualizar
  - 5 cards em grid responsivo:
    1. **Enviados** — valor absoluto (sends)
    2. **Entregues** — taxa em % (deliveryRate)
    3. **Abertura** — taxa em %, cor condicional (verde ≥20%, amarelo <20%)
    4. **Bounce** — taxa em %, cor condicional (verde <2%, vermelho ≥2%)
    5. **Reclamação** — taxa em %, cor condicional (verde <0.1%, vermelho ≥0.1%)
  - Estados de UI:
    - Padrão: mensagem "Clique em 'Atualizar'..."
    - Loading: "Buscando métricas na AWS..."
    - Carregado: grid com cards populados

**Localização**: A seção aparece **imediatamente após `<h1>Dashboard</h1>`**, antes dos cards de resumo do Supabase

### Dependências necessárias no `.env.local`

```env
AWS_ACCESS_KEY_ID=sua_access_key
AWS_SECRET_ACCESS_KEY=sua_secret_key
AWS_REGION=sa-east-1
```

### Status

✅ Implementada com sucesso

- Sem erros de compilação TypeScript
- Sem erros ESLint
- Interface visual funcionando
- Carregamento de métricas manual (botão "Atualizar")

---

## Modificação 2 — Página de Disparo Aprimorada

**Data**: 04/06/2026

### O que foi feito

#### 1. Remoção do campo "Assunto do e-mail"

**Arquivo**: `app/disparar/page.tsx`

- Removido campo `assunto` do tipo `FormState`
- Removido campo `assunto` do estado inicial do form
- Removido o bloco JSX inteiro do input de assunto
- Removido `assunto` do payload JSON enviado ao webhook
- Removido `assunto` do reset do form após sucesso

**Por quê?** O assunto passou a ser gerenciado pelo n8n/backend, simplificando o frontend.

#### 2. Compactação visual da tabela Fase 1

**Classes CSS alteradas**:

- Header da seção: `px-5 py-4` → `px-4 py-3`
- Título: `text-base` → `text-sm`
- Células `<th>` e `<td>`: `px-5 py-3` → `px-3 py-2`
- Cards de métricas: `p-5` → `p-4`
- Texto dos cards: `text-2xl` → `text-xl`

**Resultado**: Interface mais compacta e otimizada.

#### 3. GET dinâmico das listas do Supabase

**Adições**:

- Import de `useEffect` (React)
- Import de `createClient` (Supabase)
- Novo estado: `const [listas, setListas] = useState<number[]>([])`
- `useEffect` que executa ao carregar o componente:
  - Conecta ao Supabase
  - Busca todos os `lista` únicos da tabela `email_lista`
  - Ordena em ordem crescente
  - Define o primeiro como valor padrão do form

**Select antes** (hardcoded):

```tsx
<option value="16">Plan 16</option>
<option value="17">Plan 17</option>
<option value="18">Plan 18</option>
```

**Select depois** (dinâmico):

```tsx
{
  listas.map((l) => (
    <option key={l} value={String(l)}>
      Plan {l}
    </option>
  ));
}
```

### Comportamento esperado

- Ao carregar a página, busca as listas únicas no banco
- Se houver dados, seleciona automaticamente o primeiro
- Se não houver dados, o select fica vazio

### Status

✅ Implementada com sucesso

- Sem erros de compilação TypeScript
- Sem erros ESLint
- Form mais simples e intuitivo
- Listas carregadas dinamicamente do banco de dados

---

## Modificação 3 — Métricas por Lista no Dashboard

**Data**: 04/06/2026

### O que foi feito

#### 1. Criação de função SQL no Supabase

**Função**: `get_stats_por_lista()`

- Criada no Supabase SQL Editor
- Agrupa registros de `email_lista` por `lista`
- Calcula métricas por grupo:
  - `total` — count total de registros
  - `enviados` — count onde status = 'success'
  - `pendentes` — count onde enviado_em IS NULL
  - `erros` — count onde status = 'error'
- Ordena por lista descendente
- Retorna tabela com 5 colunas (lista, total, enviados, pendentes, erros)

#### 2. Modificação do Dashboard

**Arquivo**: `app/dashboard/page.tsx`

**Adicionado**:

- Tipo `ListaStat` — estrutura tipada com campos: lista, total, enviados, pendentes, erros
- Estados: `listaStats` (array de ListaStat), `listaLoading` (boolean)
- Função `fetchListaStats()` (useCallback):
  - Executa RPC `get_stats_por_lista` do Supabase
  - Carrega estatísticas por planilha
  - Atualiza estado listaStats

**Atualizado**:

- useEffect agora inclui `fetchListaStats()` na Promise.all
- fetchListaStats adicionado às dependências do useEffect

**Seção Visual - "Progresso por Lista"**:

- Tabela com 6 colunas: Lista, Total, Enviados, Pendentes, Erros, Progresso
- Barra de progresso (width = enviados/total × 100%):
  - Verde (≥80%)
  - Amarela (40-79%)
  - Vermelha (<40%)
- Botão de atualizar com estado de loading
- Formatação numérica em pt-BR
- Estados de UI:
  - Loading: "Carregando..."
  - Vazio: "Nenhum dado encontrado."
  - Preenchido: tabela com dados

**Localização**: Aparece **após o gráfico de 30 dias**, antes do closing tag do `<main>`

### Dependências Supabase

- Nenhuma nova dependência npm necessária
- Requer função SQL `get_stats_por_lista()` criada no Supabase

### Status

✅ Implementada com sucesso

- Sem erros de compilação TypeScript
- Sem erros ESLint
- Carregamento automático ao iniciar dashboard
- Botão de atualizar manual disponível
- **Compilada com sucesso** — `/dashboard 200 GET 8082ms`

---

## Modificação 4 — Lotes Expansíveis por Lista no Dashboard

**Data**: 04/06/2026

### O que foi feito

#### 1. Criação de função SQL no Supabase

**Função**: `get_lotes_por_lista()`

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

- Agrupa registros por lista E por data/hora de envio
- Cria lotes (agrupamento temporal) dentro de cada lista
- Retorna: lista, enviado_em, total, enviados, erros

#### 2. Modificação do Dashboard

**Arquivo**: `app/dashboard/page.tsx`

**Adicionado**:

- Tipo `LoteStat` — estrutura tipada com campos: lista, enviado_em, total, enviados, erros
- Estados:
  - `loteStats` (array de LoteStat) — armazena todos os lotes
  - `expandedListas` (Set<number>) — rastreia quais listas estão expandidas
- Função `fetchLoteStats()` (useCallback):
  - Executa RPC `get_lotes_por_lista` do Supabase
  - Carrega todos os lotes
- Função `toggleLista(lista: number)`:
  - Adiciona/remove lista do conjunto de expandidas
  - Alterna visibilidade da sub-tabela de lotes

**Atualizado**:

- useEffect agora inclui `fetchLoteStats()` na Promise.all
- fetchLoteStats adicionado às dependências do useEffect
- Botão "Atualizar" agora chama tanto `fetchListaStats()` quanto `fetchLoteStats()`

**Seção Visual - "Progresso por Lista" (expandida)**:

- Tabela principal com 7 colunas: [seta], Lista, Total, Enviados, Pendentes, Erros, Progresso
- Cada linha de lista é clicável:
  - Exibe `▶` quando recolhida, `▼` quando expandida
  - Click alterna entre estados
  - Classe `cursor-pointer` e hover background
- Sub-tabela expansível para cada lista (quando expandida):
  - Background cinza (bg-gray-50)
  - 5 colunas: Data/Hora, Qtd, Sucesso, Erros, Taxa
  - Cada lote mostra:
    - `enviado_em` formatado em pt-BR com data e hora
    - `total` — quantidade de emails neste lote
    - `enviados` — sucessos (verde)
    - `erros` — falhas (vermelho)
    - `Taxa %` — percentual de sucesso com badge colorido:
      - Verde (100%)
      - Amarela (≥80%)
      - Vermelha (<80%)
  - Formatação numérica em pt-BR
  - Hover em linhas de lote (bg-gray-100)

**Localização**: Substitui completamente a seção anterior "Stats por lista" (agora com expansão)

### Dependências

- Nenhuma nova dependência npm necessária
- Requer função SQL `get_lotes_por_lista()` criada no Supabase
- Reusa Supabase client existente

### Comportamento esperado

1. Dashboard carrega e busca listas + lotes automaticamente
2. Cada lista mostra resumo agregado na linha principal
3. Click na linha expande/recolhe sub-tabela com lotes específicos
4. Sub-tabela mostra histórico temporal de disparos para aquela lista
5. Botão "Atualizar" recarrega ambas as funções (stats e lotes)

### Status

✅ Implementada com sucesso

- Sem erros de compilação TypeScript
- Sem erros ESLint
- Interface totalmente interativa (toggle funcionando)
- Formatação de data/hora em português
- Renderização condicional de lotes apenas quando expandido (performance)

---

## Modificação 5 — Sidebar Mobile + Logo Responsivo

**Data**: 04/06/2026

### O que foi feito

#### 1. Atualização do componente Sidebar

**Arquivo**: `components/Sidebar.tsx`

- Substituído o componente anterior por uma versão mobile-friendly com drawer
- Adicionado botão hamburguer fixo no mobile para abrir o menu
- Adicionado overlay escuro ao abrir o menu mobile
- Implementado botão de fechar (`X`) dentro do menu mobile
- Preservado menu desktop fixo em `md` para frente
- Adicionado logo `Airport Park` com `next/image` usando `/img_airportpark_logo.png`
- Mantido logout via Supabase e redirecionamento para `/login`

### Comportamento esperado

- No mobile, a sidebar fica oculta por padrão
- Ao tocar no botão hamburguer, a sidebar desliza a partir da esquerda
- O usuário pode fechar o menu tocando no overlay ou no botão `X`
- No desktop, a sidebar permanece sempre visível

### Status

✅ Implementada com sucesso

- Sem erros de compilação TypeScript
- Sem erros ESLint
- Sidebar mobile e desktop funcionando corretamente
- `app/dashboard/page.tsx` e `app/disparar/page.tsx` também atualizados para layout fixo com conteúdo direito rolando

### Observação

O prompt `PROMPT_MOBILE_LOGO.md` foi concluído integralmente.
