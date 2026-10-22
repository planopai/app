import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOST_URL = process.env.PAI_SYNC_HOST_URL!;
const SYNC_KEY = process.env.PAI_SYNC_PULL_KEY!;
const TRIGGER_KEY = process.env.PAI_SYNC_TRIGGER_KEY!;

type TableCfg = {
  table: string;
  mode: "timestamp" | "append_window" | "snapshot";
  conflict: string;
};

const TABLES: TableCfg[] = [
  { table: "cargos", mode: "snapshot", conflict: "id" },
  { table: "cargo_paginas", mode: "snapshot", conflict: "cargo_id,pagina" },
  { table: "permissoes", mode: "snapshot", conflict: "id" },
  { table: "usuarios", mode: "snapshot", conflict: "id" },
  { table: "est_deposito", mode: "snapshot", conflict: "id" },

  { table: "est_categoria", mode: "timestamp", conflict: "id" },
  { table: "est_produto", mode: "timestamp", conflict: "id" },
  { table: "est_saldo", mode: "timestamp", conflict: "id" },
  { table: "sepultamentos", mode: "timestamp", conflict: "id" },
  { table: "coroas", mode: "timestamp", conflict: "id" },
  { table: "coroas_itens", mode: "timestamp", conflict: "id" },
  { table: "homenagens", mode: "timestamp", conflict: "id" },
  { table: "os_ordens", mode: "timestamp", conflict: "id" },

  { table: "historico_sepultamentos", mode: "append_window", conflict: "id" },
  { table: "est_movimento", mode: "append_window", conflict: "id" },
];

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Acesso negado." }, { status: 403 });
}

function mysqlDateFromIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;

  // HostGator opera em UTC-03. Converte cursor timestamptz do Supabase
  // para o DATETIME local do MySQL.
  const local = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 19).replace("T", " ");
}

