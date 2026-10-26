/* =====================================================================
   PdfRelatorio.ts — PDF do Relatório de Atendimento (layout aprovado em 26/10/2026)

   Página 1: resumo (falecido, responsável, velório, serviços, itens usados, observações)
   Página 2: tempo por etapa + linha do tempo em tabela
   Depois:   Termo de Recebimento de Material e Requisição de Veículo

   Duas partes:
     - montarDadosRelatorio(): junta o resumo e o histórico num formato pronto para imprimir;
     - desenharRelatorio(): desenha com jsPDF (fonte Helvetica, cores do sistema).
   Sem dependência de React, para poder ser testado fora da tela.
   ===================================================================== */

import type { LogItem } from "./TiposHistorico";
import type { MateriaisMap } from "./Api";
import { traduzirFase } from "./ConstantesFases";
import { ARR_LABELS } from "./MateriaisArrumacao";
import {
    extrairArrumacao,
    extrairCoroas,
    extrairDetalhesLogHumanos,
    extrairMateriais,
} from "./FormatadorRelatorio";

/* ============================== Tipos ============================== */

export type ItemEstoqueRelatorio = {
    grupo: string;
    nome: string;
    qtd: number;
    origem: string;
    situacao: string;
};

export type EventoLinhaTempo = {
    dia: string;
    hora: string;
    texto: string;
    subitens: string[];
    por: string;
    etapa: boolean;
};

export type TempoEtapa = {
    etapa: string;
    segundos: number | null;
    desde?: string;
};

export type DadosRelatorio = {
    id: string;
    nome: string;
    vida: string;
    etapaAtual: string;
    finalizado: boolean;
    chips: Array<[string, string]>;
    falecido: Array<[string, string]>;
    responsavel: Array<[string, string]>;
    responsavelNome: string;
    responsavelCpf: string;
    velorio: Array<[string, string]>;
    servicos: Array<[string, string]>;
    itens: ItemEstoqueRelatorio[];
    materiaisKit: string;
    materiais: Array<{ nome: string; qtd: number }>;
    materiaisSituacao: string;
    naoUsados: string[];
    observacoes: Array<[string, string]>;
    tempos: TempoEtapa[];
    temposResumo: string;
    linhaTempo: EventoLinhaTempo[];
    variosDias: boolean;
    diaUnico: string;
    agenteEntrega: string;
    dataVelorio: string;
    dataSepultamento: string;
    horaSepultamento: string;
    cemiterio: string;
};

/* ============================== Utilitários ============================== */

function txt(v: any): string {
    if (v == null) return "";
    if (typeof v === "object") return "";
    const s = String(v).trim();
    if (!s || s === "(vazio)" || s === "null" || s === "undefined") return "";
    return s;
}

function sim(v: any) {
    const s = txt(v).toLowerCase();
    return s === "sim" || s === "1" || s === "true";
}

function nao(v: any) {
    const s = txt(v)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
    return s === "nao" || s === "0" || s === "false";
}

/** Aceita "2026-10-26", "2026-10-26 08:40:00" ou "26/10/2026". */
export function fmtData(v: any): string {
    const s = txt(v);
    if (!s || s.startsWith("0000-00-00")) return "";
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[1]}/${br[2]}/${br[3]}`;
    return s;
}

/** "11:30:00" → "11:30". */
export function fmtHora(v: any): string {
    const s = txt(v);
    const m = s.match(/(\d{1,2}):(\d{2})/);
    if (!m) return s;
    return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function dataHoraDoLog(v: any) {
    const s = txt(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return {
        dia: `${m[3]}/${m[2]}/${m[1]}`,
        hora: `${m[4]}:${m[5]}`,
        ms: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)),
    };
}

function formatCpf(v: any) {
    const d = txt(v).replace(/\D+/g, "");
    if (d.length !== 11) return txt(v);
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function capitalizar(s: string) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function semSegundos(valor: string) {
    return valor.replace(/\b(\d{2}:\d{2}):\d{2}\b/g, "$1");
}

function idade(nasc: string, fal: string): number | null {
    const a = nasc.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const b = fal.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!a || !b) return null;
    let anos = +b[3] - +a[3];
    if (+b[2] < +a[2] || (+b[2] === +a[2] && +b[1] < +a[1])) anos--;
    return anos >= 0 && anos < 130 ? anos : null;
}

export function fmtDuracao(seg: number) {
    if (seg < 60) return "< 1 min";
    const min = Math.round(seg / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${String(m).padStart(2, "0")} min` : `${h} h`;
}

const TIPOS_ATENDIMENTO: Record<string, string> = {
    funerario: "Funerário",
    terceiro: "Terceiro",
};

function parseJson(v: any) {
    if (v == null) return null;
    if (typeof v === "object") return v;
    try {
        return JSON.parse(String(v));
    } catch {
        return null;
    }
}

function ordenarLogs(logs: LogItem[]) {
    return [...(logs || [])].sort((a, b) =>
        String(a.datahora || "").localeCompare(String(b.datahora || "")),
    );
}

function numeroFase(status?: string) {
    const m = String(status || "").match(/^fase(\d+)/i);
    return m ? Number(m[1]) : null;
}

/* ============================== Etapas ============================== */

/** Agrupa as fases do app nas etapas mostradas em "Tempo por etapa". */
function etapaDoStatus(status?: string): string {
    const s = String(status || "").toLowerCase();
    if (!s || s === "aguardando") return "Aguardando";
    const n = numeroFase(s);
    switch (n) {
        case 1: return "Indo retirar o óbito";
        case 2: return "Corpo na clínica";
        case 3:
        case 4: return "Conservação";
        case 5:
        case 6: return "Ornamentação";
        case 12: return "Corpo pronto";
        case 7: return "Transporte para o velório";
        case 8: return "Entrega de corpo / velório";
        case 9: return "Transporte para o sepultamento";
        case 10: return "Sepultamento concluído";
        case 11: return "Material recolhido";
        default: return traduzirFase(status) || capitalizar(s);
    }
}

function ehAcaoDeEtapa(acao?: string) {
    const a = String(acao || "").toLowerCase();
    return a.includes("atualizou status") || a === "material_recolhido" || a.includes("criou") || a.includes("voltou etapa");
}

/* ============================== Montagem dos dados ============================== */

