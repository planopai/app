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
  reconcileDeletes?: boolean;
};

const TABLES: TableCfg[] = [
  // Base já validada anteriormente.
  { table: "cargos", mode: "snapshot", conflict: "id", reconcileDeletes: true },
  { table: "cargo_paginas", mode: "snapshot", conflict: "cargo_id,pagina" },
  { table: "permissoes", mode: "snapshot", conflict: "user_id,pagina" },
  { table: "usuarios", mode: "snapshot", conflict: "id", reconcileDeletes: true },
  { table: "est_deposito", mode: "snapshot", conflict: "id", reconcileDeletes: true },

  { table: "est_categoria", mode: "timestamp", conflict: "id", reconcileDeletes: true },
  { table: "est_produto", mode: "timestamp", conflict: "id", reconcileDeletes: true },
  { table: "est_saldo", mode: "timestamp", conflict: "id", reconcileDeletes: true },
  { table: "sepultamentos", mode: "timestamp", conflict: "id", reconcileDeletes: true },
  { table: "coroas", mode: "timestamp", conflict: "id", reconcileDeletes: true },
  { table: "coroas_itens", mode: "timestamp", conflict: "id", reconcileDeletes: true },
  { table: "homenagens", mode: "snapshot", conflict: "id", reconcileDeletes: true },
  { table: "os_ordens", mode: "timestamp", conflict: "id", reconcileDeletes: true },
  { table: "historico_sepultamentos", mode: "append_window", conflict: "id" },
  { table: "est_movimento", mode: "append_window", conflict: "id" },

  // Prioridade A - novas tabelas.
  // Ordem respeita dependências principais de FK.
  { table: "coroas_integracao_config", mode: "snapshot", conflict: "chave" },

  { table: "est_classificacao", mode: "timestamp", conflict: "id" },
  { table: "est_fabricante", mode: "timestamp", conflict: "id" },

  { table: "est_confeccao", mode: "snapshot", conflict: "id" },
  { table: "est_confeccao_item", mode: "snapshot", conflict: "id" },
  { table: "est_confeccao_movimento", mode: "snapshot", conflict: "id" },

  { table: "est_conferencia", mode: "snapshot", conflict: "id" },
  { table: "est_conferencia_atendimento", mode: "snapshot", conflict: "atendimento_id" },
  { table: "est_conferencia_item", mode: "snapshot", conflict: "id" },
  { table: "est_conferencia_periodo", mode: "snapshot", conflict: "id" },

  { table: "est_contagem_rapida", mode: "snapshot", conflict: "id" },
  { table: "est_contagem_rapida_item", mode: "snapshot", conflict: "id" },

  { table: "est_custo_ajuste", mode: "snapshot", conflict: "id" },
  { table: "est_custo_ajuste_item", mode: "snapshot", conflict: "id" },

  { table: "est_estoque_alerta", mode: "timestamp", conflict: "id" },
  { table: "est_lancamento_seq", mode: "snapshot", conflict: "prefixo" },

  { table: "est_produto_foto", mode: "snapshot", conflict: "id" },
  { table: "est_produto_lote", mode: "snapshot", conflict: "id" },
  { table: "est_recebimento_contagem", mode: "snapshot", conflict: "id" },

  { table: "est_reposicao_base", mode: "snapshot", conflict: "deposito_id,produto_id" },
  { table: "est_reposicao_config", mode: "snapshot", conflict: "chave" },
  { table: "est_reposicao_execucao", mode: "snapshot", conflict: "id" },
  { table: "est_reposicao_local", mode: "snapshot", conflict: "deposito_id" },
  { table: "est_reposicao_pausa", mode: "snapshot", conflict: "id" },

  { table: "est_requisicao", mode: "timestamp", conflict: "id" },
  { table: "est_requisicao_evento", mode: "snapshot", conflict: "id" },
  { table: "est_requisicao_item", mode: "timestamp", conflict: "id" },

  { table: "guias_atendimento", mode: "timestamp", conflict: "id" },

  { table: "materiais_categoria", mode: "timestamp", conflict: "id" },
  { table: "materiais_item", mode: "timestamp", conflict: "id" },
  { table: "materiais_subitem", mode: "timestamp", conflict: "id" },
  { table: "materiais_conferencia", mode: "snapshot", conflict: "id" },
  { table: "materiais_conferencia_item", mode: "snapshot", conflict: "id" },
  { table: "materiais_conferencia_observacao", mode: "snapshot", conflict: "id" },

  { table: "os_convenio_pacotes", mode: "snapshot", conflict: "id" },
  { table: "os_convenio_regras", mode: "timestamp", conflict: "id" },
  { table: "os_convenio_pacote_itens", mode: "snapshot", conflict: "id" },
  { table: "os_parametros", mode: "snapshot", conflict: "chave" },

  { table: "sepultamento_urna_meta", mode: "snapshot", conflict: "sepultamento_id" },
  { table: "sepultamento_urna_saida", mode: "snapshot", conflict: "id" },
];

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Acesso negado." },
    { status: 403 },
  );
}

