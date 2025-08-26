"use client";

import { API, LOGIN_ABSOLUTE, materiaisConfig, salasMemorial } from "./constants";
import type { ArrumacaoState, MateriaisState } from "./types";

let IS_REDIRECTING = false;

/* -------------------- Defaults -------------------- */
export function defaultMateriais(): MateriaisState {
    return materiaisConfig.reduce((acc, m) => {
        acc[m.key] = { checked: false, qtd: 0 };
        return acc;
    }, {} as MateriaisState);
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
    };
}

/* -------------------- Login / fetch -------------------- */
export function redirectToLogin(loginUrl?: string, msg?: string) {
    if (IS_REDIRECTING) return;
    IS_REDIRECTING = true;
    try { if (msg) alert(msg); } catch { }
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
// Tabela completa de rótulos que já vi no projeto.
// Coloque variações em minúsculas e sem acento para cobrir registros antigos.
const ROTULO_PARA_FASE: Record<string, string> = {
    "removendo": "fase01",
    "aguardando procedimento": "fase02",
    "preparando": "fase03",
    "aguardando ornamentacao": "fase04",
    "ornamentando": "fase05",
    "corpo pronto": "fase06",
    "transportando": "fase07",
    "velando": "fase08",
    "sepultando": "fase09",
    "sepultamento concluido": "fase10",
    "material recolhido": "fase11",
};

// Remove acentos e baixa o caso para normalizar rótulos antigos
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
    if (s.startsWith("fase")) return s; // já está ok
    const mapeado = ROTULO_PARA_FASE[normalizeKey(s)];
    return mapeado ?? undefined;
}

/* -------------------- Textos -------------------- */
export function capitalizeStatus(s?: string) {
    switch (s) {
        case "fase01": return "Removendo";
        case "fase02": return "Aguardando Procedimento";
        case "fase03": return "Preparando";
        case "fase04": return "Aguardando Ornamentação";
        case "fase05": return "Ornamentando";
        case "fase06": return "Corpo Pronto";
        case "fase07": return "Transportando";
        case "fase08": return "Velando";
        case "fase09": return "Sepultando";
        case "fase10": return "Sepultamento Concluído";
        case "fase11": return "Material Recolhido";
        default: return "Aguardando";
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

/* -------------------- Envio registro -------------------- */
export async function enviarRegistroPHP(data: any) {
    let materiais_json = "";
    const flatQtd: Record<string, string> = {};

    if (data.materiais) {
        materiais_json = JSON.stringify(data.materiais);
        materiaisConfig.forEach((m) => {
            const q = Number(data.materiais?.[m.key]?.qtd ?? 0);
            const c = !!data.materiais?.[m.key]?.checked;
            const col = `materiais_${m.key}_qtd`;
            flatQtd[col] = c && q > 0 ? String(q) : "";
        });
    }

    let arrumacao_json = "";
    if (data.arrumacao) arrumacao_json = JSON.stringify(data.arrumacao);

    const body = {
        ...data,
        local: data.local || "",
        materiais_json,
        arrumacao_json,
        ...flatQtd,
    };

    return jsonWith401(`${API}/api/php/informativo.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

/* -------------------- Próxima fase -------------------- */
export function proximaFaseDoRegistro(
    r: { status?: string; local_velorio?: string; tanato?: string },
    fases: readonly string[]
) {
    // ✅ Normaliza sempre que calcular
    const atualCode = normalizarStatus(r.status) ?? "fase00";
    let nextIdx = fases.indexOf(atualCode as any) + 1;

    const skipTransportando = salasMemorial.includes((r.local_velorio || "").trim());
    const skipConservacao = isTanatoNo(r.tanato);

    while (nextIdx < fases.length) {
        const next = fases[nextIdx];
        if (skipTransportando && next === "fase07") { nextIdx++; continue; }
        if (skipConservacao && (next === "fase03" || next === "fase04")) { nextIdx++; continue; }
        return next;
    }
    return null;
}