export function montarDadosRelatorio(params: {
    resumo: Record<string, any>;
    logs: LogItem[];
    materiaisMap?: MateriaisMap;
    nome: string;
    id?: string | number;
}): DadosRelatorio {
    const r = params.resumo || {};
    const g = (k: string) => txt(r[k]);
    const logs = ordenarLogs(params.logs).filter((l) => {
        const d = parseJson(l.detalhes);
        return !(d && typeof d === "object" && (d as any).sem_alteracoes === true);
    });

    /* ---- etapa atual ---- */
    let statusAtual = "";
    for (const l of logs) if (txt(l.status_novo)) statusAtual = txt(l.status_novo);
    if (!statusAtual) statusAtual = g("status");
    const nAtual = numeroFase(statusAtual);
    const assistenciaNao = nao(r.assistencia);
    const finalizado = nAtual === 11 || (assistenciaNao && nAtual === 10);
    const etapaAtual = statusAtual ? traduzirFase(statusAtual) || capitalizar(statusAtual) : "Aguardando";

    const passouCorpoPronto = logs.some((l) => {
        const n = numeroFase(l.status_novo);
        return n != null && (n === 12 || (n >= 7 && n <= 11));
    }) || (nAtual != null && (nAtual === 12 || (nAtual >= 7 && nAtual <= 11)));

    /* ---- cabeçalho ---- */
    const nome = txt(params.nome) || g("falecido");
    const nasc = fmtData(r.data_nascimento);
    const fal = fmtData(r.data_falecimento);
    const anos = idade(nasc, fal);
    const vida = [nasc && fal ? `${nasc} – ${fal}` : nasc || fal, anos != null ? `${anos} anos` : ""]
        .filter(Boolean)
        .join(" · ");

    const primeiro = logs[0];
    const dhPrimeiro = dataHoraDoLog(primeiro?.datahora);
    const id = txt(params.id) || g("sepultamento_id") || g("id");

    const chips: Array<[string, string]> = [];
    if (id) chips.push(["Atendimento", `nº ${id}`]);
    if (g("convenio")) chips.push(["Convênio", g("convenio")]);
    if (dhPrimeiro) {
        chips.push([
            "Aberto",
            `${dhPrimeiro.dia} ${dhPrimeiro.hora}${txt(primeiro?.usuario) ? ` por ${txt(primeiro?.usuario)}` : ""}`,
        ]);
    }
    if (g("agente")) chips.push(["Agente", g("agente")]);

    /* ---- falecido e responsável ---- */
    const falecido: Array<[string, string]> = [["Nome", nome]];
    if (nasc) falecido.push(["Nascimento", nasc]);
    if (fal) falecido.push(["Falecimento", fal]);
    if (g("religiao")) falecido.push(["Religião", g("religiao")]);
    const tipo = g("tipo_atendimento").toLowerCase();
    if (tipo && tipo !== "funerario") falecido.push(["Tipo", TIPOS_ATENDIMENTO[tipo] || capitalizar(tipo)]);

    const responsavelNome = g("nome_responsavel");
    const responsavelCpf = formatCpf(r.cpf_responsavel);
    const responsavel: Array<[string, string]> = [];
    if (responsavelNome) responsavel.push(["Nome", responsavelNome]);
    if (responsavelCpf) responsavel.push(["CPF", responsavelCpf]);
    const contato = g("contato") || g("telefone") || g("telefone_responsavel");
    if (contato) responsavel.push(["Contatos", contato]);
    if (!responsavel.length) responsavel.push(["Nome", "Não informado"]);

    /* ---- velório e sepultamento ---- */
    const velorio: Array<[string, string]> = [];
    const temVelorio = !nao(r.realiza_velorio);
    if (temVelorio) {
        const tipoLocal = g("local_cerimonia");
        let endereco = g("local_velorio");
        if (/^https?:\/\//i.test(endereco)) endereco = "localização enviada por GPS";
        const local = tipoLocal && endereco && tipoLocal !== endereco ? `${tipoLocal} · ${endereco}` : tipoLocal || endereco;
        if (local) velorio.push(["Local do velório", local]);
        if (g("sala_velorio")) {
            velorio.push(["Sala", `${g("sala_velorio")}${sim(r.velorio_online) ? " · Velório online" : ""}`]);
        }
        const ini = [fmtData(r.data_inicio_velorio), fmtHora(r.hora_inicio_velorio)].filter(Boolean).join(" às ");
        if (ini) velorio.push(["Início", ini]);
    } else {
        velorio.push(["Velório", "Não realiza"]);
    }
    const dataSepultamento = fmtData(r.data_fim_velorio);
    const horaSepultamento = fmtHora(r.hora_fim_velorio);
    const sep = [dataSepultamento, horaSepultamento].filter(Boolean).join(" às ");
    if (nao(r.realiza_sepultamento)) velorio.push(["Sepultamento", "Não realiza"]);
    else if (sep) velorio.push(["Sepultamento", sep]);
    const cemiterio = g("local_sepultamento") || g("local");
    if (cemiterio) velorio.push(["Cemitério", cemiterio]);
    const respV = g("responsavel_velorio_nome");
    const respS = g("responsavel_sepultamento_nome");
    const resp = [respV && `${respV} (velório)`, respS && respS !== respV ? `${respS} (sepultamento)` : respS && `${respS} (sepultamento)`]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
    if (respV && respS && respV === respS) velorio.push(["Responsável", `${respV} (velório e sepultamento)`]);
    else if (resp.length) velorio.push(["Responsável", resp.join(" · ")]);

    /* ---- serviços ---- */
    const arr = extrairArrumacao(r.arrumacao_json ?? r.arrumacao);
    const servicos: Array<[string, string]> = [];
    if (txt(r.assistencia)) servicos.push(["Assistência", g("assistencia")]);
    if (txt(r.tanato)) servicos.push(["Tanatopraxia", g("tanato")]);
    if (sim(r.reconstituicao_facial)) servicos.push(["Reconstituição facial", "Sim"]);
    if (txt(r.ornamentacao)) {
        servicos.push(["Ornamentação", sim(r.ornamentacao) && g("ornamentacao_tipo") ? `Sim · ${g("ornamentacao_tipo")}` : g("ornamentacao")]);
    }
    if (arr.arrumacao.length) servicos.push(["Conservação", arr.arrumacao.map(rotuloConservacao).join(", ")]);
    if (sim(r.translado)) {
        const trajeto = [g("translado_origem"), g("translado_destino")].filter(Boolean).join(" » ");
        const km = txt(r.translado_km) ? `${g("translado_km")} km` : "";
        servicos.push(["Translado", [trajeto, km].filter(Boolean).join(" · ") || "Sim"]);
    }
    if (sim(r.kit_lanche)) servicos.push(["Kit lanche", "Sim"]);

    const autorizacoes: string[] = [];
    const aut = (campo: string, rotulo: string) => {
        const v = txt(r[campo]);
        if (!v) return;
        autorizacoes.push(`${rotulo} ${sim(v) ? "autorizado" : "não autorizado"}`);
    };
    aut("pacote_autorizado_prefeitura", "pacote");
    if (sim(r.tanato)) aut("tanato_autorizado_prefeitura", "tanatopraxia");
    if (sim(r.translado)) aut("translado_autorizado_prefeitura", "translado");
    if (sim(r.coroa_flores)) aut("coroa_autorizada_prefeitura", "coroa");
    if (autorizacoes.length) {
        servicos.push(["Prefeitura", capitalizar(autorizacoes.join(" · "))
            .replace("tanatopraxia autorizado", "tanatopraxia autorizada")
            .replace("tanatopraxia não autorizado", "tanatopraxia não autorizada")
            .replace("coroa autorizado", "coroa autorizada")
            .replace("coroa não autorizado", "coroa não autorizada")]);
    }

    /* ---- itens de estoque ---- */
    const situacaoBaixa = passouCorpoPronto ? "Baixa no Corpo Pronto" : "Baixa no Corpo Pronto (pendente)";
    const itens: ItemEstoqueRelatorio[] = [];
    const origem = (k: string) => capitalizarLocal(g(k));
    if (g("urna")) itens.push({ grupo: "Urna e roupa", nome: g("urna"), qtd: 1, origem: origem("urna_deposito_nome"), situacao: situacaoBaixa });
    if (g("roupa")) {
        const propria = !g("roupa_deposito_nome") && /propria|família|familia/i.test(g("roupa"));
        itens.push({ grupo: "Urna e roupa", nome: g("roupa"), qtd: 1, origem: propria ? "Família" : origem("roupa_deposito_nome"), situacao: propria ? "" : situacaoBaixa });
    }
    const acessorio = (flag: string, item: string, dep: string, rotulo: string) => {
        if (!sim(r[flag])) return;
        itens.push({ grupo: "Acessórios", nome: g(item) || rotulo, qtd: 1, origem: origem(dep), situacao: situacaoBaixa });
    };
    acessorio("veu", "veu_item", "veu_deposito_nome", "Véu");
    acessorio("cordao", "cordao_item", "cordao_deposito_nome", "Cordão");
    acessorio("invol", "invol_item", "invol_deposito_nome", "Invol");

    for (const ins of arr.insumos) {
        itens.push({
            grupo: "Insumos de tanatopraxia",
            nome: ins.nome,
            qtd: ins.qtd,
            origem: capitalizarLocal(txt(parseJson(r.arrumacao_json ?? r.arrumacao)?.deposito_nome)),
            situacao: situacaoBaixa,
        });
    }

    if (sim(r.coroa_flores)) {
        const coroas = extrairCoroas(r.coroas_itens);
        if (coroas.length) {
            for (const c of coroas) itens.push({ grupo: "Coroas de flores", nome: c.replace(/^\d+\.\s*/, "").replace(/ \| /g, " · "), qtd: 1, origem: "", situacao: "" });
        } else {
            const nomeCoroa = [g("coroa_tipo"), g("coroa_modelo")].filter(Boolean).join(" · ") || "Coroa de flores";
            itens.push({ grupo: "Coroas de flores", nome: nomeCoroa, qtd: 1, origem: origem("coroa_deposito_nome"), situacao: "" });
        }
    }

    /* ---- materiais de assistência ---- */
    const mats = extrairMateriais(r.materiais_json, params.materiaisMap);
    const kits = Array.from(new Set(mats.map((m) => m.categoria).filter((c) => c && c !== "Material")));
    const materiais = mats.map((m) => ({
        nome: kits.length > 1 && m.categoria !== "Material" ? `${m.categoria}: ${m.nome}` : m.nome,
        qtd: m.qtd,
    }));
    const materialRecolhido = nAtual === 11 || logs.some((l) => numeroFase(l.status_novo) === 11);
    const materiaisSituacao = materialRecolhido ? "Recolhido" : "A recolher";

    /* ---- não usados ---- */
    const naoUsados: string[] = [];
    if (nao(r.veu)) naoUsados.push("véu");
    if (nao(r.cordao)) naoUsados.push("cordão");
    if (nao(r.invol)) naoUsados.push("invol");
    if (nao(r.coroa_flores)) naoUsados.push("coroa de flores");
    if (nao(r.kit_lanche)) naoUsados.push("kit lanche");

    /* ---- observações ---- */
    const observacoes: Array<[string, string]> = [];
    const obs = (k: string, rotulo: string) => {
        if (g(k)) observacoes.push([rotulo, g(k)]);
    };
    obs("observacao_atendimento", "Observação do atendimento");
    obs("observacao_itens", "Observação dos itens");
    obs("observacao_velorio01", "Observação do velório");
    obs("observacao_velorio02", "Observação do sepultamento");
    obs("observacao", "Observação");

    /* ---- tempo por etapa ---- */
    const marcos: Array<{ etapa: string; ms: number; hora: string; dia: string }> = [];
    for (const l of logs) {
        if (!ehAcaoDeEtapa(l.acao)) continue;
        const dh = dataHoraDoLog(l.datahora);
        if (!dh) continue;
        const etapa = String(l.acao || "").toLowerCase().includes("criou") ? "Aguardando" : etapaDoStatus(l.status_novo);
        marcos.push({ etapa, ms: dh.ms, hora: dh.hora, dia: dh.dia });
    }
    const tempos: TempoEtapa[] = [];
    for (let i = 0; i < marcos.length; i++) {
        const m = marcos[i];
        const prox = marcos[i + 1];
        const ultimo = tempos[tempos.length - 1];
        if (!prox) {
            if (!finalizado) {
                if (ultimo && ultimo.etapa === m.etapa && ultimo.segundos != null) {
                    tempos.push({ etapa: m.etapa, segundos: null, desde: m.hora });
                    tempos.splice(tempos.length - 2, 1);
                } else {
                    tempos.push({ etapa: m.etapa, segundos: null, desde: m.hora });
                }
            }
            break;
        }
        const seg = Math.max(0, Math.round((prox.ms - m.ms) / 1000));
        if (ultimo && ultimo.etapa === m.etapa && ultimo.segundos != null) ultimo.segundos += seg;
        else tempos.push({ etapa: m.etapa, segundos: seg });
    }
    let temposResumo = "";
    if (marcos.length >= 2) {
        const ini = marcos[0];
        const fim = marcos[marcos.length - 1];
        const total = fmtDuracao(Math.round((fim.ms - ini.ms) / 1000));
        const diaFim = fim.dia !== ini.dia ? `${fim.dia.slice(0, 5)} ` : "";
        temposResumo = `de ${ini.hora} a ${diaFim}${fim.hora} · ${total} até a etapa atual`;
        if (finalizado) temposResumo = `de ${ini.hora} a ${diaFim}${fim.hora} · ${total} no total`;
    }

    /* ---- linha do tempo ---- */
    const linhaTempo = montarLinhaTempo(logs, params.materiaisMap);
    const dias = Array.from(new Set(linhaTempo.map((e) => e.dia).filter(Boolean)));

    /* ---- termos ---- */
    const entrega = [...logs].reverse().find((l) => numeroFase(l.status_novo) === 8 && ehAcaoDeEtapa(l.acao));

    return {
        id,
        nome,
        vida,
        etapaAtual,
        finalizado,
        chips,
        falecido,
        responsavel,
        responsavelNome,
        responsavelCpf,
        velorio,
        servicos,
        itens,
        materiaisKit: kits.length === 1 ? kits[0] : "",
        materiais,
        materiaisSituacao,
        naoUsados,
        observacoes,
        tempos,
        temposResumo,
        linhaTempo,
        variosDias: dias.length > 1,
        diaUnico: dias.length === 1 ? dias[0] : "",
        agenteEntrega: txt(entrega?.usuario) || g("agente"),
        dataVelorio: fmtData(r.data_inicio_velorio),
        dataSepultamento,
        horaSepultamento,
        cemiterio,
    };
}

/** "Mascara" → "Máscara": usa os rótulos do checklist da conservação. */
const ROTULOS_CONSERVACAO = new Map(
    Object.values(ARR_LABELS).map((r) => [r.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""), r]),
);
function rotuloConservacao(r: string) {
    const k = r.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return ROTULOS_CONSERVACAO.get(k) || r;
}

