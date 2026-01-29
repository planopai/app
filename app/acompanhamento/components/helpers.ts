"use client";

import { API, LOGIN_ABSOLUTE, salasMemorial } from "./constants";
import type { ArrumacaoState, MateriaisState } from "./types";

let IS_REDIRECTING = false;

/* -------------------- Defaults -------------------- */
export function defaultMateriais(): MateriaisState {
    // Dinâmico (item/subitem), começa vazio.
    return {};
}

export function defaultArrumacao(): ArrumacaoState {
    return {
        luvas: false,
        palha: false,
        tamponamento: false,
        maquiagem: false,
        algodao: false,
        cordao: false,
        barba: false,
        ta32: false,
        fluido_cavitario: false,
        formol: false,
        mascara: false,
    };
}

/* -------------------- Login / fetch -------------------- */
export function redirectToLogin(loginUrl?: string, msg?: string) {
    if (IS_REDIRECTING) return;
    IS_REDIRECTING = true;

    try {
        if (msg) alert(msg);
    } catch { }

    const url = (loginUrl && /^https?:\/\//i.test(loginUrl) && loginUrl) || LOGIN_ABSOLUTE;

    try {
        window.location.replace(url);
        setTimeout(() => {
            if (typeof window !== "undefined" && window.location.href !== url) {
                window.location.href = url;
            }
        }, 50);
    } catch {
        window.location.href = url;
    }
}

export async function jsonWith401(url: string, init?: RequestInit) {
    const resp = await fetch(url, { credentials: "include", ...init });

    if (resp.status === 401) {
        redirectToLogin(undefined, "Sessão expirada. Faça login novamente.");
        throw new Error("Sessão expirada.");
    }

    let data: any = null;
    try {
        data = await resp.json();
    } catch {
        if (!resp.ok) throw new Error("Falha na requisição.");
    }

    if (data?.need_login) {
        redirectToLogin(data?.login_url, data?.msg || "Sessão expirada. Faça login novamente.");
        throw new Error(data?.msg || "Sessão expirada.");
    }

    if (!resp.ok || data?.erro) {
        const msg = data?.msg || "Falha na requisição.";
        throw new Error(msg);
    }

    return data;
}

/* -------------------- Status <-> rótulos -------------------- */
const ROTULO_PARA_FASE: Record<string, string> = {
    removendo: "fase01",
    "aguardando procedimento": "fase02",
    preparando: "fase03",
    "aguardando ornamentacao": "fase04",
    ornamentando: "fase05",
    "corpo pronto": "fase06",
    transportando: "fase07",
    velando: "fase08",
    sepultando: "fase09",
    "sepultamento concluido": "fase10",
    "material recolhido": "fase11",
};

function normalizeKey(s: string) {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

/** Converte “Velando”, “Transportando”, etc. (ou “faseXX”) em “faseXX”. */
export function normalizarStatus(status?: string): string | undefined {
    if (!status) return undefined;

    const s = String(status).trim();
    if (s.startsWith("fase")) {
        const digits = s.replace(/[^0-9]/g, "");
        if (!digits) return s;
        return `fase${digits.padStart(2, "0")}`;
    }

    const mapeado = ROTULO_PARA_FASE[normalizeKey(s)];
    return mapeado ?? undefined;
}

/* -------------------- Textos -------------------- */
export function capitalizeStatus(s?: string) {
    switch (s) {
        case "fase01":
            return "Removendo";
        case "fase02":
            return "Aguardando Procedimento";
        case "fase03":
            return "Preparando";
        case "fase04":
            return "Aguardando Ornamentação";
        case "fase05":
            return "Ornamentando";
        case "fase06":
            return "Corpo Pronto";
        case "fase07":
            return "Transportando";
        case "fase08":
            return "Velando";
        case "fase09":
            return "Sepultando";
        case "fase10":
            return "Sepultamento Concluído";
        case "fase11":
            return "Material Recolhido";
        default:
            return "Aguardando";
    }
}

export function acaoToStatus(acao: string) {
    const map: Record<string, string> = {
        fase01: "Indo Retirar o Óbito",
        fase02: "Corpo na Clínica",
        fase03: "Ínicio de Conservação",
        fase04: "Fim da Conservação",
        fase05: "Ínicio da Ornamentação",
        fase06: "Fim da Ornamentação",
        fase07: "Transportando Óbito P/Velório",
        fase08: "Entrega de Corpo",
        fase09: "Transportando P/ Sepultamento",
        fase10: "Sepultamento Concluído",
        fase11: "Material Recolhido",
    };
    return map[acao] ?? "fase01";
}

export function isTanatoNo(v?: string) {
    if (!v) return false;
    const s = v.trim().toLowerCase();
    return s === "não" || s === "nao" || s === "n";
}

/* -------------------- Utils (depósitos / validações metas) -------------------- */
function normUpper(v: any) {
    const s = String(v ?? "").trim();
    return s.replace(/\s+/g, " ").toUpperCase();
}

function normalizeUrnaDeposito(v: any): "MEMORIAL" | "FUNERARIA" {
    const s = normUpper(v);
    return s === "FUNERARIA" ? "FUNERARIA" : "MEMORIAL";
}

function asPositiveIntOrNull(v: any): number | null {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return null;
    const i = Math.floor(n);
    return i > 0 ? i : null;
}

function isSim(v: any): boolean {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "sim" || s === "s" || s === "1" || s === "true";
}

function isRoupapropria(v: any): boolean {
    const raw = String(v ?? "").trim().toLowerCase();
    if (!raw) return false;
    const noAcc = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const t = noAcc.trim();
    return t === "roupa propria" || t === "roupa própria";
}

/* -------------------- Materiais: saneamento -------------------- */
/**
 * Aceita o formato antigo (id -> {...}) e o novo (item:ID / subitem:ID),
 * mantém campos extras sem quebrar o PHP, e evita enviar itens desmarcados.
 */
export function normalizeMateriaisState(input: any): MateriaisState {
    const out: any = {};
    if (!input || typeof input !== "object") return out;

    for (const [k, v] of Object.entries(input)) {
        const o: any = v || {};
        const qtdRaw = Number(o.qtd ?? 0);
        const qtd = Number.isFinite(qtdRaw) ? Math.max(0, Math.floor(qtdRaw)) : 0;
        const checked = !!o.checked || qtd > 0;

        // opcional (recomendado): só persiste selecionados
        if (!checked) continue;

        out[String(k)] = {
            checked: true,
            qtd: Math.max(1, qtd || 1),
            nome: String(o.nome ?? ""),
            categoria_id: o.categoria_id ?? undefined,

            // extras do formato novo (não atrapalha o backend)
            item_id: o.item_id ?? undefined,
            tipo: o.tipo ?? undefined,
            raw_id: o.raw_id ?? undefined,
        };
    }

    return out as MateriaisState;
}

/* -------------------- Envio de registro -------------------- */
/**
 * ✅ Garante:
 * - materiais_json sempre string JSON (no mínimo "{}")
 * - arrumacao_json sempre string JSON (no mínimo "{}")
 * - URNA meta coerente (deposito_nome normalizado)
 * - ROUPA/INVOL meta coerente (null quando não selecionado)
 * - validações extras no front (evita erro 400 do PHP)
 */
export async function enviarRegistroPHP(data: any) {
    // ---------- materiais_json ----------
    let materiais_json = "{}";
    const srcMat = data?.materiais_json ?? data?.materiais;

    if (typeof srcMat === "string" && srcMat.trim()) {
        materiais_json = srcMat;
    } else if (srcMat && typeof srcMat === "object") {
        materiais_json = JSON.stringify(normalizeMateriaisState(srcMat));
    }

    // ---------- arrumacao_json ----------
    let arrumacao_json = "{}";
    const srcArr = data?.arrumacao_json ?? data?.arrumacao;

    if (typeof srcArr === "string" && srcArr.trim()) {
        arrumacao_json = srcArr;
    } else if (srcArr && typeof srcArr === "object") {
        arrumacao_json = JSON.stringify(srcArr);
    }

    // ---------- URNA META ----------
    const urnaTxt = String(data?.urna ?? "").trim();
    const urnaPidRaw = asPositiveIntOrNull(data?.urna_produto_id);
    const urnaDep = normalizeUrnaDeposito(data?.urna_deposito_nome);
    const urnaCb = String(data?.urna_codigo_barras ?? "").trim();

    // segue regra do PHP: se tiver texto, precisa pid > 0
    if (urnaTxt !== "" && !urnaPidRaw) {
        throw new Error('Selecione uma urna da lista (produto do estoque).');
    }

    // ---------- ROUPA META ----------
    const roupaTxt = String(data?.roupa ?? "").trim();
    const roupaEhPropria = roupaTxt !== "" && isRoupapropria(roupaTxt);
    const roupaPid = roupaEhPropria ? null : asPositiveIntOrNull(data?.roupa_produto_id);
    const roupaDep = roupaEhPropria ? null : (String(data?.roupa_deposito_nome ?? "").trim() ? normUpper(data?.roupa_deposito_nome) : null);
    const roupaCb = roupaEhPropria ? null : (String(data?.roupa_codigo_barras ?? "").trim() || null);

    // regra do PHP: se roupa tem texto e NÃO é roupa própria => precisa pid > 0
    if (roupaTxt !== "" && !roupaEhPropria && !roupaPid) {
        throw new Error('Selecione uma roupa da lista (produto do estoque) ou use "ROUPA PRÓPRIA".');
    }

    // ---------- INVOL META ----------
    const involTxt = String(data?.invol ?? "").trim();
    const involSim = isSim(involTxt);
    const involPid = involSim ? asPositiveIntOrNull(data?.invol_produto_id) : null;
    const involDep = involSim ? (String(data?.invol_deposito_nome ?? "").trim() ? normUpper(data?.invol_deposito_nome) : null) : null;
    const involCb = involSim ? (String(data?.invol_codigo_barras ?? "").trim() || null) : null;

    // regra do PHP: se invol == sim => precisa pid > 0
    if (involSim && !involPid) {
        throw new Error("Selecione um INVOL da lista (produto do estoque).");
    }

    const body = {
        ...data,

        // segurança: esses sempre existem
        local: data?.local || "",

        // jsons sempre string
        materiais_json,
        arrumacao_json,

        // urna
        urna_deposito_nome: urnaDep,
        urna_produto_id: urnaPidRaw ?? 0, // mantém compatível com o que vocês já usam
        urna_codigo_barras: urnaCb,

        // roupa (usa null quando não aplicável/selecionado)
        roupa_deposito_nome: roupaDep,
        roupa_produto_id: roupaPid,
        roupa_codigo_barras: roupaCb,

        // invol (usa null quando não aplicável/selecionado)
        invol_deposito_nome: involDep,
        invol_produto_id: involPid,
        invol_codigo_barras: involCb,
    };

    return jsonWith401(`${API}/api/php/informativo.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

/* -------------------- Consulta status no backend -------------------- */
export type StatusConsulta = {
    id: string;
    status: string; // sempre normalizado "faseNN"
    local_velorio: string;
    tanato: string;
};

export async function consultarStatusAtual(id: number | string): Promise<StatusConsulta> {
    const url = `${API}/api/php/informativo.php?status_atual=1&id=${encodeURIComponent(String(id))}`;
    const data = await jsonWith401(url);

    if (!data?.sucesso) throw new Error(data?.msg || "Falha ao consultar status.");

    const status = normalizarStatus(data.status) ?? "fase00";
    return {
        id: String(data.id ?? id),
        status,
        local_velorio: String(data.local_velorio ?? ""),
        tanato: String(data.tanato ?? ""),
    };
}

/* -------------------- Próxima fase (com regras) -------------------- */
export function proximaFaseDoRegistro(
    r: {
        status?: string;
        local_velorio?: string;
        tanato?: string;
        ornamentacao?: string;
        assistencia?: string;
    },
    fases: readonly string[]
) {
    const atualCode = normalizarStatus(r.status) ?? "fase00";
    let nextIdx = fases.indexOf(atualCode as any) + 1;

    const skipTransportando = salasMemorial.includes((r.local_velorio || "").trim());
    const skipConservacao = isTanatoNo(r.tanato);
    const skipOrnamentacao =
        String(r.ornamentacao || "").toLowerCase() === "não" ||
        String(r.ornamentacao || "").toLowerCase() === "nao";
    const skipMaterialRecolhido =
        String(r.assistencia || "").toLowerCase() === "não" ||
        String(r.assistencia || "").toLowerCase() === "nao";

    while (nextIdx < fases.length) {
        const next = fases[nextIdx];

        if (skipTransportando && next === "fase07") {
            nextIdx++;
            continue;
        }
        if (skipConservacao && (next === "fase03" || next === "fase04")) {
            nextIdx++;
            continue;
        }
        if (skipOrnamentacao && (next === "fase05" || next === "fase06")) {
            nextIdx++;
            continue;
        }
        if (skipMaterialRecolhido && next === "fase11") {
            nextIdx++;
            continue;
        }

        return next;
    }

    return null;
}

export async function proximaFaseOnline(id: number | string, fases: readonly string[]): Promise<string | null> {
    const s = await consultarStatusAtual(id);
    return proximaFaseDoRegistro({ status: s.status, local_velorio: s.local_velorio, tanato: s.tanato }, fases);
}
