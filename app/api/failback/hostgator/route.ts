import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOST_URL = process.env.PAI_FAILBACK_HOST_URL!;
const HOST_KEY = process.env.PAI_FAILBACK_KEY!;
const TRIGGER_KEY = process.env.PAI_SYNC_TRIGGER_KEY!;

const INSERT_ORDER = [
  "sepultamentos",
  "coroas",
  "coroas_itens",
  "os_ordens",
  "est_movimento",
  "historico_sepultamentos",
] as const;

type Row = Record<string, any>;

function authOk(req: NextRequest) {
  const h = req.headers.get("authorization") ?? "";
  const supplied = h.startsWith("Bearer ") ? h.slice(7) : "";
  return !!TRIGGER_KEY && supplied === TRIGGER_KEY;
}

async function hostApply(payload: Row) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(HOST_URL, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-PAI-FAILBACK-KEY": HOST_KEY },
      body: JSON.stringify(payload),
      signal: c.signal,
    });
    const body = await r.json().catch(() => null);
    if (!r.ok || !body?.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
    return body;
  } finally { clearTimeout(timer); }
}

async function mapTarget(table: string, sourceId: any, dryRun = false): Promise<any> {
  if (sourceId == null || sourceId === "") return sourceId;
  const n = Number(sourceId);
  if (!Number.isFinite(n)) return sourceId;
  const { data, error } = await supabase.schema("pai").from("failback_id_map")
    .select("hostgator_id,status").eq("tabela", table).eq("supabase_id", n).maybeSingle();
  if (error) throw new Error(`mapa ${table}/${n}: ${error.message}`);
  if (!data) return n; // Registro já existia na HostGator: preserva o ID original.
  if (data.hostgator_id != null) return Number(data.hostgator_id);
  if (dryRun) return n; // Placeholder somente para simulação; não é usado no POST real.
  return null; // Dependência criada na contingência ainda não foi enviada.
}

async function rewriteFK(table: string, row: Row, dryRun = false): Promise<Row> {
  const out = { ...row };
  delete out.dr_uuid; delete out.synced_at;

  if (table === "coroas") {
    if (out.atendimento_origem_id != null) out.atendimento_origem_id = await mapTarget("sepultamentos", out.atendimento_origem_id, dryRun);
    if (out.falecido_atendimento_id != null) out.falecido_atendimento_id = await mapTarget("sepultamentos", out.falecido_atendimento_id, dryRun);
  } else if (table === "coroas_itens") {
    if (out.coroa_id != null) out.coroa_id = await mapTarget("coroas", out.coroa_id, dryRun);
  } else if (table === "historico_sepultamentos") {
    if (out.sepultamento_id != null) out.sepultamento_id = await mapTarget("sepultamentos", out.sepultamento_id, dryRun);
    if (out.desfeita_por_historico_id != null) {
      const mapped = await mapTarget("historico_sepultamentos", out.desfeita_por_historico_id, dryRun);
      if (mapped != null) out.desfeita_por_historico_id = mapped;
    }
  } else if (table === "os_ordens") {
    if (out.atendimento_id != null) out.atendimento_id = await mapTarget("sepultamentos", out.atendimento_id, dryRun);
    if (out.coroa_pedido_id != null) out.coroa_pedido_id = await mapTarget("coroas", out.coroa_pedido_id, dryRun);
  } else if (table === "est_movimento") {
    if (out.estorno_de_id != null) {
      const mapped = await mapTarget("est_movimento", out.estorno_de_id, dryRun);
      if (mapped != null) out.estorno_de_id = mapped;
    }
    if (out.estorno_movimento_id != null) {
      const mapped = await mapTarget("est_movimento", out.estorno_movimento_id, dryRun);
      if (mapped != null) out.estorno_movimento_id = mapped;
    }
  }
  return out;
}

function unresolvedFK(table: string, row: Row): string[] {
  const fields: Record<string, string[]> = {
    coroas: ["atendimento_origem_id", "falecido_atendimento_id"],
    coroas_itens: ["coroa_id"],
    historico_sepultamentos: ["sepultamento_id"],
    os_ordens: ["atendimento_id"],
  };
  return (fields[table] ?? []).filter((k) => row[k] === null);
}

async function getRow(table: string, id: number) {
  const { data, error } = await supabase.schema("pai").from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`ler ${table}/${id}: ${error.message}`);
  return data as Row | null;
}