/** "ARMARIO SANDRO" → "Armário Sandro" (só muda a caixa; acentos comuns de depósitos). */
function capitalizarLocal(s: string) {
    if (!s) return "";
    const acentos: Record<string, string> = { armario: "Armário", funeraria: "Funerária", deposito: "Depósito" };
    return s
        .toLowerCase()
        .split(/\s+/)
        .map((p) => acentos[p] || (p.length <= 2 && p !== "de" ? p.toUpperCase() : capitalizar(p)))
        .join(" ")
        .replace(/\bDe\b/g, "de");
}

/* ============================== Linha do tempo ============================== */

function textoDaEdicao(ent: LogItem, materiaisMap?: MateriaisMap) {
    const det = extrairDetalhesLogHumanos(ent.detalhes, materiaisMap);
    const partes: string[] = [];
    const subitens: string[] = [];

    for (const c of det.campos) {
        let valor = semSegundos(c.valor);
        if (valor === "(vazio)") valor = "removido";
        if (valor === "(atualizada)") valor = "atualizada";
        if (/^https?:\/\//i.test(valor)) valor = "localização por GPS";
        partes.push(`${c.label}: ${valor}`);
    }
    for (const t of det.textoLivre) partes.push(t);

    if (det.materiais.length) {
        const kits = Array.from(new Set(det.materiais.map((m) => m.categoria).filter((c) => c && c !== "Material")));
        const total = det.materiais.length;
        partes.push(
            `Materiais de assistência atualizados (${total} ${total === 1 ? "item" : "itens"}${kits.length === 1 ? ` do kit ${kits[0]}` : ""})`,
        );
    }
    if (det.arrumacao.length) subitens.push(`Conservação: ${det.arrumacao.map(rotuloConservacao).join(", ")}`);
    if (det.insumos.length) subitens.push(`Insumos: ${det.insumos.map((i) => `${i.nome} (${i.qtd})`).join(", ")}`);
    if (det.coroas.length) det.coroas.forEach((c) => subitens.push(`Coroa ${c}`));

    if (!partes.length && subitens.length) partes.push("Itens da conservação registrados");
    return { texto: partes.join(" · "), subitens };
}

function montarLinhaTempo(logs: LogItem[], materiaisMap?: MateriaisMap): EventoLinhaTempo[] {
    const out: EventoLinhaTempo[] = [];
    let fotoPendente: { usuario: string; ms: number; nome: string } | null = null;

    for (const ent of logs) {
        const dh = dataHoraDoLog(ent.datahora);
        const dia = dh?.dia || "";
        const hora = dh?.hora || "";
        const por = txt(ent.usuario);
        const acao = String(ent.acao || "").toLowerCase();

        if (acao.includes("criou")) {
            out.push({ dia, hora, texto: "Atendimento aberto", subitens: [], por, etapa: true });
            continue;
        }

        if (acao.startsWith("salvou foto")) {
            const nomeFoto = String(ent.acao || "").replace(/^salvou foto\s*/i, "").trim() || "registro";
            if (fotoPendente) {
                out.push({ dia, hora, texto: `Foto: ${fotoPendente.nome}`, subitens: [], por: fotoPendente.usuario, etapa: false });
            }
            fotoPendente = { usuario: por, ms: dh?.ms || 0, nome: nomeFoto };
            continue;
        }

        if (acao.includes("atualizou status") || acao === "material_recolhido") {
            let nomeEtapa = traduzirFase(ent.status_novo) || capitalizar(txt(ent.status_novo));
            nomeEtapa = capitalizar(nomeEtapa.toLowerCase())
                .replace(/ p\/velório/i, " para o velório")
                .replace(/ p\/ sepultamento/i, " para o sepultamento")
                .replace("óbito", "óbito");
            if (fotoPendente && fotoPendente.usuario === por && dh && dh.ms - fotoPendente.ms <= 120000) {
                nomeEtapa += " (com foto)";
                fotoPendente = null;
            } else if (fotoPendente) {
                out.push({ dia, hora, texto: `Foto: ${fotoPendente.nome}`, subitens: [], por: fotoPendente.usuario, etapa: false });
                fotoPendente = null;
            }

            const ant = out[out.length - 1];
            const antMs = (ant as any)?.__ms as number | undefined;
            if (ant && ant.etapa && ant.por === por && antMs != null && dh && dh.ms - antMs <= 90000 && ant.dia === dia) {
                ant.texto = `${ant.texto} » ${nomeEtapa}`;
                (ant as any).__ms = dh.ms;
                continue;
            }
            const ev: EventoLinhaTempo = { dia, hora, texto: nomeEtapa, subitens: [], por, etapa: true };
            (ev as any).__ms = dh?.ms;
            out.push(ev);
            continue;
        }

        if (fotoPendente) {
            out.push({ dia, hora, texto: `Foto: ${fotoPendente.nome}`, subitens: [], por: fotoPendente.usuario, etapa: false });
            fotoPendente = null;
        }

        if (acao.includes("voltou etapa")) {
            const d: any = parseJson(ent.detalhes) || {};
            const subitens: string[] = [];
            if (txt(d.motivo)) subitens.push(`Motivo: ${txt(d.motivo)}`);
            if (Array.isArray(d.estoque_voltou) && d.estoque_voltou.length) {
                subitens.push(`Voltou ao estoque: ${d.estoque_voltou.join(", ")}`);
            }
            out.push({
                dia, hora,
                texto: `Etapa voltada: ${txt(d.de) || "?"} » ${txt(d.para) || traduzirFase(ent.status_novo)}`,
                subitens, por, etapa: true,
            });
            continue;
        }

        if (acao.includes("assinou")) {
            const termo = acao.includes("requerente") ? "Requisição de veículo assinada" : "Termo de recebimento assinado";
            out.push({ dia, hora, texto: termo, subitens: [], por, etapa: false });
            continue;
        }

        if (acao.includes("cancelou")) {
            const d: any = parseJson(ent.detalhes) || {};
            out.push({ dia, hora, texto: "Atendimento cancelado", subitens: txt(d.motivo) ? [`Motivo: ${txt(d.motivo)}`] : [], por, etapa: true });
            continue;
        }

        const { texto, subitens } = textoDaEdicao(ent, materiaisMap);
        if (!texto && !subitens.length) continue;
        out.push({ dia, hora, texto: texto || capitalizar(txt(ent.acao)), subitens, por, etapa: false });
    }

    if (fotoPendente) {
        const ult = out[out.length - 1];
        out.push({ dia: ult?.dia || "", hora: ult?.hora || "", texto: `Foto: ${fotoPendente.nome}`, subitens: [], por: fotoPendente.usuario, etapa: false });
    }

    return out;
}

/* ============================== Desenho (jsPDF) ============================== */

const COR = {
    azul: "#313C55",
    acao: "#3D6A99",
    fundo: "#E9EFF6",
    amarelo: "#F2CB3F",
    amareloClaro: "#FCF3CC",
    obsFundo: "#FFFBEA",
    verdeClaro: "#EEF5D6",
    cinza: "#6B7487",
    linha: "#DCE2EB",
    suave: "#F6F8FB",
};

const PT = 0.3528; // 1 pt em mm
const PAG_W = 210;
const PAG_H = 297;
const MARG = 14;
const LARG = PAG_W - MARG * 2;
const TOPO = 24;
const LIMITE = PAG_H - 22;

type Doc = any;

function fonte(doc: Doc, tam: number, negrito = false, cor = COR.azul) {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tam);
    doc.setTextColor(cor);
}

