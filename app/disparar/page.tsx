"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import { createClient } from "@/lib/supabase";

const fase1Rows = [
  { dia: "Dia 1", volume: 20, planilha: "Plan 16", acumulado: 20 },
  { dia: "Dias 2–3", volume: 50, planilha: "Plan 16", acumulado: 120 },
  { dia: "Dias 4–7", volume: 100, planilha: "Plan 16", acumulado: 520 },
  { dia: "Dias 8–11", volume: 150, planilha: "Plan 16", acumulado: 1120 },
  { dia: "Dias 12–14", volume: 200, planilha: "Plan 16", acumulado: 1720 },
];

type FormState = {
  lista: string;
  volume: string;
};

export default function DispararPage() {
  const [listas, setListas] = useState<number[]>([]);
  const [form, setForm] = useState<FormState>({
    lista: "16",
    volume: "",
  });
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchListas() {
      const supabase = createClient();
      const { data } = await supabase
        .from("email_lista")
        .select("lista")
        .order("lista", { ascending: true });

      if (data) {
        const unique = [
          ...new Set(data.map((r: { lista: number }) => r.lista)),
        ];
        setListas(unique);
        if (unique.length > 0) {
          setForm((prev) => ({ ...prev, lista: String(unique[0]) }));
        }
      }
    }
    fetchListas();
  }, []);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
    const apiKey = process.env.NEXT_PUBLIC_N8N_API_KEY;

    if (!webhookUrl) {
      setStatus("error");
      setMessage("URL do webhook n8n não configurada no .env.local");
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        lista: Number(form.lista),
        volume: Number(form.volume),
      }),
    });

    if (res.ok) {
      setStatus("success");
      setMessage(
        "Disparo iniciado com sucesso! O n8n está processando a fila.",
      );
      setForm({ lista: "16", volume: "" });
    } else {
      setStatus("error");
      setMessage(`Erro ao acionar o webhook: ${res.status} ${res.statusText}`);
    }
  }

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-gray-50 pt-14 md:pt-0">
        <Sidebar />

        <main className="flex-1 p-4 md:p-8 min-w-0 overflow-y-auto">
          <h1 className="hidden md:block text-2xl font-bold text-gray-900 mb-6">
            Novo Disparo
          </h1>

          {/* Fase 1 reference table */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-8 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Fase 1 — Semanas 1 e 2 (dias 1–14)
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Equipe e contatos próximos apenas
                </p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Plan 16
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Dia", "Volume/dia", "Planilha", "Acumulado"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {fase1Rows.map((row) => (
                    <tr key={row.dia} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {row.dia}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{row.volume}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {row.planilha}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {row.acumulado.toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-gray-100 bg-amber-50">
              <p className="text-xs text-amber-800">
                Plan 16 esgota (~1.932 emails). Sobra uma margem — use para
                reenvio de quem não abriu.
              </p>
            </div>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Emails usados
              </p>
              <p className="text-xl font-bold text-gray-900">1.932</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Meta abertura
              </p>
              <p className="text-xl font-bold text-green-700">&gt; 30%</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Meta spam
              </p>
              <p className="text-xl font-bold text-red-600">&lt; 0,3%</p>
            </div>
          </div>

          {/* Dispatch form */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 max-w-lg">
            <h2 className="text-base font-semibold text-gray-900 mb-5">
              Configurar disparo
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="lista"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Planilha / Lista
                </label>
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
              </div>

              <div>
                <label
                  htmlFor="volume"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Volume de envio
                </label>
                <input
                  id="volume"
                  name="volume"
                  type="number"
                  min={1}
                  max={500}
                  required
                  value={form.volume}
                  onChange={handleChange}
                  placeholder="Ex: 100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {status === "success" && (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                  {message}
                </div>
              )}
              {status === "error" && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {status === "loading" ? "Enviando..." : "Iniciar disparo"}
              </button>
            </form>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
