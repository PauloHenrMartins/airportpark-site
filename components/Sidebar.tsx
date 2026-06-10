"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { LayoutDashboard, Send, Filter, Upload, LogOut, Menu, X } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/disparar", label: "Disparar", icon: Send },
  { href: "/provedores", label: "Provedores", icon: Filter },
  { href: "/listas", label: "Listas", icon: Upload },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

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

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="relative p-5 border-b border-gray-200 flex items-center justify-center">
        <Image
          src="/img_airportpark_logo.png"
          alt="Airport Park"
          width={160}
          height={56}
          className="object-contain"
          priority
        />
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden absolute right-4 p-1 rounded text-gray-500 hover:bg-gray-100"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-start gap-3 px-4 py-4 rounded-xl text-base font-semibold transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Icon size={20} />
              <span className="leading-none">{label}</span>
            </Link>
          );
        })}
      </nav>

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
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-lg font-semibold text-gray-900">{pageTitle}</span>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 bg-white border border-gray-200 rounded-md shadow-sm text-gray-700"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
      </div>

      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`md:hidden fixed top-0 left-0 z-50 h-screen w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 overflow-hidden shadow-sm rounded-tr-2xl rounded-br-2xl ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      <aside className="hidden md:flex w-56 h-screen sticky top-0 bg-white border-r border-gray-200 flex-col flex-shrink-0 overflow-hidden shadow-sm rounded-tr-2xl rounded-br-2xl">
        {sidebarContent}
      </aside>
    </>
  );
}