function alturaLinha(tam: number, fator = 1.3) {
    return tam * PT * fator;
}

function quebrar(doc: Doc, texto: string, largura: number, tam: number, negrito = false): string[] {
    fonte(doc, tam, negrito);
    return doc.splitTextToSize(String(texto || ""), largura) as string[];
}

function rotuloCaixaAlta(doc: Doc, texto: string, x: number, y: number, tam = 7, cor = COR.cinza, alinhar: "left" | "right" = "left") {
    fonte(doc, tam, true, cor);
    doc.text(texto.toUpperCase(), x, y, { charSpace: 0.35, align: alinhar });
}

class Pagina {
    y = TOPO;
    constructor(public doc: Doc) { }

    garantir(altura: number, aoQuebrar?: () => void) {
        if (this.y + altura > LIMITE) {
            this.doc.addPage();
            this.y = TOPO;
            aoQuebrar?.();
        }
    }

    novaPagina() {
        this.doc.addPage();
        this.y = TOPO;
    }
}

/* ---------- tag (pílula) ---------- */
function larguraTag(doc: Doc, texto: string) {
    fonte(doc, 6.6, true);
    return doc.getTextWidth(texto) + 4;
}

function desenharTag(doc: Doc, texto: string, x: number, yBase: number, fundo: string) {
    const w = larguraTag(doc, texto);
    doc.setFillColor(fundo);
    doc.roundedRect(x, yBase - 2.9, w, 3.9, 1.95, 1.95, "F");
    fonte(doc, 6.6, true);
    doc.text(texto, x + 2, yBase);
    return w;
}

