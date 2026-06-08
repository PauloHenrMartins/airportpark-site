# Atualização — Tooltip de Bounce no Dashboard

## Objetivo

Adicionar um ícone `?` ao lado do label "Bounce" no bloco de métricas AWS SES do dashboard,
que ao passar o mouse exibe um tooltip explicando o que é bounce e os limites recomendados pela AWS.

## Arquivo a alterar

`app/dashboard/page.tsx`

---

## Alteração 1 — Adicionar state do tooltip

Localizar a linha:
```typescript
const [expandedListas, setExpandedListas] = useState<Set<number>>(new Set());
```

Adicionar logo abaixo:
```typescript
const [bounceTooltip, setBounceTooltip] = useState(false);
```

---

## Alteração 2 — Substituir o card Bounce

Localizar o bloco inteiro do card Bounce:
```tsx
<div className="text-center">
  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
    Bounce
  </p>
  <p
    className={`text-2xl font-bold ${
      parseFloat(awsMetrics.bounceRate) < 2
        ? "text-green-600"
        : "text-red-600"
    }`}
  >
    {awsMetrics.bounceRate}%
  </p>
</div>
```

Substituir por:
```tsx
<div className="text-center">
  <div className="flex items-center justify-center gap-1 mb-1">
    <p className="text-xs text-gray-500 uppercase tracking-wider">
      Bounce
    </p>
    <div className="relative">
      <button
        onMouseEnter={() => setBounceTooltip(true)}
        onMouseLeave={() => setBounceTooltip(false)}
        className="text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="O que é Bounce?"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <path d="M12 17h.01"/>
        </svg>
      </button>
      {bounceTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 shadow-lg z-50 text-left leading-relaxed">
          <p className="font-semibold mb-1">O que é Bounce?</p>
          <p className="text-gray-300 mb-2">Email que não pôde ser entregue. Pode ser endereço inválido, caixa cheia ou servidor recusando.</p>
          <div className="border-t border-gray-700 pt-2 space-y-0.5">
            <p className="text-green-400">✓ Abaixo de 2% — saudável</p>
            <p className="text-yellow-400">⚠ Entre 2% e 5% — atenção</p>
            <p className="text-red-400">✕ Acima de 5% — risco de suspensão</p>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  </div>
  <p
    className={`text-2xl font-bold ${
      parseFloat(awsMetrics.bounceRate) < 2
        ? "text-green-600"
        : "text-red-600"
    }`}
  >
    {awsMetrics.bounceRate}%
  </p>
</div>
```

---

## Resultado esperado

- Label "Bounce" aparece com um ícone `?` ao lado
- Ao passar o mouse no `?`, abre tooltip escuro com:
  - Explicação simples do que é bounce
  - Faixa verde: abaixo de 2% — saudável
  - Faixa amarela: entre 2% e 5% — atenção
  - Faixa vermelha: acima de 5% — risco de suspensão
- Ao tirar o mouse, tooltip fecha
- Nenhuma outra parte do dashboard é alterada
