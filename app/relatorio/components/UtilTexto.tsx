"use client";

export function sanitize(txt?: string) {
    if (!txt) return "";
    return String(txt)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;");
}

export function capitalize(s?: string) {
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function titleCaseFromSnake(s: string) {
    return s
        .split("_")
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
        .join(" ");
}

export function normalizarChaveVisual(originalKey: string) {
    return String(originalKey || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\d]+/gu, "_")
        .replace(/^_+|_+$/g, "");
}

export function overrideCampoNome(originalKey: string, nomeAtual: string) {
    const k = normalizarChaveVisual(originalKey);

    const MAP: Record<string, string> = {
        assinatura_requerente: "Termo de Requisição de Veículo",
        assinatura_responsavel: "Termo de Recebimento de Material",

        falecido: "Falecido(a)",
        contato: "Contato",
        telefone: "Telefone",
        telefone_responsavel: "Telefone do Responsável",
        data_nascimento: "Data de Nascimento",
        data_falecimento: "Data de Falecimento",
        foto_falecido: "Foto do Falecido(a)",
        nome_responsavel: "Nome do Responsável",
        cpf_responsavel: "CPF do Responsável",
        tipo_atendimento: "Tipo de Atendimento",

        assistencia: "Assistência",
        ornamentaca: "Ornamentação",
        ornamentacao: "Ornamentação",
        ornamentacao_tipo: "Tipo de Ornamentação",
        religiao: "Religião",
        convenio: "Convênio",
        tanato: "Tanatopraxia",
        invol: "Invol",
        invol_item: "Invol Utilizado",
        kit_lanche: "Kit Lanche",
        coroa_flores: "Coroa de Flores",
        coroa_tipo: "Tipo de Coroa",
        coroa_modelo: "Modelo da Coroa",

        urna: "Urna",
        roupa: "Roupa",
        veu: "Véu",
        veu_item: "Véu Utilizado",
        cordao: "Cordão",
        cordao_item: "Cordão Utilizado",

        realiza_velorio: "Realiza Velório",
        local_velorio: "Local do Velório",
        sala_velorio: "Sala do Velório",
        velorio_online: "Velório Online",
        realiza_sepultamento: "Realiza Sepultamento",
        local: "Local do Sepultamento",
        local_sepultamento: "Local do Sepultamento",
        data_inicio_velorio: "Data de Início do Velório",
        data_fim_velorio: "Data do Fim do Velório",
        hora_inicio_velorio: "Horário de Início do Velório",
        hora_fim_velorio: "Horário do Sepultamento",

        observacao_velorio01: "Observação de Velório",
        observacao_velorio02: "Observação de Sepultamento",
        observacao_atendimento: "Observação do Atendimento",
        observacao_itens: "Observação dos Itens",
        observacao: "Observação",

        responsavel_velorio_nome: "Responsável pelo Velório",
        responsavel_sepultamento_nome: "Responsável pelo Sepultamento",
    };

    return MAP[k] ?? nomeAtual;
}

export function substituirRotuloVisual(texto: string) {
    if (!texto) return texto;

    const repl = (src: string | RegExp, dst: string) =>
        (texto = texto.replace(src as any, dst));

    repl(/\bdata[_\s]*nascimento\b/gi, "Data de Nascimento");
    repl(/\bdata[_\s]*falecimento\b/gi, "Data de Falecimento");
    repl(/\bfoto[_\s]*falecido\b/gi, "Foto do Falecido(a)");
    repl(/\bnome[_\s]*responsavel\b/gi, "Nome do Responsável");
    repl(/\bcpf[_\s]*responsavel\b/gi, "CPF do Responsável");
    repl(/\brelig[ií]ao\b/gi, "Religião");
    repl(/\bconvenio\b/gi, "Convênio");
    repl(/\blocal[_\s]*vel[oó]rio\b/gi, "Local do Velório");
    repl(/\bdata[_\s]*inicio[_\s]*vel[oó]rio\b/gi, "Data de Início do Velório");
    repl(/\bdata[_\s]*fim[_\s]*vel[oó]rio\b/gi, "Data do Fim do Velório");
    repl(/\bhora[_\s]*inicio[_\s]*vel[oó]rio\b/gi, "Horário de Início do Velório");
    repl(/\bhora[_\s]*fim[_\s]*vel[oó]rio\b/gi, "Horário do Sepultamento");
    repl(/\bobservacao[_\s]*velorio01\b/gi, "Observação de Velório");
    repl(/\bobservacao[_\s]*velorio02\b/gi, "Observação de Sepultamento");
    repl(/\bobservacao[_\s]*atendimento\b/gi, "Observação do Atendimento");
    repl(/\bobservacao[_\s]*itens?\b/gi, "Observação dos Itens");
    repl(/\btanato\b/gi, "Tanatopraxia");

    return texto;
}