/* ---------- chips ---------- */
function desenharChips(pg: Pagina, chips: Array<[string, string]>) {
    const { doc } = pg;
    const h = 6;
    let x = MARG;
    let y = pg.y;
    for (const [rot, val] of chips) {
        fonte(doc, 7.6, false);
        const w1 = doc.getTextWidth(`${rot} `);
        fonte(doc, 7.6, true);
        const w2 = doc.getTextWidth(val);
        const w = w1 + w2 + 5;
        if (x + w > MARG + LARG) {
            x = MARG;
            y += h + 1.6;
        }
        doc.setFillColor(COR.fundo);
        doc.roundedRect(x, y, w, h, 1.6, 1.6, "F");
        fonte(doc, 7.6, false);
        doc.text(`${rot} `, x + 2.5, y + 4.1);
        fonte(doc, 7.6, true);
        doc.text(val, x + 2.5 + w1, y + 4.1);
        x += w + 1.6;
    }
    pg.y = y + h + 3.5;
}

/* ---------- bloco com título e pares rótulo/valor ---------- */
type Par = [string, string];

function medirPares(doc: Doc, pares: Par[], largura: number, colunas: 1 | 2) {
    const larguraCol = colunas === 2 ? (largura - 6) / 2 : largura;
    fonte(doc, 7.6, false);
    const larguraRot = Math.min(
        26,
        Math.max(...pares.map(([r]) => doc.getTextWidth(r)), 10) + 3,
    );
    const linhas: Array<{ rot: string; val: string[]; col: number; h: number }> = [];
    pares.forEach(([rot, val], i) => {
        const col = colunas === 2 ? i % 2 : 0;
        const linhasVal = quebrar(doc, val, larguraCol - larguraRot, 8.4, true);
        linhas.push({ rot, val: linhasVal, col, h: Math.max(1, linhasVal.length) * alturaLinha(8.4, 1.22) + 1.4 });
    });
    // altura: soma por linha da grade
    let altura = 0;
    if (colunas === 2) {
        for (let i = 0; i < linhas.length; i += 2) altura += Math.max(linhas[i].h, linhas[i + 1]?.h || 0);
    } else {
        altura = linhas.reduce((s, l) => s + l.h, 0);
    }
    return { linhas, altura, larguraRot, larguraCol };
}

function medirBloco(doc: Doc, pares: Par[], largura: number, colunas: 1 | 2) {
    const m = medirPares(doc, pares, largura - 7, colunas);
    return 6.4 + 2.2 + m.altura + 1.2;
}

function desenharBloco(doc: Doc, titulo: string, pares: Par[], x: number, y: number, largura: number, colunas: 1 | 2, alturaFixa?: number) {
    const m = medirPares(doc, pares, largura - 7, colunas);
    const altura = alturaFixa ?? 6.4 + 2.2 + m.altura + 1.2;

    doc.setDrawColor(COR.linha);
    doc.setLineWidth(0.25);
    doc.setFillColor(COR.suave);
    doc.roundedRect(x, y, largura, altura, 2.2, 2.2, "S");
    // faixa do título
    doc.roundedRect(x, y, largura, 6.4, 2.2, 2.2, "F");
    doc.rect(x, y + 3, largura, 3.4, "F");
    doc.line(x, y + 6.4, x + largura, y + 6.4);
    doc.roundedRect(x, y, largura, altura, 2.2, 2.2, "S");
    rotuloCaixaAlta(doc, titulo, x + 3.5, y + 4.3, 6.8);

    let yy = y + 6.4 + 2.2;
    const x0 = x + 3.5;
    for (let i = 0; i < m.linhas.length; i++) {
        const l = m.linhas[i];
        const xc = x0 + l.col * (m.larguraCol + 6);
        fonte(doc, 7.6, false, COR.cinza);
        doc.text(l.rot, xc, yy + 2.6);
        fonte(doc, 8.4, true);
        doc.text(l.val, xc + m.larguraRot, yy + 2.7, { lineHeightFactor: 1.22 });
        if (colunas === 1) yy += l.h;
        else if (l.col === 1 || i === m.linhas.length - 1) {
            const par = l.col === 1 ? m.linhas[i - 1] : null;
            yy += Math.max(l.h, par?.h || 0);
        }
    }
    return altura;
}

/* ---------- título de seção ---------- */
function titulo(pg: Pagina, texto: string, detalhe = "", espacoAntes = 4.5) {
    const { doc } = pg;
    pg.y += espacoAntes;
    pg.garantir(14);
    fonte(doc, 11, true);
    doc.text(texto, MARG, pg.y + 3.8);
    if (detalhe) {
        const w = doc.getTextWidth(texto);
        fonte(doc, 7.8, false, COR.cinza);
        doc.text(detalhe, MARG + w + 2.5, pg.y + 3.8);
    }
    pg.y += 6.5;
}

/* ---------- tabela ---------- */
type Coluna = { titulo: string; w: number; centro?: boolean };
type Celula = { texto?: string; negrito?: boolean; cor?: string; tag?: { texto: string; fundo: string }; caixa?: boolean; sub?: string[] };

function cabecalhoTabela(pg: Pagina, cols: Coluna[]) {
    const { doc } = pg;
    let x = MARG;
    for (const c of cols) {
        rotuloCaixaAlta(doc, c.titulo, c.centro ? x + c.w / 2 : x + 2, pg.y + 3.6, 6.6);
        if (c.centro) {
            // reescreve centralizado
        }
        x += c.w;
    }
    doc.setDrawColor(COR.azul);
    doc.setLineWidth(0.45);
    doc.line(MARG, pg.y + 5.6, MARG + LARG, pg.y + 5.6);
    pg.y += 5.8;
}

function linhaGrupo(pg: Pagina, texto: string, cols: Coluna[], extra?: { texto: string; fundo: string }) {
    const { doc } = pg;
    pg.garantir(6.2, () => cabecalhoTabela(pg, cols));
    doc.setFillColor(COR.suave);
    doc.rect(MARG, pg.y, LARG, 5.2, "F");
    rotuloCaixaAlta(doc, texto, MARG + 2, pg.y + 3.6, 6.6, COR.azul);
    if (extra) {
        fonte(doc, 6.6, true);
        const w = doc.getTextWidth(texto.toUpperCase()) + texto.length * 0.35 + 4;
        desenharTag(doc, extra.texto, MARG + 2 + w, pg.y + 3.7, extra.fundo);
    }
    doc.setDrawColor(COR.linha);
    doc.setLineWidth(0.2);
    doc.line(MARG, pg.y + 5.2, MARG + LARG, pg.y + 5.2);
    pg.y += 5.2;
}

