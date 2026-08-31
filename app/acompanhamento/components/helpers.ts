"use client";

import { LOGIN_ABSOLUTE, salasMemorial } from "./constants";
import type { ArrumacaoState, MateriaisState } from "./types";

/**
 * ✅ Endpoint base da API (PHP)
 * Ajuste aqui se trocar domínio.
 */
const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

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

    const url =
        (loginUrl && /^https?:\/\//i.test(loginUrl) && loginUrl) || LOGIN_ABSOLUTE;

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
        redirectToLogin(
            data?.login_url,
            data?.msg || "Sessão expirada. Faça login novamente."
        );
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
    "fim da ornamentacao": "fase06",
    "aguardando corpo pronto": "fase06",
    "corpo pronto": "fase12",
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
            return "Aguardando Corpo Pronto";
        case "fase12":
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
        fase12: "Corpo Pronto",
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

function isNao(v: any): boolean {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "não" || s === "nao" || s === "n" || s === "0" || s === "false";
}

function normalizeSimNaoKeepBlank(v: any): string {
    if (isSim(v)) return "Sim";
    if (isNao(v)) return "Não";
    return String(v ?? "").trim();
}

function isRoupapropria(v: any): boolean {
    const raw = String(v ?? "").trim().toLowerCase();
    if (!raw) return false;
    const noAcc = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const t = noAcc.trim();
    return t === "roupa propria" || t === "roupa própria";
}

function normalizeRoupaDepositoOrNull(v: any): "ARMARIO SANDRO" | "ARMARIO ILDO" | "FUNERARIA" | null {
    const s = normUpper(v);
    if (s === "ARMARIO SANDRO") return "ARMARIO SANDRO";
    if (s === "ARMARIO ILDO") return "ARMARIO ILDO";
    if (s === "FUNERARIA") return "FUNERARIA";
    return null;
}

function normalizeInvolDepositoOrNull(v: any): "ARMARIO SANDRO" | "ARMARIO ILDO" | null {
    const s = normUpper(v);
    if (s === "ARMARIO ILDO") return "ARMARIO ILDO";
    if (s === "ARMARIO SANDRO") return "ARMARIO SANDRO";
    return null;
}

/**
 * ✅ Véu sai de: ARMARIO SANDRO | ARMARIO ILDO | FUNERARIA
 */
function normalizeVeuDepositoOrNull(
    v: any
): "ARMARIO SANDRO" | "ARMARIO ILDO" | "FUNERARIA" | null {
    const s = normUpper(v);
    if (s === "ARMARIO SANDRO") return "ARMARIO SANDRO";
    if (s === "ARMARIO ILDO") return "ARMARIO ILDO";
    if (s === "FUNERARIA") return "FUNERARIA";
    return null;
}


/**
 * ✅ Cordão sai de: ARMARIO SANDRO | ARMARIO ILDO | FUNERARIA
 */
function normalizeCordaoDepositoOrNull(v: any): "ARMARIO SANDRO" | "ARMARIO ILDO" | "FUNERARIA" | null {
    const s = normUpper(v);
    if (s === "ARMARIO SANDRO") return "ARMARIO SANDRO";
    if (s === "ARMARIO ILDO") return "ARMARIO ILDO";
    if (s === "FUNERARIA") return "FUNERARIA";
    return null;
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
 * - ROUPA/INVOL/CORDAO meta coerente (null quando não selecionado / não aplicável)
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
    const roupaDep = roupaEhPropria ? null : normalizeRoupaDepositoOrNull(data?.roupa_deposito_nome);
    const roupaCb = roupaEhPropria ? null : (String(data?.roupa_codigo_barras ?? "").trim() || null);


    // regra do PHP: se roupa tem texto e NÃO é roupa própria => precisa pid > 0
    if (roupaTxt !== "" && !roupaEhPropria && !roupaPid) {
        throw new Error(
            'Selecione uma roupa da lista (produto do estoque) ou use "ROUPA PRÓPRIA".'
        );
    }
    // se roupa é do estoque, exige depósito válido
    if (roupaTxt !== "" && !roupaEhPropria && !roupaDep) {
        throw new Error("Roupa: selecione o local (ARMARIO SANDRO, ARMARIO ILDO ou FUNERARIA).");
    }

    // ---------- INVOL META ----------
    const involTxt = String(data?.invol ?? "").trim();
    const involSim = isSim(involTxt);

    const involPid = involSim ? asPositiveIntOrNull(data?.invol_produto_id) : null;
    const involDep = involSim ? normalizeInvolDepositoOrNull(data?.invol_deposito_nome) : null;
    const involCb = involSim ? (String(data?.invol_codigo_barras ?? "").trim() || null) : null;

    // regra do PHP: se invol == sim => precisa pid > 0
    if (involSim && !involPid) {
        throw new Error("Selecione um INVOL da lista (produto do estoque).");
    }
    if (involSim && !involDep) {
        throw new Error("Invol: selecione o local (ARMARIO SANDRO ou ARMARIO ILDO).");
    }
    // ---------- VÉU META ----------
    const veuTxt = String(data?.veu ?? "").trim();
    const veuSim = isSim(veuTxt);

    const veuPid = veuSim ? asPositiveIntOrNull(data?.veu_produto_id) : null;
    const veuDep = veuSim ? normalizeVeuDepositoOrNull(data?.veu_deposito_nome) : null;
    const veuCb = veuSim ? (String(data?.veu_codigo_barras ?? "").trim() || null) : null;

    if (veuSim && !veuPid) {
        throw new Error("Selecione um VÉU da lista (produto do estoque).");
    }
    if (veuSim && !veuDep) {
        throw new Error("Véu: selecione o local (ARMARIO SANDRO, ARMARIO ILDO ou FUNERARIA).");
    }


    // ---------- CORDAO META (opcional) ----------
    // ---------- CORDÃO META ----------
    const cordaoTxt = String(data?.cordao ?? "").trim();
    const cordaoSim = isSim(cordaoTxt);

    const cordaoPid = cordaoSim ? asPositiveIntOrNull(data?.cordao_produto_id) : null;
    const cordaoDep = cordaoSim ? normalizeCordaoDepositoOrNull(data?.cordao_deposito_nome) : null;
    const cordaoCb = cordaoSim ? (String(data?.cordao_codigo_barras ?? "").trim() || null) : null;

    if (cordaoSim && !cordaoPid) {
        throw new Error("Selecione um CORDÃO da lista (produto do estoque).");
    }
    if (cordaoSim && !cordaoDep) {
        throw new Error("Cordão: selecione o local (ARMARIO SANDRO, ARMARIO ILDO ou FUNERARIA).");
    }

    // ---------- COROA DE FLORES ----------
    const coroaFlores = normalizeSimNaoKeepBlank(data?.coroa_flores);
    const coroaSim = isSim(coroaFlores);
    const coroaTipoRaw = String(data?.coroa_tipo ?? "").trim();
    const coroaTipo =
        coroaTipoRaw.toLowerCase() === "natural"
            ? "Natural"
            : coroaTipoRaw.toLowerCase() === "artificial"
                ? "Artificial"
                : "";
    const coroaPid = coroaSim ? asPositiveIntOrNull(data?.coroa_produto_id) : null;
    const coroaModelo = coroaSim ? String(data?.coroa_modelo ?? "").trim() : "";
    const coroaCb = coroaSim ? (String(data?.coroa_codigo_barras ?? "").trim() || null) : null;
    const coroaDep = coroaSim && coroaTipo === "Artificial"
        ? (String(data?.coroa_deposito_nome ?? "").trim() || null)
        : null;

    // Quando o usuário marcou Sim, uma seleção completa de modelo é necessária.
    // Registros novos ainda podem nascer incompletos, mas se já houver tipo/modelo parcial,
    // impedimos uma combinação inconsistente de dados.
    if (coroaSim && coroaTipo && !coroaPid) {
        throw new Error("Coroa de Flores: selecione um modelo válido.");
    }
    if (coroaSim && coroaTipo === "Artificial" && coroaPid && !coroaDep) {
        throw new Error("Coroa Artificial: selecione um modelo com depósito e saldo disponível.");
    }

    // ---------- ROTEAMENTO VELÓRIO / SEPULTAMENTO ----------
    const realizaVelorio = normalizeSimNaoKeepBlank(data?.realiza_velorio);
    const realizaSepultamento = normalizeSimNaoKeepBlank(data?.realiza_sepultamento);
    const semVelorio = isNao(realizaVelorio);
    const semSepultamento = isNao(realizaSepultamento);

    // ---------- VELÓRIO / SALA ----------
    const salaVelorioRaw = semVelorio ? "" : String(data?.sala_velorio ?? "").trim();
    const salaVelorio =
        salaVelorioRaw === "Sala 01" ||
            salaVelorioRaw === "Sala 02" ||
            salaVelorioRaw === "Sala 03"
            ? salaVelorioRaw
            : "";

    const velorioOnlineRaw = String(data?.velorio_online ?? "").trim();
    const velorioOnline =
        salaVelorio !== ""
            ? velorioOnlineRaw === "Sim" || velorioOnlineRaw === "Não"
                ? velorioOnlineRaw
                : ""
            : "";

    if (salaVelorio !== "" && velorioOnline === "") {
        throw new Error('Selecione "Sim" ou "Não" em Velório Online.');
    }

    const body = {
        ...data,

        // segurança: esses sempre existem
        local: semSepultamento ? "" : (data?.local || ""),

        // jsons sempre string
        materiais_json,
        arrumacao_json,

        // roteamento do atendimento
        realiza_velorio: realizaVelorio,
        realiza_sepultamento: realizaSepultamento,

        // velório / sala. Quando Velório = Não, todos os dados da aba são limpos.
        local_velorio: semVelorio ? "" : String(data?.local_velorio ?? ""),
        sala_velorio: salaVelorio,
        velorio_online: velorioOnline,
        data_inicio_velorio: semVelorio ? "" : String(data?.data_inicio_velorio ?? ""),
        data_fim_velorio: semVelorio ? "" : String(data?.data_fim_velorio ?? ""),
        hora_inicio_velorio: semVelorio ? "" : String(data?.hora_inicio_velorio ?? ""),
        hora_fim_velorio: semVelorio ? "" : String(data?.hora_fim_velorio ?? ""),
        observacao_velorio01: semVelorio ? "" : String(data?.observacao_velorio01 ?? ""),
        observacao_velorio02: semSepultamento ? "" : String(data?.observacao_velorio02 ?? ""),

        // urna
        urna_deposito_nome: urnaDep,
        urna_produto_id: urnaPidRaw ?? 0,
        urna_codigo_barras: urnaCb,

        // roupa (usa null quando não aplicável/selecionado)
        roupa_deposito_nome: roupaDep,
        roupa_produto_id: roupaPid,
        roupa_codigo_barras: roupaCb,
        // reforço de "ROUPA PRÓPRIA" (opcional, mas ajuda consistência)
        ...(roupaEhPropria ? { roupa: "ROUPA PRÓPRIA" } : {}),

        // invol (usa null quando não aplicável/selecionado)
        invol_deposito_nome: involDep,
        invol_produto_id: involPid,
        invol_codigo_barras: involCb,

        // véu
        veu: veuSim ? "Sim" : "Não",
        veu_item: veuSim ? String(data?.veu_item ?? "").trim() : "",
        veu_deposito_nome: veuDep,
        veu_produto_id: veuPid,
        veu_codigo_barras: veuCb,

        // cordão
        cordao: cordaoSim ? "Sim" : "Não",
        cordao_item: cordaoSim ? String(data?.cordao_item ?? "").trim() : "",
        cordao_deposito_nome: cordaoDep,
        cordao_produto_id: cordaoPid,
        cordao_codigo_barras: cordaoCb,

        // coroa de flores
        coroa_flores: coroaFlores,
        coroa_tipo: coroaSim ? coroaTipo : "",
        coroa_produto_id: coroaSim ? coroaPid : null,
        coroa_modelo: coroaSim ? coroaModelo : "",
        coroa_codigo_barras: coroaSim ? coroaCb : null,
        coroa_deposito_nome: coroaSim && coroaTipo === "Artificial" ? coroaDep : null,

    };

    // ✅ agora aponta DIRETO pro PHP no domínio da API
    return jsonWith401(`${ENDPOINT}/informativo.php`, {
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
    sala_velorio: string;
    tanato: string;
    ornamentacao: string;
    assistencia: string;
    realiza_velorio: string;
    realiza_sepultamento: string;
    tipo_atendimento: "funerario" | "terceiro" | "";
    responsavel_velorio_id: number | null;
    responsavel_velorio_nome: string;
    responsavel_velorio_desde: string;
    responsavel_sepultamento_id: number | null;
    responsavel_sepultamento_nome: string;
    responsavel_sepultamento_desde: string;
};

export async function consultarStatusAtual(
    id: number | string
): Promise<StatusConsulta> {
    // ✅ agora aponta DIRETO pro PHP no domínio da API
    const url = `${ENDPOINT}/informativo.php?status_atual=1&id=${encodeURIComponent(
        String(id)
    )}`;
    const data = await jsonWith401(url);

    if (!data?.sucesso) throw new Error(data?.msg || "Falha ao consultar status.");

    const status = normalizarStatus(data.status) ?? "fase00";
    const tipo = String(data.tipo_atendimento ?? "").trim().toLowerCase();

    return {
        id: String(data.id ?? id),
        status,
        local_velorio: String(data.local_velorio ?? ""),
        sala_velorio: String(data.sala_velorio ?? ""),
        tanato: String(data.tanato ?? ""),
        ornamentacao: String(data.ornamentacao ?? ""),
        assistencia: String(data.assistencia ?? ""),
        realiza_velorio: String(data.realiza_velorio ?? ""),
        realiza_sepultamento: String(data.realiza_sepultamento ?? ""),
        tipo_atendimento: tipo === "terceiro" ? "terceiro" : tipo === "funerario" ? "funerario" : "",
        responsavel_velorio_id:
            data.responsavel_velorio_id != null && Number(data.responsavel_velorio_id) > 0
                ? Number(data.responsavel_velorio_id)
                : null,
        responsavel_velorio_nome: String(data.responsavel_velorio_nome ?? ""),
        responsavel_velorio_desde: String(data.responsavel_velorio_desde ?? ""),
        responsavel_sepultamento_id:
            data.responsavel_sepultamento_id != null && Number(data.responsavel_sepultamento_id) > 0
                ? Number(data.responsavel_sepultamento_id)
                : null,
        responsavel_sepultamento_nome: String(data.responsavel_sepultamento_nome ?? ""),
        responsavel_sepultamento_desde: String(data.responsavel_sepultamento_desde ?? ""),
    };
}

/* -------------------- Próxima fase (com regras) -------------------- */
export type RegistroFluxo = {
    status?: string;
    local_velorio?: string;
    sala_velorio?: string;
    tanato?: string;
    ornamentacao?: string;
    assistencia?: string;
    realiza_velorio?: string;
    realiza_sepultamento?: string;
};

export function isVelorioMemorial(
    r?: Pick<RegistroFluxo, "local_velorio" | "sala_velorio"> | null
): boolean {
    if (!r) return false;

    const local = normalizeKey(String(r.local_velorio ?? ""));
    const sala = normalizeKey(String(r.sala_velorio ?? ""));

    const locaisMemorial = salasMemorial.map((item) => normalizeKey(item));
    if (locaisMemorial.includes(local)) return true;

    return [
        "sala 01",
        "sala 1",
        "01",
        "1",
        "sala 02",
        "sala 2",
        "02",
        "2",
        "sala 03",
        "sala 3",
        "03",
        "3",
    ].includes(sala);
}

export function fasesVisiveisDoRegistro(
    r: RegistroFluxo,
    fases: readonly string[]
): string[] {
    const skipTransportando = isVelorioMemorial(r);
    const skipConservacao = isTanatoNo(r.tanato);
    const skipOrnamentacao = isNao(r.ornamentacao);
    const skipMaterialRecolhido = isNao(r.assistencia);

    // Compatibilidade: campo vazio/NULL em registros antigos significa manter o fluxo antigo.
    const skipVelorio = isNao(r.realiza_velorio);
    const skipSepultamento = isNao(r.realiza_sepultamento);

    return fases.filter((fase) => {
        if (skipTransportando && fase === "fase07") return false;
        if (skipConservacao && (fase === "fase03" || fase === "fase04")) return false;
        if (skipOrnamentacao && (fase === "fase05" || fase === "fase06")) return false;
        if (skipVelorio && (fase === "fase07" || fase === "fase08")) return false;
        if (skipSepultamento && (fase === "fase09" || fase === "fase10")) return false;
        if (skipMaterialRecolhido && fase === "fase11") return false;
        return true;
    });
}

export function faseFinalDoRegistro(
    r: RegistroFluxo,
    fases: readonly string[]
): string | null {
    const visiveis = fasesVisiveisDoRegistro(r, fases);
    return visiveis.length ? visiveis[visiveis.length - 1] : null;
}

export function proximaFaseDoRegistro(
    r: RegistroFluxo,
    fases: readonly string[]
) {
    const atualCode = normalizarStatus(r.status) ?? "fase00";
    const visiveis = fasesVisiveisDoRegistro(r, fases);

    if (atualCode === "fase00") return visiveis[0] ?? null;

    const idxAtualCompleto = fases.indexOf(atualCode);
    if (idxAtualCompleto < 0) return visiveis[0] ?? null;

    for (let i = idxAtualCompleto + 1; i < fases.length; i++) {
        const candidato = fases[i];
        if (visiveis.includes(candidato)) return candidato;
    }

    return null;
}

export async function proximaFaseOnline(
    id: number | string,
    fases: readonly string[]
): Promise<string | null> {
    const s = await consultarStatusAtual(id);
    return proximaFaseDoRegistro(
        {
            status: s.status,
            local_velorio: s.local_velorio,
            sala_velorio: s.sala_velorio,
            tanato: s.tanato,
            ornamentacao: s.ornamentacao,
            assistencia: s.assistencia,
            realiza_velorio: s.realiza_velorio,
            realiza_sepultamento: s.realiza_sepultamento,
        },
        fases
    );
}
