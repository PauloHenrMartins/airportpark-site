# Modificações no site AirportPark Disparos

Você vai editar arquivos existentes de um projeto Next.js 14. Não recrie nada do zero — edite apenas o necessário.

---

## Modificação 1 — `app/dashboard/page.tsx`

### Remover
- Remova completamente a seção `{/* Table */}` (a tabela de registros com paginação, incluindo o estado `rows`, `page`, `total`, `fetchPage`, `handlePageChange`, `totalPages`, `StatusBadge`, e tudo relacionado).
- Remova os imports não utilizados após a remoção.

### Adicionar — Métricas AWS CloudWatch no lugar da tabela

Após o gráfico de barras, adicione uma nova seção de métricas AWS com botão de atualizar.

**Crie uma API Route** `app/api/metrics/route.ts` que busca métricas do CloudWatch:

```typescript
import { NextResponse } from 'next/server'
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch'

const client = new CloudWatchClient({
  region: process.env.AWS_REGION ?? 'sa-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

async function getMetric(metricName: string, days = 30) {
  const EndTime = new Date()
  const StartTime = new Date()
  StartTime.setDate(StartTime.getDate() - days)

  const cmd = new GetMetricStatisticsCommand({
    Namespace: 'AWS/SES',
    MetricName: metricName,
    StartTime,
    EndTime,
    Period: days * 86400,
    Statistics: ['Sum'],
  })

  try {
    const res = await client.send(cmd)
    return res.Datapoints?.[0]?.Sum ?? 0
  } catch {
    return 0
  }
}

export async function GET() {
  const [sends, deliveries, opens, clicks, bounces, complaints] = await Promise.all([
    getMetric('Send'),
    getMetric('Delivery'),
    getMetric('Open'),
    getMetric('Click'),
    getMetric('Bounce'),
    getMetric('Complaint'),
  ])

  const deliveryRate = sends > 0 ? ((deliveries / sends) * 100).toFixed(1) : '0.0'
  const openRate = deliveries > 0 ? ((opens / deliveries) * 100).toFixed(1) : '0.0'
  const clickRate = deliveries > 0 ? ((clicks / deliveries) * 100).toFixed(1) : '0.0'
  const bounceRate = sends > 0 ? ((bounces / sends) * 100).toFixed(2) : '0.00'
  const complaintRate = sends > 0 ? ((complaints / sends) * 100).toFixed(3) : '0.000'

  return NextResponse.json({
    sends,
    deliveries,
    opens,
    clicks,
    bounces,
    complaints,
    deliveryRate,
    openRate,
    clickRate,
    bounceRate,
    complaintRate,
  })
}
```

**Instale o SDK:** `npm install @aws-sdk/client-cloudwatch`

**No `dashboard/page.tsx`**, adicione estado e fetch para as métricas AWS:

```typescript
type AwsMetrics = {
  sends: number
  deliveries: number
  opens: number
  clicks: number
  bounces: number
  complaints: number
  deliveryRate: string
  openRate: string
  clickRate: string
  bounceRate: string
  complaintRate: string
} | null

const [awsMetrics, setAwsMetrics] = useState<AwsMetrics>(null)
const [awsLoading, setAwsLoading] = useState(false)

async function fetchAwsMetrics() {
  setAwsLoading(true)
  try {
    const res = await fetch('/api/metrics')
    const data = await res.json()
    setAwsMetrics(data)
  } catch {
    // silencia erro
  } finally {
    setAwsLoading(false)
  }
}
```

**Adicione a seção de métricas AWS ANTES dos cards de resumo do Supabase** (no topo do dashboard, logo após o `<h1>`):