function linhaTabela(pg: Pagina, cols: Coluna[], celulas: Celula[], opcoes: { fundo?: string; tam?: number } = {}) {
    const { doc } = pg;
    const tam = opcoes.tam ?? 8.4;
    const lh = alturaLinha(tam, 1.25);
    const medidas = celulas.map((c, i) => {
        const largura = cols[i].w - 4;
        const linhas = c.texto ? quebrar(doc, c.texto, largura, tam, !!c.negrito) : [];
        const sub = (c.sub || []).flatMap((s) => quebrar(doc, `• ${s}`, largura - 2, tam - 0.6));
        return { linhas, sub, altura: Math.max(1, linhas.length) * lh + sub.length * alturaLinha(tam - 0.6, 1.25) };
    });
    const altura = Math.max(...medidas.map((m) => m.altura)) + 2.6;
    pg.garantir(altura, () => cabecalhoTabela(pg, cols));

    if (opcoes.fundo) {
        doc.setFillColor(opcoes.fundo);
        doc.rect(MARG, pg.y, LARG, altura, "F");
    }

    let x = MARG;
    celulas.forEach((c, i) => {
        const col = cols[i];
        const m = medidas[i];
        const yTexto = pg.y + 1.3 + tam * PT;
        if (c.tag) {
            desenharTag(doc, c.tag.texto, x + 2, yTexto, c.tag.fundo);
        } else if (c.caixa) {
            doc.setDrawColor(COR.azul);
            doc.setLineWidth(0.3);
            doc.rect(x + 2, yTexto - 2.8, 3.2, 3.2, "S");
        } else if (m.linhas.length) {
            fonte(doc, tam, !!c.negrito, c.cor || COR.azul);
            if (col.centro) doc.text(m.linhas, x + col.w / 2, yTexto, { align: "center", lineHeightFactor: 1.25 });
            else doc.text(m.linhas, x + 2, yTexto, { lineHeightFactor: 1.25 });
        }
        if (m.sub.length) {
            fonte(doc, tam - 0.6, false, COR.azul);
            doc.text(m.sub, x + 4, yTexto + m.linhas.length * lh, { lineHeightFactor: 1.25 });
        }
        x += col.w;
    });

    doc.setDrawColor(COR.linha);
    doc.setLineWidth(0.2);
    doc.line(MARG, pg.y + altura, MARG + LARG, pg.y + altura);
    pg.y += altura;
}

/* ---------- topo da página 1 ---------- */
function desenharTopo(pg: Pagina, d: DadosRelatorio) {
    const { doc } = pg;
    rotuloCaixaAlta(doc, "Relatório de Atendimento", MARG, pg.y + 2.6);
    const nomeLinhas = quebrar(doc, d.nome, LARG - 55, 19, true);
    fonte(doc, 19, true);
    doc.text(nomeLinhas, MARG, pg.y + 10, { lineHeightFactor: 1.1 });
    let yy = pg.y + 10 + (nomeLinhas.length - 1) * alturaLinha(19, 1.1);
    if (d.vida) {
        fonte(doc, 8, false, COR.cinza);
        doc.text(d.vida, MARG, yy + 4.6);
        yy += 4.6;
    }

    // etapa atual
    const xd = MARG + LARG;
    rotuloCaixaAlta(doc, "Etapa atual", xd, pg.y + 7, 6.6, COR.cinza, "right");
    fonte(doc, 8, true);
    const wSelo = doc.getTextWidth(d.etapaAtual) + 7;
    doc.setFillColor(d.finalizado ? "#B3CE52" : COR.amarelo);
    doc.roundedRect(xd - wSelo, pg.y + 9, wSelo, 6, 3, 3, "F");
    fonte(doc, 8, true);
    doc.text(d.etapaAtual, xd - wSelo / 2, pg.y + 13.1, { align: "center" });

    pg.y = Math.max(yy, pg.y + 15) + 2.6;
    doc.setDrawColor(COR.azul);
    doc.setLineWidth(0.6);
    doc.line(MARG, pg.y, MARG + LARG, pg.y);
    pg.y += 3;
}

/* ---------- página 1 ---------- */
function desenharResumo(pg: Pagina, d: DadosRelatorio) {
    const { doc } = pg;
    desenharTopo(pg, d);
    desenharChips(pg, d.chips);

    // Falecido | Responsável
    const meia = (LARG - 3) / 2;
    const h1 = Math.max(medirBloco(doc, d.falecido, meia, 1), medirBloco(doc, d.responsavel, meia, 1));
    pg.garantir(h1);
    desenharBloco(doc, "Falecido(a)", d.falecido, MARG, pg.y, meia, 1, h1);
    desenharBloco(doc, "Responsável", d.responsavel, MARG + meia + 3, pg.y, meia, 1, h1);
    pg.y += h1 + 3;

    // Velório e sepultamento (local na linha toda, o resto em 2 colunas)
    if (d.velorio.length) {
        const [primeiro, ...resto] = d.velorio;
        const linhaToda = primeiro[0] === "Local do velório";
        const pares = linhaToda ? resto : d.velorio;
        const hLocal = linhaToda ? medirBloco(doc, [primeiro], LARG, 1) - 6.4 - 2.2 - 1.2 : 0;
        const h2 = medirBloco(doc, pares, LARG, 2) + hLocal;
        pg.garantir(h2);
        desenharBlocoVelorio(doc, linhaToda ? primeiro : null, pares, pg.y, h2);
        pg.y += h2 + 3;
    }

    if (d.servicos.length) {
        const h3 = medirBloco(doc, d.servicos, LARG, 2);
        pg.garantir(h3);
        desenharBloco(doc, "Serviços", d.servicos, MARG, pg.y, LARG, 2, h3);
        pg.y += h3;
    }

    // Itens e materiais usados
    const total = d.itens.reduce((s, i) => s + i.qtd, 0) + d.materiais.reduce((s, m) => s + m.qtd, 0);
    titulo(pg, "Itens e materiais usados", total ? `${d.itens.length + d.materiais.length} itens` : "");

    if (d.itens.length) {
        const cols: Coluna[] = [
            { titulo: "Item", w: LARG - 12 - 40 - 46 },
            { titulo: "Qtd", w: 12, centro: true },
            { titulo: "Saiu de", w: 40 },
            { titulo: "Situação", w: 46 },
        ];
        cabecalhoTabela(pg, cols);
        let grupoAtual = "";
        for (const it of d.itens) {
            if (it.grupo !== grupoAtual) {
                linhaGrupo(pg, it.grupo, cols);
                grupoAtual = it.grupo;
            }
            linhaTabela(pg, cols, [
                { texto: it.nome },
                { texto: String(it.qtd) },
                { texto: it.origem || "—", cor: it.origem ? COR.azul : COR.cinza },
                it.situacao ? { tag: { texto: it.situacao, fundo: COR.fundo } } : { texto: "" },
            ]);
        }
    }

    if (d.materiais.length) {
        pg.y += 2;
        const metade = (LARG - 24) / 2;
        const cols: Coluna[] = [
            { titulo: d.materiaisKit ? `Material de assistência · kit ${d.materiaisKit}` : "Material de assistência", w: metade },
            { titulo: "Qtd", w: 12, centro: true },
            { titulo: "Material", w: metade },
            { titulo: "Qtd", w: 12, centro: true },
        ];
        pg.garantir(12);
        cabecalhoTabela(pg, cols);
        for (let i = 0; i < d.materiais.length; i += 2) {
            const a = d.materiais[i];
            const b = d.materiais[i + 1];
            linhaTabela(pg, cols, [
                { texto: a.nome },
                { texto: String(a.qtd) },
                { texto: b?.nome || "" },
                { texto: b ? String(b.qtd) : "" },
            ]);
        }
    }

    // situação dos materiais + não usados
    const partes: string[] = [];
    if (d.naoUsados.length) partes.push(`Não usados: ${juntarLista(d.naoUsados)}.`);
    if (d.materiais.length || partes.length) {
        pg.garantir(6);
        let x = MARG;
        const yb = pg.y + 4;
        if (d.materiais.length) {
            const recolhido = d.materiaisSituacao === "Recolhido";
            x += desenharTag(doc, d.materiaisSituacao, x, yb, recolhido ? COR.verdeClaro : COR.amareloClaro) + 1.5;
            fonte(doc, 7.4, false, COR.cinza);
            const t = recolhido ? "material de assistência devolvido" : "no fim do velório";
            doc.text(t, x, yb);
            x += doc.getTextWidth(t) + 2;
            if (partes.length) {
                doc.text("·", x, yb);
                x += 3;
            }
        }
        if (partes.length) {
            fonte(doc, 7.4, false, COR.cinza);
            doc.text(partes.join(" "), x, yb);
        }
        pg.y += 6;
    }

    // Observações em 2 colunas
    if (d.observacoes.length) {
        pg.y += 1.5;
        const meiaObs = (LARG - 3) / 2;
        for (let i = 0; i < d.observacoes.length; i += 2) {
            const par = d.observacoes.slice(i, i + 2);
            const alturas = par.map(([, t]) => quebrar(doc, t, meiaObs - 7, 8.4).length * alturaLinha(8.4, 1.25) + 8);
            const h = Math.max(...alturas);
            pg.garantir(h + 2);
            par.forEach(([rot, t], j) => {
                const x = MARG + j * (meiaObs + 3);
                doc.setFillColor(COR.obsFundo);
                doc.rect(x, pg.y, meiaObs, h, "F");
                doc.setFillColor(COR.amarelo);
                doc.rect(x, pg.y, 0.9, h, "F");
                rotuloCaixaAlta(doc, rot, x + 3.5, pg.y + 3.8, 6.4);
                fonte(doc, 8.4, false);
                doc.text(quebrar(doc, t, meiaObs - 7, 8.4), x + 3.5, pg.y + 7.6, { lineHeightFactor: 1.25 });
            });
            pg.y += h + 2;
        }
    }
}

