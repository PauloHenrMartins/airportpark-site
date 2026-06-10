"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import { createClient } from "@/lib/supabase";

type DayCount = { date: string; total: number };

type AwsMetrics = {
  sends: number;
  deliveries: number;
  opens: number;
  clicks: number;
  bounces: number;
  complaints: number;
  deliveryRate: string;
  openRate: string;
  clickRate: string;
  bounceRate: string;
  complaintRate: string;
} | null;

type ListaStat = {
  lista: number;
  total: number;
  enviados: number;
  pendentes: number;
  erros: number;
};

type LoteStat = {
  lista: number;
  enviado_em: string;
  total: number;
  enviados: number;
  erros: number;
};

type HetrixData = {
  domain: string;
  label: string;
  blacklistedCount: number;
  blacklistedOn: string[];
  totalRbls: number;
  status: "clean" | "blacklisted";
} | null;

export default function DashboardPage() {
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [chartData, setChartData] = useState<DayCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [awsMetrics, setAwsMetrics] = useState<AwsMetrics>(null);
  const [awsLoading, setAwsLoading] = useState(false);
  const [listaStats, setListaStats] = useState<ListaStat[]>([]);
  const [listaLoading, setListaLoading] = useState(true);
  const [loteStats, setLoteStats] = useState<LoteStat[]>([]);
  const [expandedListas, setExpandedListas] = useState<Set<number>>(new Set());
  const [bounceTooltip, setBounceTooltip] = useState(false);
  const [hetrixData, setHetrixData] = useState<HetrixData>(null);
  const [hetrixLoading, setHetrixLoading] = useState(true);
  const [hetrixError, setHetrixError] = useState(false);

  const supabase = createClient();

  const fetchStats = useCallback(async () => {
    const [successRes, errorRes, pendingRes] = await Promise.all([
      supabase
        .from("email_lista")
        .select("id", { count: "exact", head: true })
        .eq("status", "success"),
      supabase
        .from("email_lista")
        .select("id", { count: "exact", head: true })
        .eq("status", "error"),
      supabase
        .from("email_lista")
        .select("id", { count: "exact", head: true })
        .is("enviado_em", null),
    ]);
    setSuccessCount(successRes.count ?? 0);
    setErrorCount(errorRes.count ?? 0);
    setPendingCount(pendingRes.count ?? 0);
  }, [supabase]);

  const fetchChart = useCallback(async () => {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data } = await supabase
      .from("email_lista")
      .select("enviado_em")
      .gte("enviado_em", since.toISOString())
      .not("enviado_em", "is", null);

    if (!data) return;

    const counts: Record<string, number> = {};
    data.forEach((row: { enviado_em: string | null }) => {
      const day = new Date(row.enviado_em!).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      counts[day] = (counts[day] ?? 0) + 1;
    });

    const sorted = Object.entries(counts)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => {
        const [da, ma] = a.date.split("/").map(Number);
        const [db, mb] = b.date.split("/").map(Number);
        return ma !== mb ? ma - mb : da - db;
      });

    setChartData(sorted);
  }, [supabase]);

  async function fetchAwsMetrics() {
    setAwsLoading(true);
    try {
      const res = await fetch("/api/metrics");
      const data = await res.json();
      setAwsMetrics(data);
    } catch {
      // silencia erro
    } finally {
      setAwsLoading(false);
    }
  }

  async function fetchHetrix() {
    setHetrixLoading(true);
    setHetrixError(false);
    try {
      const res = await fetch("/api/hetrix");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHetrixData(data);
    } catch {
      setHetrixError(true);
    } finally {
      setHetrixLoading(false);
    }
  }

  const fetchListaStats = useCallback(async () => {
    setListaLoading(true);
    try {
      const { data } = await supabase.rpc("get_stats_por_lista");
      setListaStats(data ?? []);
    } catch {
      // silencia erro
    } finally {
      setListaLoading(false);
    }
  }, [supabase]);

  const fetchLoteStats = useCallback(async () => {
    try {
      const { data } = await supabase.rpc("get_lotes_por_lista");
      setLoteStats(data ?? []);
    } catch {
      // silencia erro
    }
  }, [supabase]);

  function toggleLista(lista: number) {
    setExpandedListas((prev) => {
      const next = new Set(prev);
      if (next.has(lista)) {
        next.delete(lista);
      } else {
        next.add(lista);
      }
      return next;
    });
  }

  useEffect(() => {
    setLoading(true);
    fetchHetrix();
    Promise.all([
      fetchStats(),
      fetchChart(),
      fetchListaStats(),
      fetchLoteStats(),
    ]).finally(() => setLoading(false));
  }, [fetchStats, fetchChart, fetchListaStats, fetchLoteStats]);

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-gray-50 pt-14 md:pt-0">
        <Sidebar />

        <main className="flex-1 p-4 md:p-8 min-w-0 overflow-y-auto">
          <h1 className="hidden md:block text-2xl font-bold text-gray-900 mb-6">
            Dashboard
          </h1>

          {/* AWS Metrics */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-8">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Métricas de Reputação — AWS SES
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Últimos 30 dias • Dados do CloudWatch
                </p>
              </div>
              <button
                onClick={fetchAwsMetrics}
                disabled={awsLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 text-gray-700 transition-colors"
              >
                {awsLoading ? "Atualizando..." : "↻ Atualizar"}
              </button>
            </div>
            <div className="p-5">
              {!awsMetrics && !awsLoading && (
                <p className="text-sm text-gray-400 text-center py-4">
                  Clique em &quot;Atualizar&quot; para carregar as métricas do
                  CloudWatch.
                </p>
              )}
              {awsLoading && (
                <p className="text-sm text-gray-400 text-center py-4">
                  Buscando métricas na AWS...
                </p>
              )}
              {awsMetrics && !awsLoading && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                      Enviados
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      {awsMetrics.sends.toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                      Entregues
                    </p>
                    <p className="text-2xl font-bold text-blue-600">
                      {awsMetrics.deliveryRate}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                      Abertura
                    </p>
                    <p
                      className={`text-2xl font-bold ${
                        parseFloat(awsMetrics.openRate) >= 20
                          ? "text-green-600"
                          : "text-yellow-600"
                      }`}
                    >
                      {awsMetrics.openRate}%
                    </p>
                  </div>
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
                          : parseFloat(awsMetrics.bounceRate) <= 5
                            ? "text-yellow-600"
                            : "text-red-600"
                      }`}
                    >
                      {awsMetrics.bounceRate}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                      Reclamação
                    </p>
                    <p
                      className={`text-2xl font-bold ${
                        parseFloat(awsMetrics.complaintRate) < 0.1
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {awsMetrics.complaintRate}%
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card Blacklist Monitor — HetrixTools */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Blacklist Monitor — HetrixTools
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Verificação de listas negras de email
                </p>
              </div>
              {hetrixData && (
                <span className="text-xs text-gray-400">
                  {hetrixData.domain}
                </span>
              )}
            </div>

            <div className="px-4 py-4">
              {hetrixLoading && (
                <p className="text-sm text-gray-400">Carregando...</p>
              )}

              {hetrixError && !hetrixLoading && (
                <p className="text-sm text-red-600">
                  Erro ao carregar dados do HetrixTools.
                </p>
              )}

              {!hetrixLoading && !hetrixError && hetrixData && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        hetrixData.status === "clean"
                          ? "bg-green-100"
                          : "bg-red-100"
                      }`}
                    >
                      {hetrixData.status === "clean" ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                          <path d="M20 6 9 17l-5-5"/>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                          <path d="M18 6 6 18M6 6l12 12"/>
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className={`text-base font-bold ${
                        hetrixData.status === "clean" ? "text-green-700" : "text-red-700"
                      }`}>
                        {hetrixData.status === "clean" ? "Domínio Limpo" : `Listado em ${hetrixData.blacklistedCount} blacklist${hetrixData.blacklistedCount > 1 ? "s" : ""}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        {hetrixData.totalRbls} blacklists verificadas
                      </p>
                    </div>
                  </div>

                  {hetrixData.blacklistedOn.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 sm:ml-4">
                      {hetrixData.blacklistedOn.map((rbl) => (
                        <span
                          key={rbl}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"
                        >
                          {rbl}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <p className="text-sm text-gray-500 mb-1">Total enviados</p>
              <p className="text-3xl font-bold text-green-700">
                {loading ? "—" : successCount.toLocaleString("pt-BR")}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <p className="text-sm text-gray-500 mb-1">Total pendentes</p>
              <p className="text-3xl font-bold text-gray-700">
                {loading ? "—" : pendingCount.toLocaleString("pt-BR")}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <p className="text-sm text-gray-500 mb-1">Total com erro</p>
              <p className="text-3xl font-bold text-red-700">
                {loading ? "—" : errorCount.toLocaleString("pt-BR")}
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm mb-8">
            <h2 className="text-base font-semibold text-gray-800 mb-4">
              Disparos por dia — últimos 30 dias
            </h2>
            {chartData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">
                Nenhum disparo nos últimos 30 dias.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={chartData}
                  margin={{ top: 0, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      border: "1px solid #e5e7eb",
                      borderRadius: 6,
                    }}
                  />
                  <Bar
                    dataKey="total"
                    fill="#2563eb"
                    radius={[3, 3, 0, 0]}
                    name="Disparos"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Stats por lista com lotes expansíveis */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Progresso por Lista
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Clique em uma lista para ver os lotes de disparo
                </p>
              </div>
              <button
                onClick={() => {
                  fetchListaStats();
                  fetchLoteStats();
                }}
                disabled={listaLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 text-gray-700 transition-colors"
              >
                {listaLoading ? "Atualizando..." : "↻ Atualizar"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      "",
                      "Lista",
                      "Total",
                      "Enviados",
                      "Pendentes",
                      "Erros",
                      "Progresso",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {listaLoading ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-8 text-center text-gray-400"
                      >
                        Carregando...
                      </td>
                    </tr>
                  ) : listaStats.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-8 text-center text-gray-400"
                      >
                        Nenhum dado encontrado.
                      </td>
                    </tr>
                  ) : (
                    listaStats.map((row) => {
                      const pct =
                        row.total > 0
                          ? Math.round((row.enviados / row.total) * 100)
                          : 0;
                      const barColor =
                        pct >= 80
                          ? "bg-green-500"
                          : pct >= 40
                            ? "bg-yellow-400"
                            : "bg-red-400";
                      const isExpanded = expandedListas.has(row.lista);
                      const lotes = loteStats.filter(
                        (l) => l.lista === row.lista,
                      );

                      return (
                        <>
                          {/* Linha principal da lista */}
                          <tr
                            key={`lista-${row.lista}`}
                            className="hover:bg-gray-50 cursor-pointer select-none"
                            onClick={() => toggleLista(row.lista)}
                          >
                            <td className="px-4 py-3 text-gray-400 w-8">
                              <span className="text-xs">
                                {isExpanded ? "▼" : "▶"}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              Plan {row.lista}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {Number(row.total).toLocaleString("pt-BR")}
                            </td>
                            <td className="px-4 py-3 text-green-700 font-medium">
                              {Number(row.enviados).toLocaleString("pt-BR")}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {Number(row.pendentes).toLocaleString("pt-BR")}
                            </td>
                            <td className="px-4 py-3 text-red-600">
                              {Number(row.erros).toLocaleString("pt-BR")}
                            </td>
                            <td className="px-4 py-3 w-48">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-100 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full ${barColor} transition-all`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-600 w-8 text-right">
                                  {pct}%
                                </span>
                              </div>
                            </td>
                          </tr>

                          {/* Linhas de lotes (sub-tabela expansível) */}
                          {isExpanded && (
                            <tr key={`lotes-${row.lista}`}>
                              <td colSpan={7} className="bg-gray-50 px-0 py-0">
                                {lotes.length === 0 ? (
                                  <p className="px-12 py-3 text-xs text-gray-400">
                                    Nenhum lote encontrado para esta lista.
                                  </p>
                                ) : (
                                  <table className="min-w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-gray-200">
                                        <th className="pl-12 pr-4 py-2 text-left font-medium text-gray-400 uppercase tracking-wider">
                                          Data / Hora
                                        </th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-400 uppercase tracking-wider">
                                          Qtd
                                        </th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-400 uppercase tracking-wider">
                                          Sucesso
                                        </th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-400 uppercase tracking-wider">
                                          Erros
                                        </th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-400 uppercase tracking-wider">
                                          Taxa
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lotes.map((lote, idx) => {
                                        const lotePct =
                                          lote.total > 0
                                            ? Math.round(
                                                (lote.enviados / lote.total) *
                                                  100,
                                              )
                                            : 0;
                                        return (
                                          <tr
                                            key={idx}
                                            className="border-b border-gray-100 last:border-0 hover:bg-gray-100"
                                          >
                                            <td className="pl-12 pr-4 py-2 text-gray-600 font-mono">
                                              {new Date(
                                                lote.enviado_em,
                                              ).toLocaleString("pt-BR", {
                                                day: "2-digit",
                                                month: "2-digit",
                                                year: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                                second: "2-digit",
                                              })}
                                            </td>
                                            <td className="px-4 py-2 text-gray-700 font-medium">
                                              {Number(
                                                lote.total,
                                              ).toLocaleString("pt-BR")}
                                            </td>
                                            <td className="px-4 py-2 text-green-700">
                                              {Number(
                                                lote.enviados,
                                              ).toLocaleString("pt-BR")}
                                            </td>
                                            <td className="px-4 py-2 text-red-600">
                                              {Number(
                                                lote.erros,
                                              ).toLocaleString("pt-BR")}
                                            </td>
                                            <td className="px-4 py-2">
                                              <span
                                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                  lotePct === 100
                                                    ? "bg-green-100 text-green-800"
                                                    : lotePct >= 80
                                                      ? "bg-yellow-100 text-yellow-800"
                                                      : "bg-red-100 text-red-800"
                                                }`}
                                              >
                                                {lotePct}%
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
