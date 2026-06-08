import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder",
  );

export type EmailLista = {
  id: string;
  email: string;
  lista: number;
  enviado_em: string | null;
  status: "success" | "error" | null;
  feedback: Record<string, unknown> | null;
  created_at: string;
};

export type ListaProvedor = {
  id: string;
  lista: number;
  dominio: string;
  permitido: boolean;
  created_at: string;
};