function desenharBlocoVelorio(doc: Doc, local: Par | null, pares: Par[], y: number, altura: number) {
    const x = MARG;
    desenharBloco(doc, "Velório e sepultamento", [], x, y, LARG, 1, altura);
    let yy = y + 6.4 + 2.2;
    const x0 = x + 3.5;
    if (local) {
        fonte(doc, 7.6, false, COR.cinza);
        doc.text(local[0], x0, yy + 2.6);
        fonte(doc, 7.6, false);
        const wr = doc.getTextWidth(local[0]) + 3;
        const linhas = quebrar(doc, local[1], LARG - 7 - wr, 8.4, true);
        fonte(doc, 8.4, true);
        doc.text(linhas, x0 + wr, yy + 2.7, { lineHeightFactor: 1.22 });
        yy += linhas.length * alturaLinha(8.4, 1.22) + 1.4;
    }
    const m = medirPares(doc, pares, LARG - 7, 2);
    for (let i = 0; i < m.linhas.length; i++) {
        const l = m.linhas[i];
        const xc = x0 + l.col * (m.larguraCol + 6);
        fonte(doc, 7.6, false, COR.cinza);
        doc.text(l.rot, xc, yy + 2.6);
        fonte(doc, 8.4, true);
        doc.text(l.val, xc + m.larguraRot, yy + 2.7, { lineHeightFactor: 1.22 });
        if (l.col === 1 || i === m.linhas.length - 1) {
            const par = l.col === 1 ? m.linhas[i - 1] : null;
            yy += Math.max(l.h, par?.h || 0);
        }
    }
}