function pgDateFromMysql(value: string | null | undefined): string | null {
  if (!value) return null;
  // DATETIME HostGator interpretado como UTC-03.
  const s = value.replace(" ", "T");
  const d = new Date(`${s}-03:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

async function getState(table: string) {
  const { data, error } = await supabase
    .schema("pai")
    .from("sync_state")
    .select("id,origem,tabela,ultimo_id,ultimo_updated_at,sincronizado_em")
    .eq("origem", "hostgator")
    .eq("tabela", table)
    .maybeSingle();

  if (error) throw new Error(`sync_state ${table}: ${error.message}`);
  return data;
}

async function ensureState(table: string) {
  let state = await getState(table);
  if (state) return state;

  const { error } = await supabase
    .schema("pai")
    .from("sync_state")
    .insert({
      origem: "hostgator",
      tabela: table,
      ultimo_id: null,
      ultimo_updated_at: null,
      sincronizado_em: new Date().toISOString(),
    });

  if (error) throw new Error(`criar sync_state ${table}: ${error.message}`);

  state = await getState(table);
  if (!state) throw new Error(`Não foi possível criar estado para ${table}`);
  return state;
}

async function pullBatch(cfg: TableCfg, state: any) {
  const url = new URL(HOST_URL);
  url.searchParams.set("table", cfg.table);

  if (state?.ultimo_id != null) {
    url.searchParams.set("id", String(state.ultimo_id));
  }

  if (cfg.mode === "timestamp" && state?.ultimo_updated_at) {
    const mysql = mysqlDateFromIso(String(state.ultimo_updated_at));
    if (mysql) url.searchParams.set("updated_at", mysql);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const r = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "X-PAI-SYNC-KEY": SYNC_KEY,
        "Accept": "application/json",
      },
      signal: controller.signal,
    });

    const body = await r.json().catch(() => null);

    if (!r.ok || !body?.ok) {
      throw new Error(
        `HostGator ${cfg.table}: ${body?.error ?? `HTTP ${r.status}`}`,
      );
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeRows(table: string, rows: any[]) {
  if (table !== "usuarios") return rows;

  // Defesa em profundidade. O PHP já não envia senha, mas removemos caso
  // uma versão futura do endpoint seja alterada incorretamente.
  return rows.map((row) => {
    const copy = { ...row };
    delete copy.senha;
    delete copy.password;
    return copy;
  });
}

async function upsertRows(cfg: TableCfg, rows: any[]) {
  if (!rows.length) return;

  const clean = sanitizeRows(cfg.table, rows);

  // Lotes pequenos para evitar payloads grandes do PostgREST.
  for (let i = 0; i < clean.length; i += 100) {
    const part = clean.slice(i, i + 100);
    const { error } = await supabase
      .schema("pai")
      .from(cfg.table)
      .upsert(part, {
        onConflict: cfg.conflict,
        ignoreDuplicates: false,
      });

    if (error) {
      throw new Error(`upsert ${cfg.table}: ${error.message}`);
    }
  }
}

async function updateState(table: string, stateId: number, next: any) {
  const patch: Record<string, any> = {
    sincronizado_em: new Date().toISOString(),
  };

  if (next?.id != null) patch.ultimo_id = Number(next.id);

  if (next?.updated_at) {
    patch.ultimo_updated_at = pgDateFromMysql(String(next.updated_at));
  }

  const { error } = await supabase
    .schema("pai")
    .from("sync_state")
    .update(patch)
    .eq("id", stateId)
    .eq("origem", "hostgator")
    .eq("tabela", table);

  if (error) throw new Error(`avançar cursor ${table}: ${error.message}`);
}

async function syncTable(cfg: TableCfg) {
  let state = await ensureState(cfg.table);
  let total = 0;
  let batches = 0;

  // Limite defensivo por execução. Próximo cron continua do cursor.
  for (let pass = 0; pass < 8; pass++) {
    const batch = await pullBatch(cfg, state);
    const rows = Array.isArray(batch.rows) ? batch.rows : [];

    await upsertRows(cfg, rows);

    // Cursor só avança depois de todos os upserts deste lote.
    await updateState(cfg.table, Number(state.id), batch.next);

    total += rows.length;
    batches++;

    state = {
      ...state,
      ultimo_id: batch?.next?.id ?? state.ultimo_id,
      ultimo_updated_at:
        batch?.next?.updated_at
          ? pgDateFromMysql(String(batch.next.updated_at))
          : state.ultimo_updated_at,
    };

    if (!batch.has_more || rows.length === 0 || cfg.mode === "snapshot") break;
  }

  return { table: cfg.table, rows: total, batches };
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const supplied =
    auth.startsWith("Bearer ")
      ? auth.slice(7)
      : request.headers.get("x-pai-sync-trigger") ?? "";

  if (!TRIGGER_KEY || supplied !== TRIGGER_KEY) return unauthorized();

  if (!HOST_URL || !SYNC_KEY) {
    return NextResponse.json(
      { ok: false, error: "Variáveis de sincronização ausentes." },
      { status: 500 },
    );
  }

  const { data: control, error: controlError } = await supabase
    .schema("pai")
    .from("sync_control")
    .select("pull_enabled,motivo")
    .eq("id", 1)
    .maybeSingle();

  if (controlError) {
    return NextResponse.json(
      { ok: false, error: controlError.message },
      { status: 500 },
    );
  }

  if (!control?.pull_enabled) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: control?.motivo ?? "Pull desativado.",
    });
  }

  const started = Date.now();
  const results: any[] = [];

  try {
    for (const cfg of TABLES) {
      results.push(await syncTable(cfg));

      // Não deixa uma execução ocupar a função por tempo demais.
      if (Date.now() - started > 50_000) break;
    }

    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - started,
      results,
    });
  } catch (error: any) {
    console.error("[sync:hostgator]", error);

    return NextResponse.json(
      {
        ok: false,
        error: String(error?.message ?? "Falha na sincronização."),
        partial_results: results,
      },
      { status: 500 },
    );
  }
}
