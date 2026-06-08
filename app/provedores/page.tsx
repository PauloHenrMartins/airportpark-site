"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import { createClient } from "@/lib/supabase";

type ProvedorRow = {
  dominio: string;
  quantidade: number;
  permitido: boolean;
};

export default function ProvedoresPage() {
  const [listas, setListas] = useState<number[]>([]);
  const [listaSelecionada, setListaSelecionada] = useState<string>("");
  const [provedores, setProvedores] = useState<ProvedorRow[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [mensagem, setMensagem] = useState("");

  // Busca listas disponíveis ao montar a página
  useEffect(() => {
    async function fetchListas() {
      const supabase = createClient();
      const { data } = await supabase
        .from("email_lista")
        .select("lista")
        .order("lista", { ascending: true });

      if (data) {
        const unique = data
          .map((r: { lista: number }) => r.lista)
          .filter((v: number, i: number, a: number[]) => a.indexOf(v) === i)
          .sort((a: number, b: number) => a - b);
        setListas(unique);
        if (unique.length > 0) {
          setListaSelecionada(String(unique[0]));
        }
      }
    }
    fetchListas();
  }, []);

  // Reseta a tabela ao trocar de lista
  function handleListaChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setListaSelecionada(e.target.value);
    setProvedores([]);
    setCarregado(false);
    setStatus("idle");
    setMensagem("");
  }

  async function handleCarregar() {
    if (!listaSelecionada) return;
    setCarregando(true);
    setStatus("idle");
    setMensagem("");

    const supabase = createClient();

    // 1. Busca domínios agrupados da lista
    const { data: emailData, error: emailError } = await supabase.rpc(
      "get_dominios_por_lista",
      { p_lista: Number(listaSelecionada) },
    );

    if (emailError || !emailData) {
      setStatus("error");
      setMensagem("Erro ao buscar domínios da lista.");
      setCarregando(false);
      return;
    }

    // 2. Busca configuração salva
    const { data: configData } = await supabase
      .from("lista_provedores")
      .select("dominio, permitido")
      .eq("lista", Number(listaSelecionada));

    const configMap: Record<string, boolean> = {};
    if (configData) {
      configData.forEach((c: { dominio: string; permitido: boolean }) => {
        configMap[c.dominio] = c.permitido;
      });
    }

    // 3. Cruza: domínio novo = desligado por padrão
    const merged: ProvedorRow[] = emailData.map(
      (row: { dominio: string; quantidade: number }) => ({
        dominio: row.dominio,
        quantidade: row.quantidade,
        permitido: configMap[row.dominio] ?? false,
      }),
    );

    setProvedores(merged);
    setCarregado(true);
    setCarregando(false);
  }

  function handleToggle(dominio: string) {
    setProvedores((prev) =>
      prev.map((p) =>
        p.dominio === dominio ? { ...p, permitido: !p.permitido } : p,
      ),
    );
  }

  async function handleSalvar() {
    if (!listaSelecionada || provedores.length === 0) return;
    setSalvando(true);
    setStatus("idle");
    setMensagem("");

    const supabase = createClient();

    const { error } = await supabase.from("lista_provedores").upsert(
      provedores.map((p) => ({
        lista: Number(listaSelecionada),
        dominio: p.dominio,
        permitido: p.permitido,
      })),
      { onConflict: "lista,dominio" },
    );

    if (error) {
      setStatus("error");
      setMensagem("Erro ao salvar configuração. Tente novamente.");
    } else {
      setStatus("success");
      setMensagem(
        `Configuração da Lista ${listaSelecionada} salva com sucesso.`,
      );
    }

    setSalvando(false);
  }

  const totalPermitidos = provedores.filter((p) => p.permitido).length;
  const totalBloqueados = provedores.filter((p) => !p.permitido).length;

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-gray-50 pt-14 md:pt-0">
        <Sidebar />

        <main className="flex-1 p-4 md:p-8 min-w-0 overflow-y-auto">
          <h1 className="hidden md:block text-2xl font-bold text-gray-900 mb-6">
            Provedores
          </h1>

          {/* Seletor de lista */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 max-w-lg mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Selecionar Lista
            </h2>
            <div className="flex gap-3">
              <select
                value={listaSelecionada}
                onChange={handleListaChange}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {listas.map((l) => (
                  <option key={l} value={String(l)}>
                    Plan {l}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCarregar}
                disabled={carregando || !listaSelecionada}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-md transition-colors"
              >
                {carregando ? "Carregando..." : "Carregar"}
              </button>
            </div>
          </div>

          {/* Tabela de provedores */}
          {carregado && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    Provedores — Plan {listaSelecionada}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {totalPermitidos} permitidos · {totalBloqueados} bloqueados
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Domínio
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quantidade
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Permitido
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {provedores.map((p) => (
                      <tr key={p.dominio} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {p.dominio}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {p.quantidade.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggle(p.dominio)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                              p.permitido ? "bg-blue-600" : "bg-gray-200"
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                p.permitido ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer com botão salvar */}
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  {status === "success" && (
                    <p className="text-sm text-green-700">{mensagem}</p>
                  )}
                  {status === "error" && (
                    <p className="text-sm text-red-700">{mensagem}</p>
                  )}
                </div>
                <button
                  onClick={handleSalvar}
                  disabled={salvando}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium rounded-md transition-colors"
                >
                  {salvando ? "Salvando..." : "Salvar Configuração"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