function juntarLista(itens: string[]) {
    if (itens.length <= 1) return itens.join("");
    return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/* ---------- página 2 ---------- */
function desenharTemposELinha(pg: Pagina, d: DadosRelatorio) {
    const { doc } = pg;
    pg.novaPagina();

    if (d.tempos.length) {
        titulo(pg, "Tempo por etapa", d.temposResumo, 0);
        const maior = Math.max(1, ...d.tempos.map((t) => t.segundos || 0));
        const wRot = 52;
        const wTempo = 22;
        const wBarra = LARG - wRot - wTempo - 4;
        let temCurta = false;
        for (const t of d.tempos) {
            pg.garantir(6);
            fonte(doc, 8.4, false);
            doc.text(t.etapa, MARG + 2, pg.y + 3.9);
            if (t.segundos == null) {
                fonte(doc, 8.2, false, COR.cinza);
                doc.text(`em andamento desde ${t.desde}`, MARG + wRot, pg.y + 3.9);
            } else {
                const curta = t.segundos < 60;
                temCurta = temCurta || curta;
                const w = Math.max(1.2, (t.segundos / maior) * wBarra);
                doc.setFillColor(curta ? COR.amarelo : COR.acao);
                doc.roundedRect(MARG + wRot, pg.y + 1.7, w, 2.6, 1.3, 1.3, "F");
                fonte(doc, 8.4, true);
                doc.text(fmtDuracao(t.segundos), MARG + LARG - 2, pg.y + 3.9, { align: "right" });
            }
            doc.setDrawColor(COR.linha);
            doc.setLineWidth(0.2);
            doc.line(MARG, pg.y + 5.6, MARG + LARG, pg.y + 5.6);
            pg.y += 5.6;
        }
        if (temCurta) {
            fonte(doc, 7.2, false, COR.cinza);
            doc.text("Em amarelo: etapa marcada em menos de 1 minuto (início e fim registrados em sequência no app).", MARG, pg.y + 3.6);
            pg.y += 4.5;
        }
    }

    titulo(pg, "Linha do tempo", d.variosDias ? "" : d.diaUnico, 5);
    const cols: Coluna[] = [
        { titulo: "Hora", w: 14 },
        { titulo: "O que aconteceu", w: LARG - 14 - 26 },
        { titulo: "Por", w: 26 },
    ];
    cabecalhoTabela(pg, cols);
    let diaAtual = "";
    for (const ev of d.linhaTempo) {
        if (d.variosDias && ev.dia !== diaAtual) {
            linhaGrupo(pg, ev.dia, cols);
            diaAtual = ev.dia;
        }
        linhaTabela(
            pg,
            cols,
            [
                { texto: ev.hora, negrito: true },
                { texto: ev.texto, negrito: ev.etapa, sub: ev.subitens },
                { texto: ev.por, cor: COR.cinza },
            ],
            { fundo: ev.etapa ? COR.fundo : undefined, tam: 8.2 },
        );
    }
}

/* ---------- termos ---------- */
export type DadosTermos = {
    responsavel: string;
    cpfResponsavel: string;
    requerente: string;
    cpfRequerente: string;
    assinaturaResponsavelB64?: string;
    assinaturaRequerenteB64?: string;
};

function tituloTermo(pg: Pagina, texto: string) {
    const { doc } = pg;
    fonte(doc, 12.5, true);
    doc.text(texto, PAG_W / 2, pg.y + 6, { align: "center", charSpace: 0.2 });
    pg.y += 12;
}

function linhaAssinatura(pg: Pagina, nome: string, detalhe: string, imagem?: string) {
    const { doc } = pg;
    pg.garantir(46);
    const yLinha = pg.y + 32;
    const w = LARG * 0.7;
    const x = MARG + (LARG - w) / 2;
    if (imagem) {
        try {
            doc.addImage(imagem, "PNG", PAG_W / 2 - 30, yLinha - 27, 60, 26, undefined, "FAST");
        } catch { }
    }
    doc.setDrawColor(COR.azul);
    doc.setLineWidth(0.35);
    doc.line(x, yLinha, x + w, yLinha);
    fonte(doc, 9, true);
    doc.text(nome || " ", PAG_W / 2, yLinha + 4.6, { align: "center" });
    fonte(doc, 7.8, false, COR.cinza);
    doc.text(detalhe, PAG_W / 2, yLinha + 8.6, { align: "center" });
    pg.y = yLinha + 10;
}

function desenharTermoRecebimento(pg: Pagina, d: DadosRelatorio, t: DadosTermos) {
    const { doc } = pg;
    pg.novaPagina();
    tituloTermo(pg, "TERMO DE RECEBIMENTO DE MATERIAL PARA ASSISTÊNCIA");
    desenharChips(pg, [
        ["Responsável", t.responsavel || "________________"],
        ["CPF", t.cpfResponsavel || "____.____.____-__"],
        ["Falecido(a)", d.nome],
        ["Entregue por", d.agenteEntrega || "________________"],
    ]);
    fonte(doc, 9.6, false);
    doc.text(
        quebrar(doc, "Confirmo o recebimento do material abaixo e me comprometo a zelar por ele e devolvê-lo nas mesmas condições.", LARG, 9.6),
        MARG,
        pg.y + 3,
    );
    pg.y += 8;

    const cols: Coluna[] = [
        { titulo: d.materiaisKit ? `Item · kit ${d.materiaisKit}` : "Item", w: LARG - 14 - 26 },
        { titulo: "Qtd", w: 14, centro: true },
        { titulo: "Devolvido", w: 26 },
    ];
    cabecalhoTabela(pg, cols);
    if (!d.materiais.length) {
        linhaTabela(pg, cols, [{ texto: "Nenhum material de assistência selecionado.", cor: COR.cinza }, { texto: "" }, { texto: "" }]);
    }
    for (const m of d.materiais) {
        linhaTabela(pg, cols, [{ texto: m.nome }, { texto: String(m.qtd) }, { caixa: true }]);
    }

    fonte(doc, 9.6, false);
    doc.text(`Barreiras – BA, ${d.dataVelorio || "____/____/________"}`, MARG, pg.y + 10);
    pg.y += 12;
    linhaAssinatura(
        pg,
        t.responsavel,
        t.cpfResponsavel ? `CPF ${t.cpfResponsavel} · responsável pelo recebimento` : "Responsável pelo recebimento (assinatura)",
        t.assinaturaResponsavelB64,
    );
}

function desenharRequisicao(pg: Pagina, d: DadosRelatorio, t: DadosTermos) {
    const { doc } = pg;
    pg.novaPagina();
    tituloTermo(pg, "REQUISIÇÃO DE VEÍCULO FUNERÁRIO PARA SEPULTAMENTO");
    const sep = [d.dataSepultamento, d.horaSepultamento].filter(Boolean).join(" às ");
    const chips: Array<[string, string]> = [["Falecido(a)", d.nome], ["Sepultamento", sep || "____/____/____ às ____:____"]];
    if (d.cemiterio) chips.push(["Cemitério", d.cemiterio]);
    desenharChips(pg, chips);

    fonte(doc, 9.6, false);
    doc.text("Requerente:", MARG, pg.y + 4);
    let x = MARG + doc.getTextWidth("Requerente: ") + 1;
    if (t.requerente) {
        fonte(doc, 9.6, true);
        doc.text(t.requerente, x, pg.y + 4);
        x += doc.getTextWidth(t.requerente) + 6;
    } else {
        doc.setDrawColor(COR.azul);
        doc.setLineWidth(0.3);
        doc.line(x, pg.y + 4.6, x + 70, pg.y + 4.6);
        x += 76;
    }
    fonte(doc, 9.6, false);
    doc.text("CPF:", x, pg.y + 4);
    const xc = x + doc.getTextWidth("CPF: ") + 1;
    if (t.cpfRequerente) {
        fonte(doc, 9.6, true);
        doc.text(t.cpfRequerente, xc, pg.y + 4);
    } else {
        doc.line(xc, pg.y + 4.6, xc + 40, pg.y + 4.6);
    }
    pg.y += 10;

    const texto =
        "Solicito à empresa PAI – Plano Assistencial Integrado veículo funerário para a realização do sepultamento. " +
        "Tenho conhecimento de que este pedido deve ser feito com antecedência mínima de 5 (cinco) horas. " +
        "Caso o atendimento ocorra fora desse prazo, a empresa fica isenta de responsabilidade por qualquer contratempo.";
    const linhas = quebrar(doc, texto, LARG, 9.6);
    fonte(doc, 9.6, false);
    doc.text(linhas, MARG, pg.y + 2, { lineHeightFactor: 1.5 });
    pg.y += linhas.length * alturaLinha(9.6, 1.5) + 8;
    doc.text("Barreiras – BA, ____/____/________", MARG, pg.y);
    pg.y += 4;
    linhaAssinatura(
        pg,
        t.requerente,
        t.cpfRequerente ? `CPF ${t.cpfRequerente} · requerente` : "Requerente (assinatura)",
        t.assinaturaRequerenteB64,
    );
}

/* ---------- cabeçalho e rodapé em todas as páginas ---------- */
function desenharMoldura(doc: Doc, d: DadosRelatorio, logoPng?: string) {
    const total = doc.getNumberOfPages();
    const hoje = new Date();
    const emitido = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;

    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        if (logoPng) {
            try {
                doc.addImage(logoPng, "PNG", MARG, 7, 33.5, 9, undefined, "FAST");
            } catch { }
        } else {
            fonte(doc, 12, true);
            doc.text("PAI", MARG, 13);
        }
        fonte(doc, 6.8, false, COR.cinza);
        doc.text(`${d.id ? `Atendimento nº ${d.id} · ` : ""}${d.nome}`, MARG + LARG, 12.5, { align: "right" });

        const yr = PAG_H - 16;
        doc.setDrawColor(COR.linha);
        doc.setLineWidth(0.2);
        doc.line(MARG, yr - 3, MARG + LARG, yr - 3);
        fonte(doc, 6.4, true);
        doc.text("77 3611.3248", MARG, yr);
        doc.text("Plantão 24h · 77 3611.2440", MARG + LARG, yr, { align: "right" });
        fonte(doc, 6.4, false);
        doc.text("Av. Dr. Clériston Andrade, 135 – Centro, Barreiras – BA", MARG, yr + 3);
        doc.text("CNPJ 03.726.651/0001-51", MARG, yr + 6);
        doc.text("Serviços Funerários", MARG + LARG, yr + 3, { align: "right" });
        doc.text(`Página ${i} de ${total} · emitido em ${emitido}`, MARG + LARG, yr + 6, { align: "right" });
    }
}

/* ============================== Entrada ============================== */

export function desenharRelatorio(doc: Doc, d: DadosRelatorio, termos: DadosTermos, logoPng?: string) {
    const pg = new Pagina(doc);
    desenharResumo(pg, d);
    desenharTemposELinha(pg, d);
    desenharTermoRecebimento(pg, d, termos);
    desenharRequisicao(pg, d, termos);
    desenharMoldura(doc, d, logoPng);
}
