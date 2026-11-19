/**
 * Regra única de "o atendimento ainda está em andamento".
 *
 * É a mesma regra do Quadro de Acompanhamento (atendimentoDeveFicarNoQuadro). Fica aqui para a
 * lista de Atendimentos e os números do Início usarem exatamente o mesmo critério do Quadro:
 * concluídos não aparecem. O Quadro continua com a sua cópia (não foi alterado).
 */

export type RegistroRegra = {
    status?: string;
    tipo_atendimento?: string;
    assistencia?: string;
    tanato?: string;
    ornamentacao?: string;
    realiza_velorio?: string;
    realiza_sepultamento?: string;
    agente?: string;
    responsavel_velorio_nome?: string | null;
    responsavel_sepultamento_nome?: string | null;
    [k: string]: any;
};

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
    "transportando p/ velorio": "fase07",
    velando: "fase08",
    sepultando: "fase09",
    "transportando p/ sepultamento": "fase09",
    "sepultamento concluido": "fase10",
    "material recolhido": "fase11",
    concluido: "fase11",
};

function chave(s: string) {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function txt(v: unknown) {
    return String(v ?? "").trim().toLowerCase();
}

export function normalizarStatus(status?: string): string | undefined {
    if (!status) return undefined;
    const s = String(status).trim();
    if (s.toLowerCase().startsWith("fase")) {
        const digits = s.replace(/[^0-9]/g, "");
        if (!digits) return s.toLowerCase();
        return `fase${digits.padStart(2, "0")}`;
    }
    return (ROTULO_PARA_FASE[chave(s)] || s).toLowerCase();
}

export function isSimTxt(v: unknown) {
    const s = txt(v);
    return s === "sim" || s === "s";
}

export function isNaoTxt(v: unknown) {
    const s = txt(v);
    return s === "não" || s === "nao" || s === "n";
}

export function isTerceiroRegistro(r: RegistroRegra) {
    const tipo = txt(r.tipo_atendimento);
    if (tipo === "terceiro") return true;
    if (tipo === "funerario") return false;
    return isNaoTxt(r.assistencia) && isNaoTxt(r.tanato) && isNaoTxt(r.ornamentacao);
}

/** Vazio = atendimento legado, que tinha a etapa. Só "Não" desativa. */
function rotaAtiva(v: unknown) {
    const s = txt(v);
    if (!s) return true;
    return s !== "não" && s !== "nao" && s !== "n";
}

export function atendimentoDeveFicarNoQuadro(r: RegistroRegra): boolean {
    const status = normalizarStatus(r.status);
    if (!status) return true;
    if (status === "fase11") return false;

    const precisaMaterialRecolhido = !isTerceiroRegistro(r) && isSimTxt(r.assistencia);
    if (precisaMaterialRecolhido) return true;

    if (rotaAtiva(r.realiza_sepultamento)) return status !== "fase10";
    if (rotaAtiva(r.realiza_velorio)) return !["fase08", "fase09", "fase10"].includes(status);
    return !["fase12", "fase07", "fase08", "fase09", "fase10"].includes(status);
}

/** Falta só recolher o material (a última rota já terminou e há assistência a recolher). */
export function aguardandoRecolhimento(r: RegistroRegra): boolean {
    if (!atendimentoDeveFicarNoQuadro(r)) return false;
    if (isTerceiroRegistro(r) || !isSimTxt(r.assistencia)) return false;

    const status = normalizarStatus(r.status);
    if (!status) return false;

    if (rotaAtiva(r.realiza_sepultamento)) return status === "fase10";
    if (rotaAtiva(r.realiza_velorio)) return ["fase08", "fase09", "fase10"].includes(status);
    return ["fase12", "fase07", "fase08", "fase09", "fase10"].includes(status);
}

/** O atendimento está com o usuário (agente ou responsável pelo trecho atual). */
export function aguardaAcaoDe(r: RegistroRegra, nome: string): boolean {
    const eu = chave(nome);
    if (!eu) return false;
    return [r.agente, r.responsavel_velorio_nome, r.responsavel_sepultamento_nome].some((x) => chave(String(x ?? "")) === eu);
}
