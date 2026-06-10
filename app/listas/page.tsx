"use client";

export const dynamic = "force-dynamic";

import { useState, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import { createClient } from "@/lib/supabase";
import { Upload } from "lucide-react";

function isValidEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return false;

  const atIndex = trimmed.indexOf("@");
  if (atIndex < 1) return false;

  const local = trimmed.substring(0, atIndex);

  if (local.length < 3) return false;
  if (/^[._\-+]|[._\-+]$/.test(local)) return false;
  if (/\.{2,}/.test(local)) return false;
  if (!/^[a-zA-Z0-9._+\-]+$/.test(local)) return false;

  return true;
}

type Resumo = {
  inseridos: number;
  invalidos: number;
  duplicatas: number;
  errosInsercao: number;
};

export default function ListasPage() {
  const [lista, setLista] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validarArquivo(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validarArquivo(file);
  }

  function validarArquivo(file: File) {
    if (!file.name.endsWith(".csv")) {
      setErro("Apenas arquivos .csv são aceitos.");
      setArquivo(null);
      return;
    }
    setErro("");
    setArquivo(file);
    setResumo(null);
  }

  async function handleProcessar() {
    if (!arquivo) {
      setErro("Selecione um arquivo CSV.");
      return;
    }
    if (!lista || isNaN(Number(lista)) || Number(lista) <= 0) {
      setErro("Informe um número de lista válido.");
      return;
    }

    setProcessando(true);
    setErro("");
    setResumo(null);
    setProgresso("Lendo arquivo...");

    try {
      const text = await arquivo.text();
      const linhas = text
        .split(/\r?\n/)
        .map((l) => l.trim().toLowerCase())
        .filter(Boolean);

      setProgresso(`${linhas.length} linhas encontradas. Validando...`);

      const validos: string[] = [];
      const invalidos: string[] = [];

      for (const linha of linhas) {
        if (isValidEmail(linha)) {
          validos.push(linha);
        } else {
          invalidos.push(linha);
        }
      }

      // Deduplica dentro do próprio CSV — primeira ocorrência segue o fluxo normal,
      // repetições são inseridas direto com status duplicate
      const validosUnicos = Array.from(new Set(validos));
      const duplicatasInternasCount = validos.length - validosUnicos.length;
      const duplicatasInternas: string[] = [];
      const vistosNoCsv = new Set<string>();
      for (const email of validos) {
        if (vistosNoCsv.has(email)) {
          duplicatasInternas.push(email);
        } else {
          vistosNoCsv.add(email);
        }
      }

      setProgresso(
        `${validosUnicos.length} válidos únicos, ${invalidos.length} inválidos. Verificando duplicatas...`
      );

      const supabase = createClient();
      const emailsParaVerificar = validosUnicos;
      const duplicatasSet = new Set<string>();

      const QUERY_BATCH = 500;
      for (let i = 0; i < emailsParaVerificar.length; i += QUERY_BATCH) {
        const lote = emailsParaVerificar.slice(i, i + QUERY_BATCH);
        const { data } = await supabase
          .from("email_lista")
          .select("email")
          .eq("lista", Number(lista))
          .in("email", lote);

        if (data) {
          data.forEach((r: { email: string }) => duplicatasSet.add(r.email));
        }
      }

      const duplicatasBancoCount = validosUnicos.filter((e) =>
        duplicatasSet.has(e)
      ).length;
      const totalDuplicatas = duplicatasBancoCount + duplicatasInternasCount;

      setProgresso(`${totalDuplicatas} duplicatas encontradas. Inserindo...`);

      const records = [
        ...validosUnicos
          .filter((e) => !duplicatasSet.has(e))
          .map((e) => ({ email: e, lista: Number(lista), status: null })),
        ...validosUnicos
          .filter((e) => duplicatasSet.has(e))
          .map((e) => ({
            email: e,
            lista: Number(lista),
            status: "duplicate" as const,
          })),
        ...duplicatasInternas.map((e) => ({
          email: e,
          lista: Number(lista),
          status: "duplicate" as const,
        })),
        ...invalidos.map((e) => ({
          email: e,
          lista: Number(lista),
          status: "invalid" as const,
        })),
      ];

      const INSERT_BATCH = 500;
      let totalErros = 0;

      for (let i = 0; i < records.length; i += INSERT_BATCH) {
        const lote = records.slice(i, i + INSERT_BATCH);
        setProgresso(
          `Inserindo... ${Math.min(i + INSERT_BATCH, records.length)} de ${records.length}`
        );

        const res = await fetch("/api/upload-lista", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: lote }),
        });

        const data = await res.json();
        totalErros += data.errors ?? 0;
      }

      setResumo({
        inseridos: validosUnicos.filter((e) => !duplicatasSet.has(e)).length,
        invalidos: invalidos.length,
        duplicatas: totalDuplicatas,
        errosInsercao: totalErros,
      });
      setProgresso("");
    } catch (e) {
      console.error(e);
      setErro("Erro inesperado ao processar o arquivo.");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-gray-50 pt-14 md:pt-0">
        <Sidebar />

        <main className="flex-1 p-4 md:p-8 min-w-0 overflow-y-auto">
          <h1 className="hidden md:block text-2xl font-bold text-gray-900 mb-6">
            Listas
          </h1>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 max-w-lg">
            <h2 className="text-base font-semibold text-gray-900 mb-5">
              Importar lista de emails
            </h2>

            {/* Explicação do processamento */}
            <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 mb-5">
              <p className="text-xs font-semibold text-blue-800 mb-1">
                O que acontece ao importar?
              </p>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>
                  <span className="font-medium">✅ Válido</span> — email com
                  formato correto, inserido como pendente para disparo.
                </li>
                <li>
                  <span className="font-medium">❌ Inválido</span> — email com
                  formato errado (ex: sem @, com espaço, começando com ponto).
                  Inserido como inválido, nunca será disparado.
                </li>
                <li>
                  <span className="font-medium">⚠️ Duplicata</span> — email que
                  já existe nessa lista ou que aparece mais de uma vez no
                  arquivo. Inserido como duplicata, nunca será disparado.
                </li>
              </ul>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Número da lista
              </label>
              <input
                type="number"
                min={1}
                value={lista}
                onChange={(e) => setLista(e.target.value)}
                placeholder="Ex: 18"
                disabled={processando}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => !processando && inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-4 ${
                dragging
                  ? "border-blue-400 bg-blue-50"
                  : arquivo
                    ? "border-green-400 bg-green-50"
                    : "border-gray-300 hover:border-gray-400 bg-gray-50"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload
                size={24}
                className={`mx-auto mb-2 ${
                  arquivo ? "text-green-500" : "text-gray-400"
                }`}
              />
              {arquivo ? (
                <div>
                  <p className="text-sm font-medium text-green-700">
                    {arquivo.name}
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {(arquivo.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-600">
                    Arraste o arquivo CSV aqui
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    ou clique para selecionar
                  </p>
                </div>
              )}
            </div>

            {erro && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
                {erro}
              </div>
            )}

            {progresso && (
              <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 mb-4">
                {progresso}
              </div>
            )}

            {resumo && (
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-4 space-y-1.5">
                <p className="text-sm font-semibold text-gray-900 mb-2">
                  Resultado do upload
                </p>
                <p className="text-sm text-green-700">
                  ✅ {resumo.inseridos.toLocaleString("pt-BR")} inseridos com
                  sucesso
                </p>
                <p className="text-sm text-orange-700">
                  ❌ {resumo.invalidos.toLocaleString("pt-BR")} inválidos
                  (regex)
                </p>
                <p className="text-sm text-yellow-700">
                  ⚠️ {resumo.duplicatas.toLocaleString("pt-BR")} duplicatas
                  ignoradas
                </p>
                {resumo.errosInsercao > 0 && (
                  <p className="text-sm text-red-700">
                    🔴 {resumo.errosInsercao.toLocaleString("pt-BR")} erros de
                    inserção
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleProcessar}
              disabled={processando || !arquivo || !lista}
              className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {processando ? "Processando..." : "Processar e importar"}
            </button>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