function mysqlDateFromIso(value: string | null | undefined): string | null {
  if (!value) return null;

  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;

  // HostGator opera em UTC-03.
  const local = new Date(d.getTime() - 3 * 60 * 60 * 1000);

  return local
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

function pgDateFromMysql(value: string | null | undefined): string | null {
  if (!value) return null;

  // DATETIME HostGator interpretado como UTC-03.
  const s = value.replace(" ", "T");
  const d = new Date(`${s}-03:00`);

  return Number.isFinite(d.getTime())
    ? d.toISOString()
    : null;
}

async function getState(table: string) {
  const { data, error } = await supabase
    .schema("pai")
    .from("sync_state")
    .select("id,origem,tabela,ultimo_id,ultimo_updated_at,sincronizado_em")
    .eq("origem", "hostgator")
    .eq("tabela", table)
    .maybeSingle();

  if (error) {
    throw new Error(`sync_state ${table}: ${error.message}`);
  }

  return data;
}

async function ensureState(table: string) {
  let state = await getState(table);

  if (state) {
    return state;
  }

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

  if (error) {
    throw new Error(`criar sync_state ${table}: ${error.message}`);
  }

  state = await getState(table);

  if (!state) {
    throw new Error(`Não foi possível criar estado para ${table}`);
  }

  return state;
}

async function hostFetch(url: URL, table: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "X-PAI-SYNC-KEY": SYNC_KEY,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);

    if (!response.ok || !body?.ok) {
      throw new Error(
        `HostGator ${table}: ${body?.error ?? `HTTP ${response.status}`}`,
      );
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function pullBatch(cfg: TableCfg, state: any) {
  const url = new URL(HOST_URL);

  url.searchParams.set("table", cfg.table);

  if (state?.ultimo_id != null) {
    url.searchParams.set("id", String(state.ultimo_id));
  }

  if (cfg.mode === "timestamp" && state?.ultimo_updated_at) {
    const mysql = mysqlDateFromIso(String(state.ultimo_updated_at));

    if (mysql) {
      url.searchParams.set("updated_at", mysql);
    }
  }

  return hostFetch(url, cfg.table);
}

async function pullSourceIds(table: string): Promise<number[]> {
  const url = new URL(HOST_URL);

  url.searchParams.set("table", table);
  url.searchParams.set("manifest", "ids");

  const body = await hostFetch(url, `${table}/manifest`);

  if (!Array.isArray(body.ids)) {
    throw new Error(`Manifesto inválido para ${table}`);
  }

  return body.ids
    .map((value: unknown) => Number(value))
    .filter((value: number) => Number.isInteger(value) && value > 0);
}

function sanitizeRows(table: string, rows: any[]) {
  return rows.map((row) => {
    const copy = { ...row };

    // Datas zeradas do MySQL são inválidas no PostgreSQL.
    for (const [key, value] of Object.entries(copy)) {
      if (
        typeof value === "string" &&
        /^0000-00-00(?:[ T]00:00:00)?$/.test(value.trim())
      ) {
        copy[key] = null;
      }
    }

    // Nunca replica senha de usuário.
    if (table === "usuarios") {
      delete copy.senha;
      delete copy.password;
    }

    // Evita replicar o hash familiar para o standby via esta rotina.
    if (table === "homenagens") {
      delete copy.senha_familiar_hash;
    }

    // MySQL possui id; Supabase usa PK composta cargo_id + pagina.
    if (table === "cargo_paginas") {
      delete copy.id;
    }

    // No Supabase a identidade lógica é user_id + pagina.
    if (table === "permissoes") {
      delete copy.id;
    }

    return copy;
  });
}

async function upsertRows(cfg: TableCfg, rows: any[]) {
  if (!rows.length) {
    return;
  }

  const clean = sanitizeRows(cfg.table, rows);

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

async function updateState(cfg: TableCfg, stateId: number, next: any) {
  const patch: Record<string, any> = {
    sincronizado_em: new Date().toISOString(),
  };

  if (next?.id != null) {
    patch.ultimo_id = Number(next.id);
  }

  if (cfg.mode === "snapshot") {
    patch.ultimo_updated_at = null;
  } else if (next?.updated_at) {
    patch.ultimo_updated_at = pgDateFromMysql(String(next.updated_at));
  }

  const { error } = await supabase
    .schema("pai")
    .from("sync_state")
    .update(patch)
    .eq("id", stateId)
    .eq("origem", "hostgator")
    .eq("tabela", cfg.table);

  if (error) {
    throw new Error(`avançar cursor ${cfg.table}: ${error.message}`);
  }
}

async function getSupabaseIds(table: string): Promise<number[]> {
  const result: number[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .schema("pai")
      .from(table)
      .select("id")
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`listar ids ${table}: ${error.message}`);
    }

    const rows = Array.isArray(data) ? data : [];

    for (const row of rows) {
      const id = Number((row as any).id);

      if (Number.isInteger(id) && id > 0) {
        result.push(id);
      }
    }

    if (rows.length < pageSize) {
      break;
    }
  }

  return result;
}

async function reconcileDeletedIds(table: string) {
  const sourceIds = await pullSourceIds(table);
  const targetIds = await getSupabaseIds(table);

  const sourceSet = new Set(sourceIds);
  const missingInSource = targetIds.filter((id) => !sourceSet.has(id));

  if (!missingInSource.length) {
    return {
      checked: true,
      source_ids: sourceIds.length,
      target_ids: targetIds.length,
      deleted: 0,
    };
  }

  let deleted = 0;

  // Lotes pequenos para não gerar filtros IN excessivamente grandes.
  for (let i = 0; i < missingInSource.length; i += 200) {
    const ids = missingInSource.slice(i, i + 200);

    const { error } = await supabase
      .schema("pai")
      .from(table)
      .delete()
      .in("id", ids);

    if (error) {
      throw new Error(`reconciliar deletes ${table}: ${error.message}`);
    }

    deleted += ids.length;
  }

  return {
    checked: true,
    source_ids: sourceIds.length,
    target_ids: targetIds.length,
    deleted,
  };
}

async function syncTable(cfg: TableCfg) {
  let state = await ensureState(cfg.table);
  let total = 0;
  let batches = 0;

  // Limite defensivo por execução.
  // O próximo cron continua do cursor quando houver mais dados.
  for (let pass = 0; pass < 8; pass++) {
    const batch = await pullBatch(cfg, state);
    const rows = Array.isArray(batch.rows) ? batch.rows : [];

    await upsertRows(cfg, rows);

    // Cursor só avança depois de todos os upserts deste lote.
    await updateState(
      cfg,
      Number(state.id),
      batch.next,
    );

    total += rows.length;
    batches++;

    state = {
      ...state,
      ultimo_id:
        batch?.next?.id ??
        state.ultimo_id,
      ultimo_updated_at:
        cfg.mode === "snapshot"
          ? null
          : batch?.next?.updated_at
            ? pgDateFromMysql(String(batch.next.updated_at))
            : state.ultimo_updated_at,
    };

    if (
      !batch.has_more ||
      rows.length === 0 ||
      cfg.mode === "snapshot"
    ) {
      break;
    }
  }

  let deleteReconciliation: any = null;

  /*
   * Só reconcilia DELETE depois que o lote normal da tabela terminou.
   * sync_control.pull_enabled já foi validado antes da execução.
   *
   * Em contingência o pull deve ser DESATIVADO antes de qualquer escrita
   * no Supabase, portanto registros criados durante contingência não serão
   * apagados por esta rotina.
   */
  if (cfg.reconcileDeletes) {
    deleteReconciliation = await reconcileDeletedIds(cfg.table);
  }

  return {
    table: cfg.table,
    rows: total,
    batches,
    delete_reconciliation: deleteReconciliation,
  };
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";

  const supplied =
    auth.startsWith("Bearer ")
      ? auth.slice(7)
      : request.headers.get("x-pai-sync-trigger") ?? "";

  if (!TRIGGER_KEY || supplied !== TRIGGER_KEY) {
    return unauthorized();
  }

  if (!HOST_URL || !SYNC_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error: "Variáveis de sincronização ausentes.",
      },
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
      {
        ok: false,
        error: controlError.message,
      },
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
      if (Date.now() - started > 50_000) {
        break;
      }
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
        error: String(
          error?.message ??
          "Falha na sincronização.",
        ),
        partial_results: results,
      },
      { status: 500 },
    );
  }
}
