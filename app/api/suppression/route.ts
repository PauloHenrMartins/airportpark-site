import { NextResponse } from "next/server";
import {
  SESv2Client,
  ListSuppressedDestinationsCommand,
} from "@aws-sdk/client-sesv2";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const sesClient = new SESv2Client({
  region: process.env.AWS_REGION ?? "sa-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

const supabase = createClient(supabaseUrl, supabaseKey);

type SuppressionReason = "BOUNCE" | "COMPLAINT";

export async function GET() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return NextResponse.json(
      { error: "Credenciais AWS não configuradas" },
      { status: 500 }
    );
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Supabase não configurado" },
      { status: 500 }
    );
  }

  try {
    const cmd = new ListSuppressedDestinationsCommand({
      PageSize: 100,
    });

    const res = await sesClient.send(cmd);
    const items = res.SuppressedDestinationSummaries ?? [];

    const sorted = [...items].sort(
      (a, b) =>
        (b.LastUpdateTime?.getTime() ?? 0) - (a.LastUpdateTime?.getTime() ?? 0)
    );

    for (const item of sorted) {
      if (!item.EmailAddress) continue;

      await supabase
        .from("email_lista")
        .update({ status: "error" })
        .eq("email", item.EmailAddress)
        .eq("status", "success");
    }

    const suppressed = sorted.map((item) => ({
      email: item.EmailAddress ?? "",
      reason: (item.Reason ?? "BOUNCE") as SuppressionReason,
      date: item.LastUpdateTime
        ? new Date(item.LastUpdateTime).toISOString()
        : null,
    }));

    return NextResponse.json({
      total: suppressed.length,
      items: suppressed,
    });
  } catch (error) {
    console.error("Suppression list error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar suppression list" },
      { status: 500 }
    );
  }
}
