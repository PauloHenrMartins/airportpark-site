import { NextResponse } from "next/server";

type HetrixMonitor = {
  Label?: string;
  Target?: string;
  Blacklisted_Count?: number | string;
  Blacklisted_On?: string[] | null;
};

type HetrixApiResponse = [HetrixMonitor[], { Meta?: { Total_Records?: string } }];

export async function GET() {
  const apiKey = process.env.HETRIXTOOLS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "HETRIXTOOLS_API_KEY não configurada" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://api.hetrixtools.com/v2/${apiKey}/blacklist/monitors/0/10/`,
      { next: { revalidate: 0 } }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Erro HetrixTools: ${res.status}` },
        { status: res.status }
      );
    }

    const data: HetrixApiResponse | { status?: string; error_message?: string } =
      await res.json();

    if (!Array.isArray(data)) {
      return NextResponse.json(
        { error: data.error_message ?? "Erro HetrixTools" },
        { status: 502 }
      );
    }

    const monitors = Array.isArray(data[0]) ? data[0] : [];

    const monitor =
      monitors.find((m) =>
        String(m.Target ?? "")
          .toLowerCase()
          .includes("gruairportpark.com.br")
      ) ??
      monitors[0] ??
      null;

    if (!monitor) {
      return NextResponse.json(
        { error: "Monitor não encontrado" },
        { status: 404 }
      );
    }

    const blacklistedCount = Number(monitor.Blacklisted_Count ?? 0);
    const blacklistedOn = Array.isArray(monitor.Blacklisted_On)
      ? monitor.Blacklisted_On
      : [];
    const totalRbls = 23;

    return NextResponse.json({
      domain: monitor.Target,
      label: monitor.Label,
      blacklistedCount,
      blacklistedOn,
      totalRbls,
      status: blacklistedCount === 0 ? "clean" : "blacklisted",
    });
  } catch {
    return NextResponse.json(
      { error: "Erro ao conectar com HetrixTools" },
      { status: 500 }
    );
  }
}
