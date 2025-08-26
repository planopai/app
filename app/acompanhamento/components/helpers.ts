"use client";

import { API, LOGIN_ABSOLUTE, materiaisConfig, salasMemorial } from "./constants";
import type { ArrumacaoState, MateriaisState } from "./types";

/* ------------------------------------------------------------------------------------------------
 * Defaults
 * ----------------------------------------------------------------------------------------------*/

let IS_REDIRECTING = false;

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

/* ------------------------------------------------------------------------------------------------
 * Sessão / Fetch helpers
 * ----------------------------------------------------------------------------------------------*/

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
        if (!resp.ok) {
            throw new Error("Falha na requisição.");
        }
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

/* ------------------------------------------------------------------------------------------------
 * Normalização de status do banco
 * ----------------------------------------------------------------------------------------------*/

function norm(s?: string) {
    return (s ?? "")
        .toString()
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
}

/** Converte rótulos variados ou números para o código "faseNN". */
export function normalizarStatusParaFase(status?: string): string | undefined {
    if (!status) return undefined;
    const raw = String(status).trim();

    // "fase 8", "fase08", "Fase8"
    const m1 = /^fase\s*0?(\d{1,2})$/i.exec(raw);
    if (m1) return `fase${String(Number(m1[1])).padStart(2, "0")}`;

    // "8"
    if (/^\d+$/.test(raw)) return `fase${String(Number(raw)).padStart(2, "0")}`;

    // Rotulos humanos vindos do banco
    const labelToFase: Record<string, string> = {
        removendo: "fase01",
        aguardandoprocedimento: "fase02",
        preparando: "fase03",
        aguardandoornamentacao: "fase04",
        ornamentando: "fase05",
        corpopronto: "fase06",
        transportando: "fase07",
        velando: "fase08",
        sepultando: "fase09",
        sepultamentoconcluido: "fase10",
        materialrecolhido: "fase11",

        // sinônimos que aparecem
        velorio: "fase08",
        entregadecorpo: "fase08",
    };

    const n = norm(raw);
    if (labelToFase[n]) return labelToFase[n];

    // "fase8" sem zero
    const m2 = /^fase(\d{1,2})$/i.exec(raw);
    if (m2) return `fase${String(Number(m2[1])).padStart(2, "0")}`;

    return undefined;
}

/* ------------------------------------------------------------------------------------------------
 * Labels
 * ----------------------------------------------------------------------------------------------*/

export function capitalizeStatus(s?: string) {
    // aceita rótulos do banco ou códigos, normaliza e devolve label
    const code = normalizarStatusParaFase(s) ?? s;
    switch (code) {
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

/* ------------------------------------------------------------------------------------------------
 * Regras auxiliares
 * ----------------------------------------------------------------------------------------------*/

export function isTanatoNo(v?: string) {
    if (!v) return false;
    const s = v.trim().toLowerCase();
    return s === "não" || s === "nao" || s === "n";
}

/* ------------------------------------------------------------------------------------------------
 * Envio ao backend
 * ----------------------------------------------------------------------------------------------*/

export async function enviarRegistroPHP(data: any) {
    // achatar materiais/arrumação -> JSON + colunas *_qtd
    let materiais_json = "";
    const flatQtd: Record<string, string> = {};

    if (data.materiais) {
        materiais_json = JSON.stringify(data.materiais);
        materiaisConfig.forEach((m) => {
            const q = Number(data.materiais?.[m.key]?.qtd ?? 0);
            const c = !!data.materiais?.[m.key]?.checked;
            const col = `materiais_${m.key}_qtd`;
            if (c && q > 0) flatQtd[col] = String(q);
            else flatQtd[col] = "";
        });
    }

    let arrumacao_json = "";
    if (data.arrumacao) {
        arrumacao_json = JSON.stringify(data.arrumacao);
    }

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

/* ------------------------------------------------------------------------------------------------
 * Próxima fase (usa status do BANCO normalizado!)
 * ----------------------------------------------------------------------------------------------*/

export function proximaFaseDoRegistro(
    r: { status?: string; local_velorio?: string; tanato?: string },
    fases: readonly string[]
) {
    // NORMALIZA o que veio do banco (rótulo, número, etc.)
    const atual = normalizarStatusParaFase(r.status) ?? "fase00";

    // se o código não estiver em `fases`, começamos antes do início (-1 => 0)
    let nextIdx = fases.indexOf(atual as any) + 1;

    const skipTransportando = salasMemorial.includes((r.local_velorio || "").trim());
    const skipConservacao = isTanatoNo(r.tanato);

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
        return next; // próxima fase válida
    }
    return null; // chegou ao final
}