async function run(dryRun: boolean) {
  const output: Row[] = [];

  // 1) INSERTs novos de contingência em ordem pai -> filho.
  for (const table of INSERT_ORDER) {
    const { data: maps, error } = await supabase.schema("pai").from("failback_id_map")
      .select("id,tabela,dr_uuid,supabase_id,hostgator_id,status")
      .eq("tabela", table).eq("status", "pendente").order("id", { ascending: true });
    if (error) throw new Error(`fila ${table}: ${error.message}`);

    for (const m of maps ?? []) {
      const sourceId = Number(m.supabase_id);
      const source = await getRow(table, sourceId);
      if (!source) {
        output.push({ table, source_id: sourceId, skipped: true, reason: "registro local removido antes do failback" });
        if (!dryRun) await supabase.schema("pai").from("failback_id_map").update({ status: "cancelado", atualizado_em: new Date().toISOString() }).eq("id", m.id);
        continue;
      }
      const row = await rewriteFK(table, source, dryRun);
      const missing = unresolvedFK(table, row);
      if (missing.length) throw new Error(`${table}/${sourceId}: dependência ainda sem ID HostGator: ${missing.join(",")}`);
      const res = await hostApply({ dry_run: dryRun, operation_uuid: String(m.dr_uuid), table, action: "insert", source_id: sourceId, row });
      output.push({ table, source_id: sourceId, target_id: res.target_id ?? null, dry_run: dryRun });
      if (!dryRun) {
        await supabase.schema("pai").from("failback_id_map").update({ hostgator_id: res.target_id, status: "enviado", enviado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(), erro: null }).eq("id", m.id);
      }
    }
  }

  // 2) UPDATE/DELETE e est_saldo, na ordem em que aconteceram.
  const { data: changes, error: ce } = await supabase.schema("pai").from("failback_changes")
    .select("id,change_uuid,tabela,acao,supabase_id,payload,status")
    .eq("status", "pendente").order("id", { ascending: true }).limit(2000);
  if (ce) throw new Error(`fila changes: ${ce.message}`);

  for (const c of changes ?? []) {
    const table = String(c.tabela), sourceId = c.supabase_id == null ? null : Number(c.supabase_id);
    let row = (c.payload ?? {}) as Row;
    row = await rewriteFK(table, row, dryRun);
    let targetId = sourceId == null ? null : await mapTarget(table, sourceId, dryRun);
    if (table === "est_saldo") targetId = sourceId;
    if ((c.acao === "update" || c.acao === "delete") && targetId == null) {
      // Se o registro novo ainda não existe na origem, o INSERT correspondente deve ter sido processado acima.
      targetId = sourceId == null ? null : await mapTarget(table, sourceId, dryRun);
    }
    const action = table === "est_saldo" && c.acao === "insert" ? "upsert" : c.acao;
    const res = await hostApply({ dry_run: dryRun, operation_uuid: String(c.change_uuid), table, action, source_id: sourceId, target_id: targetId, row });
    output.push({ table, action, source_id: sourceId, target_id: res.target_id ?? targetId, dry_run: dryRun });
    if (!dryRun) await supabase.schema("pai").from("failback_changes").update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null }).eq("id", c.id);
  }

  return output;
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: "Acesso negado." }, { status: 403 });
  if (!HOST_URL || !HOST_KEY) return NextResponse.json({ ok: false, error: "Variáveis PAI_FAILBACK_HOST_URL/PAI_FAILBACK_KEY ausentes." }, { status: 500 });
  try { return NextResponse.json({ ok: true, dry_run: true, dependency_placeholders: true, results: await run(true) }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: "Acesso negado." }, { status: 403 });
  if (!HOST_URL || !HOST_KEY) return NextResponse.json({ ok: false, error: "Variáveis PAI_FAILBACK_HOST_URL/PAI_FAILBACK_KEY ausentes." }, { status: 500 });
  const { data: control, error } = await supabase.schema("pai").from("sync_control").select("pull_enabled").eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (control?.pull_enabled) return NextResponse.json({ ok: false, error: "Failback bloqueado: desative sync_control.pull_enabled antes de executar." }, { status: 409 });
  try { return NextResponse.json({ ok: true, dry_run: false, results: await run(false) }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 }); }
}
