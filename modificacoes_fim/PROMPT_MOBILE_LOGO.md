# Modificação — Logo + Mobile Responsivo

Edite os arquivos: `components/Sidebar.tsx`, `app/dashboard/page.tsx` e `app/disparar/page.tsx`.
Não altere nenhum outro arquivo.

---

## Arquivo 1 — `components/Sidebar.tsx`

Substitua o arquivo inteiro por:

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { LayoutDashboard, Send, LogOut, Menu, X } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/disparar", label: "Disparar", icon: Send },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Fecha ao navegar
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <Image
          src="/img_airportpark_logo.png"
          alt="Airport Park"
          width={120}
          height={40}
          className="object-contain"
          priority
        />
        {/* Botão fechar no mobile */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden p-1 rounded text-gray-500 hover:bg-gray-100"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-gray-200">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Botão hamburguer — só mobile */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 p-2 bg-white border border-gray-200 rounded-md shadow-sm text-gray-700"
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>

      {/* Overlay — só mobile quando aberto */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar mobile (drawer) */}
      <aside
        className={`md:hidden fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Sidebar desktop (fixa) */}
      <aside className="hidden md:flex w-56 min-h-screen bg-white border-r border-gray-200 flex-col">
        {sidebarContent}
      </aside>
    </>
  );
}
```

---

## Arquivo 2 — `app/dashboard/page.tsx`

Faça apenas as seguintes alterações de classes CSS (não mude lógica):

### Layout principal
```
"flex min-h-screen bg-gray-50"
```
Troca por:
```
"flex min-h-screen bg-gray-50 pt-14 md:pt-0"
```
(O `pt-14` compensa o botão hamburguer fixo no mobile)

### Cards de resumo
```
"grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"
```
Já está responsivo — não muda.

### Grid de métricas AWS
```
"grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
```
Já está responsivo — não muda.

### Padding do main
```
"flex-1 p-8"
```
Troca por:
```
"flex-1 p-4 md:p-8 min-w-0"
```

### Tabela de listas — adicionar scroll
No div que envolve `<table className="min-w-full divide-y...">`:
```
"overflow-x-auto"
```
Já existe — confirma que está presente.

---

## Arquivo 3 — `app/disparar/page.tsx`

### Layout principal — mesmo ajuste do dashboard
```
"flex min-h-screen bg-gray-50"
```
Troca por:
```
"flex min-h-screen bg-gray-50 pt-14 md:pt-0"
```

### Padding do main
```
"flex-1 p-8"
```
Troca por:
```
"flex-1 p-4 md:p-8 min-w-0"
```

### Tabela fase 1 — colapsável no mobile

Adicione estado no componente:
```typescript
const [fase1Aberta, setFase1Aberta] = useState(false);
```

No header da tabela fase 1, torne o título clicável para toggle no mobile:
```tsx
<div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
  <div
    className="flex items-center gap-2 cursor-pointer md:cursor-default"
    onClick={() => setFase1Aberta((v) => !v)}
  >
    <div>
      <h2 className="text-sm font-semibold text-gray-900">
        Fase 1 — Semanas 1 e 2 (dias 1–14)
      </h2>
      <p className="text-xs text-gray-500 mt-0.5">
        Equipe e contatos próximos apenas
      </p>
    </div>
    <span className="md:hidden text-gray-400 text-xs ml-1">
      {fase1Aberta ? "▲" : "▼"}
    </span>
  </div>
  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
    Plan 16
  </span>
</div>
```

Envolva o corpo da tabela e os cards de métricas em condicional:
```tsx
<div className={`${fase1Aberta ? "block" : "hidden"} md:block`}>
  {/* overflow-x-auto com a tabela */}
  {/* cards de métricas */}
</div>
```

No mobile a tabela começa fechada. No desktop (`md:block`) sempre visível.

---

## Resumo

1. Edite `Sidebar.tsx` — logo + hamburguer + drawer mobile
2. Edite `dashboard/page.tsx` — pt-14 no container + padding responsivo
3. Edite `disparar/page.tsx` — pt-14 + padding responsivo + tabela colapsável
4. Não instale nada novo
5. Teste com `npm run dev` redimensionando a janela