```tsx
{/* AWS Metrics */}
<div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-8">
  <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
    <div>
      <h2 className="text-base font-semibold text-gray-900">Métricas de Reputação — AWS SES</h2>
      <p className="text-xs text-gray-500 mt-0.5">Últimos 30 dias • Dados do CloudWatch</p>
    </div>
    <button
      onClick={fetchAwsMetrics}
      disabled={awsLoading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 text-gray-700 transition-colors"
    >
      {awsLoading ? 'Atualizando...' : '↻ Atualizar'}
    </button>
  </div>
  <div className="p-5">
    {!awsMetrics && !awsLoading && (
      <p className="text-sm text-gray-400 text-center py-4">
        Clique em "Atualizar" para carregar as métricas do CloudWatch.
      </p>
    )}
    {awsLoading && (
      <p className="text-sm text-gray-400 text-center py-4">Buscando métricas na AWS...</p>
    )}
    {awsMetrics && !awsLoading && (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Enviados</p>
          <p className="text-2xl font-bold text-gray-900">{awsMetrics.sends.toLocaleString('pt-BR')}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Entregues</p>
          <p className="text-2xl font-bold text-blue-600">{awsMetrics.deliveryRate}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Abertura</p>
          <p className={`text-2xl font-bold ${parseFloat(awsMetrics.openRate) >= 20 ? 'text-green-600' : 'text-yellow-600'}`}>
            {awsMetrics.openRate}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Bounce</p>
          <p className={`text-2xl font-bold ${parseFloat(awsMetrics.bounceRate) < 2 ? 'text-green-600' : 'text-red-600'}`}>
            {awsMetrics.bounceRate}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Reclamação</p>
          <p className={`text-2xl font-bold ${parseFloat(awsMetrics.complaintRate) < 0.1 ? 'text-green-600' : 'text-red-600'}`}>
            {awsMetrics.complaintRate}%
          </p>
        </div>
      </div>
    )}
  </div>
</div>
```

---

## Modificação 2 — `app/disparar/page.tsx`

### 1. Remover campo assunto
- Remova o campo `assunto` do tipo `FormState`
- Remova o campo `assunto` do estado inicial
- Remova o bloco JSX inteiro do input de assunto
- Remova `assunto` do payload enviado ao webhook
- Remova `assunto` do reset após sucesso

### 2. Diminuir tabela fase 1
Substitua as classes de padding da tabela por versões menores:
- `px-5 py-3` → `px-3 py-2` nas células `<td>` e `<th>`
- `px-5 py-4` → `px-4 py-3` no header da seção
- `text-base` → `text-sm` no título da fase
- `text-2xl font-bold` → `text-xl font-bold` nos cards de métricas
- `p-5` → `p-4` nos cards de métricas

### 3. GET dinâmico das listas
Substitua o `<select>` com options hardcoded por um select dinâmico:

Adicione estado no componente:
```typescript
const [listas, setListas] = useState<number[]>([])

useEffect(() => {
  async function fetchListas() {
    const supabase = createClient()
    const { data } = await supabase
      .from('email_lista')
      .select('lista')
      .order('lista', { ascending: true })
    
    if (data) {
      const unique = [...new Set(data.map((r: { lista: number }) => r.lista))]
      setListas(unique)
      if (unique.length > 0) {
        setForm(prev => ({ ...prev, lista: String(unique[0]) }))
      }
    }
  }
  fetchListas()
}, [])
```

Adicione o import do createClient:
```typescript
import { createClient } from '@/lib/supabase'
```

Substitua o select estático:
```tsx
<select
  id="lista"
  name="lista"
  value={form.lista}
  onChange={handleChange}
  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
>
  {listas.map((l) => (
    <option key={l} value={String(l)}>
      Plan {l}
    </option>
  ))}
</select>
```

---

## Variáveis de ambiente necessárias no `.env.local`

Confirme que existem:
```
AWS_ACCESS_KEY_ID=sua_access_key
AWS_SECRET_ACCESS_KEY=sua_secret_key
AWS_REGION=sa-east-1
```

---

## Resumo do que fazer

1. Criar `app/api/metrics/route.ts` com o código acima
2. Editar `app/dashboard/page.tsx` — remover tabela, adicionar seção AWS
3. Editar `app/disparar/page.tsx` — remover assunto, compactar tabela, GET dinâmico
4. Rodar `npm install @aws-sdk/client-cloudwatch`
5. Testar com `npm run dev`

**Não altere nenhum outro arquivo. Não mude o tema, layout ou autenticação.**
