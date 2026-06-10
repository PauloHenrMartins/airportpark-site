import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

const supabase = createClient(supabaseUrl, supabaseKey);

type EmailRecord = {
  email: string;
  lista: number;
  status: "invalid" | "duplicate" | null;
};

export async function POST(request: Request): Promise<NextResponse> {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Supabase não configurado" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { records } = body as { records: EmailRecord[] };

    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: "Nenhum registro para inserir" },
        { status: 400 }
      );
    }

    const BATCH_SIZE = 500;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      const { error } = await supabase.from("email_lista").insert(
        batch.map((r) => ({
          email: r.email.trim().toLowerCase(),
          lista: r.lista,
          status: r.status,
        }))
      );

      if (error) {
        errors += batch.length;
        console.error("Batch insert error:", error);
      } else {
        inserted += batch.length;
      }
    }

    return NextResponse.json({ inserted, errors });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Erro ao processar upload" },
      { status: 500 }
    );
  }
}
