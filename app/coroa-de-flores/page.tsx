"use client";

/*
 * OTIMIZAÇÕES DE PERFORMANCE:
 * - sem polling de atendimentos a cada 8 segundos;
 * - sem refresh automático ao recuperar foco da janela;
 * - filtros só consultam o servidor ao clicar em Buscar;
 * - AbortController cancela requisições antigas;
 * - listas normais podem aproveitar o cache HTTP curto do backend;
 * - estoque é reaproveitado em memória por 60s;
 * - falecidos do quadro são reaproveitados por 30s;
 * - após uma ação atualiza somente a aba afetada;
 * - coroas somente artificiais usam Faixa → Finalizada → Entregue;
 * - o usuário atual é enviado como fallback para as notificações de ação;
 * - pedidos criados manualmente nesta tela usam sempre origem Venda Direta;
 * - evita montar simultaneamente as linhas mobile e desktop;
 * - foto final e comprovantes usam multipart/form-data, sem Base64;
 * - câmera direta captura em até 960x720 e JPEG leve, com fallback para câmera nativa;
 * - fotos originais grandes não são renderizadas como preview antes do envio.
 */

import * as React from "react";
import {
    IconCamera,
    IconCheck,
    IconChevronLeft,
    IconChevronRight,
    IconCopy,
    IconEye,
    IconPhoto,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconSend,
    IconUpload,
    IconX,
} from "@tabler/icons-react";

export const dynamic = "force-dynamic";

/* =========================================================
   CONFIGURAÇÃO
   ========================================================= */
const COROAS_API = "https://api.planoassistencialintegrado.com.br/coroas.php";
const ATENDIMENTOS_API = "https://api.planoassistencialintegrado.com.br/informativo.php?listar=1";
const USUARIO_ATUAL_API = "https://api.planoassistencialintegrado.com.br/informativo.php?me=1";
const MATERIAIS_API = "https://api.planoassistencialintegrado.com.br/materiais_gerais.php";
const API_PUBLIC_BASE = "https://api.planoassistencialintegrado.com.br";

/* =========================================================
   PEDIDOS MANUAIS
   ========================================================= */
type ManualStatus = "novo" | "coroa" | "faixa" | "finalizada" | "entregue";
type ManualPagamento = "pago" | "aguardando_pagamento";
type ManualOrigem =
    | "ordem_servico"
    | "venda_direta";

type ManualCoroaItem = {
    id?: number;
    coroa_id?: number;
    ordem: number;
    tipo_coroa?: "natural" | "artificial" | null;
    produto_id?: number | null;
    deposito_nome?: string | null;
    modelo_coroa: string;
    frase: string;
    valor?: string | number | null;
    foto_produto_url?: string | null;
};

type ManualOrder = {
    id: number;
    solicitante: string;
    telefone?: string | null;
    local_entrega?: string | null;
    observacoes?: string | null;
    quantidade_coroas?: number;
    itens?: ManualCoroaItem[];
    modelo_coroa: string;
    frase: string;
    falecido: string;
    falecido_atendimento_id?: number | null;
    atendimento_origem_id?: number | null;
    status_pagamento: ManualPagamento;
    origem: ManualOrigem;
    /** ID do pedido no WooCommerce quando o registro veio da loja online. */
    origem_externa_id?: string | null;
    status: ManualStatus;
    comprovante_url?: string | null;
    comprovante_mime?: string | null;
    comprovante_nome?: string | null;
    foto_coroa_url?: string | null;
    criado_por?: string | null;
    criado_em?: string | null;
    atualizado_em?: string | null;
    coroa_inicio_em?: string | null;
    coroa_inicio_por?: string | null;
    faixa_inicio_em?: string | null;
    faixa_inicio_por?: string | null;
    finalizada_em?: string | null;
    finalizada_por?: string | null;
    entregue_em?: string | null;
    entregue_por?: string | null;
};

type ManualListResponse = {
    sucesso: boolean;
    dados: ManualOrder[];
    meta?: { page: number; per_page: number; total: number; total_pages: number };
    msg?: string;
};

type AtendimentoResumo = {
    id?: number | string;
    falecido?: string;
    local_velorio?: string;
    status?: string;
    assistencia?: string;
    tanato?: string;
    ornamentacao?: string;
    tipo_atendimento?: string;
};

type UsuarioAtualResponse = {
    id?: number | string;
    usuario?: string;
    nome?: string;
    erro?: boolean | number;
    msg?: string;
};

type CoroaTipo = "" | "natural" | "artificial";
type CoroaDeposito = "" | "MEMORIAL" | "FUNERARIA";

type EstoqueProdutoFoto = {
    id?: number;
    produto_id?: number;
    arquivo?: string | null;
    foto_url?: string | null;
    legenda?: string | null;
    ordem?: number;
    is_principal?: 0 | 1 | number;
};

type EstoqueProduto = {
    id: number;
    nome: string;
    descricao?: string | null;
    codigo_barras?: string | null;
    valor?: string | number;
    preco_custo?: string | number;
    foto_url?: string | null;
    fotos?: EstoqueProdutoFoto[];
    ativo?: 0 | 1 | number;
    categoria_id?: number | null;
    categoria_nome?: string | null;
    fabricante_nome?: string | null;
    classificacao_nome?: string | null;
};

type NovoCoroaItem = {
    tipo_coroa: CoroaTipo;
    deposito_nome: CoroaDeposito;
    produto: EstoqueProduto | null;
    frase: string;
    frase_sugestao: string;
};

function criarNovoCoroaItem(): NovoCoroaItem {
    return {
        tipo_coroa: "",
        deposito_nome: "",
        produto: null,
        frase: "",
        frase_sugestao: "",
    };
}

type EstoqueDeposito = {
    id: number;
    nome: string;
};

type EstoqueSaldo = {
    id?: number;
    produto_id: number;
    deposito_id?: number;
    quantidade: number;
};

type MateriaisInitResponse = {
    ok?: boolean;
    depositos?: EstoqueDeposito[];
    produtos?: EstoqueProduto[];
    saldos?: EstoqueSaldo[];
    msg?: string;
    need_login?: 1;
};

const MANUAL_STATUS_OPTIONS: Array<{ value: ManualStatus | "todos"; label: string }> = [
    { value: "todos", label: "Todos" },
    { value: "novo", label: "Aguardando Confecção" },
    { value: "coroa", label: "Coroa em Confecção" },
    { value: "faixa", label: "Faixa em Confecção" },
    { value: "finalizada", label: "Finalizada" },
    { value: "entregue", label: "Entregue" },
];


type FraseSugerida = { numero: number; texto: string };

const FRASES_SUGERIDAS: FraseSugerida[] = [
    { numero: 1, texto: "A saudade e o pesar dos seus colegas da (nome da empresa)." },
    { numero: 2, texto: "A Ti, Senhor, elevo e entrego a minha alma." },
    { numero: 3, texto: "Aquele que crê no Salvador jamais morrerá." },
    { numero: 4, texto: "Com amor de seus pais e irmãos." },
    { numero: 5, texto: "Com pesar da família (nome da família)." },
    { numero: 6, texto: "Com pesar do(a) (nome da empresa, nome da família, nome dos amigos)." },
    { numero: 7, texto: "Com pesar dos amigos (nome da empresa, nome da família)." },
    { numero: 8, texto: "Com pesar dos colegas (nome da empresa)." },
    { numero: 9, texto: "Condolências de toda a equipe da (nome da empresa)." },
    { numero: 10, texto: "Condolências do(a) (nome da empresa, família ou amigos)." },
    { numero: 11, texto: "Condolências dos amigos (nome da empresa, nome da família)." },
    { numero: 12, texto: "Condolências dos colegas (nome da empresa)." },
    { numero: 13, texto: "Condolências dos funcionários da (nome da empresa)." },
    { numero: 14, texto: "Descanse à sombra do Altíssimo." },
    { numero: 15, texto: "Estaremos lembrando de ti sempre com muito amor." },
    { numero: 16, texto: "Eterna saudade de seus familiares e sentidos pêsames dos colegas e amigos." },
    { numero: 17, texto: "Homenagem da direção e funcionários da (nome da empresa)." },
    { numero: 18, texto: "Homenagem de seus amigos..." },
    { numero: 19, texto: "Homenagem do(a) (nome da empresa, nome da família, nome dos amigos)." },
    { numero: 20, texto: "Homenagem dos amigos e companheiros da (nome da empresa)." },
    { numero: 21, texto: "Homenagem dos colegas (nome do colega ou empresa)." },
    { numero: 22, texto: "Homenagem dos diretores e funcionários da (nome da empresa)." },
    { numero: 23, texto: "Homenagem dos diretores, funcionários e amigos da (nome da empresa)." },
    { numero: 24, texto: "Jesus, meu Rei, na Tua mão segurarei." },
    { numero: 25, texto: "Não deixei nenhum bem material, mas deixei o bem maior: o exemplo de vida." },
    { numero: 26, texto: "Ninguém morre enquanto permanecer vivo no coração de alguém." },
    { numero: 27, texto: "Nossa eterna gratidão e saudade de (nome dos parentes)." },
    { numero: 28, texto: "Nunca esqueceremos os seus exemplos..." },
    { numero: 29, texto: "O amor não conhece a barreira da separação, te amaremos sempre." },
    { numero: 30, texto: "O Senhor é a minha luz e a minha eterna salvação." },
    { numero: 31, texto: "O Senhor é meu pastor e nada me faltará." },
    { numero: 32, texto: "Pêsames do(a) (nome da empresa, nome da família, nome dos amigos)." },
    { numero: 33, texto: "Pêsames dos colegas da (nome da empresa)." },
    { numero: 34, texto: "Pêsames dos amigos da (nome da empresa, nome da família)." },
    { numero: 35, texto: "Que Deus o tenha..." },
    { numero: 36, texto: "Que Deus o(a) tenha em paz." },
    { numero: 37, texto: "Saudade de seu(sua) esposo(a), filhos(as), genros, noras e netos." },
    { numero: 38, texto: "Saudades de seus amigos (nome) e familiares." },
    { numero: 39, texto: "Saudades de seus familiares e amigos." },

    // As sugestões 40 a 49 não apareceram nas imagens enviadas.
    { numero: 50, texto: "Sentimentos da família." },
    { numero: 51, texto: "Sentimentos de..." },
    { numero: 52, texto: "Sentimentos do(a) (nome da empresa, nome da família, nome dos amigos)." },
    { numero: 53, texto: "Sentimentos dos amigos (nome da empresa, nome da família)." },
    { numero: 54, texto: "Sentimentos dos colegas (nome da empresa)." },
    { numero: 55, texto: "Sentiremos sua falta." },
    { numero: 56, texto: "Será eterno(a) em nossos corações." },
    { numero: 57, texto: "Sua passagem foi breve, sua obra eterna." },
    { numero: 58, texto: "Um anjo do Senhor me tocou e eu adormeci em paz..." },
    { numero: 59, texto: "Você é mais uma estrela a brilhar em paz..." },
    { numero: 60, texto: "Você foi um exemplo de vida..." },
];

function manualStatusLabel(status?: ManualStatus | string) {
    return MANUAL_STATUS_OPTIONS.find((x) => x.value === status)?.label || status || "—";
}

function manualStatusClass(status?: ManualStatus | string) {
    switch (status) {
        case "novo":
            return "bg-slate-100 text-slate-800 border-slate-200";
        case "coroa":
            return "bg-blue-100 text-blue-800 border-blue-200";
        case "faixa":
            return "bg-violet-100 text-violet-800 border-violet-200";
        case "finalizada":
            return "bg-emerald-100 text-emerald-900 border-emerald-200";
        case "entregue":
            return "bg-zinc-200 text-zinc-800 border-zinc-300";
        default:
            return "bg-muted text-foreground border-border";
    }
}

function origemLabel(v?: ManualOrigem | string) {
    const raw = String(v || "").trim();

    if (raw === "ordem_servico") return "Ordem de Serviço";
    if (raw === "venda_direta") return "Venda Direta";

    // Compatibilidade visual com pedidos antigos.
    if (
        raw === "venda_direta_colaborador" ||
        raw === "venda_direta_escritorio" ||
        raw === "venda_direta_memorial"
    ) {
        return "Venda Direta";
    }

    return raw || "—";
}

/**
 * Pedidos online são persistidos na mesma tabela `coroas` dos manuais.
 * `origem_externa_id` identifica o pedido correspondente no WooCommerce.
 */
function pedidoEhOnline(order?: ManualOrder | null): boolean {
    return Boolean(String(order?.origem_externa_id || "").trim());
}

function origemPedidoLabel(order?: ManualOrder | null): string {
    return pedidoEhOnline(order) ? "Pedido Online" : origemLabel(order?.origem);
}

function acaoManualLabel(target: Exclude<ManualStatus, "novo">) {
    if (target === "coroa") return "Confeccionando Coroa";
    if (target === "faixa") return "Confeccionando Faixa";
    if (target === "finalizada") return "Coroa Finalizada";
    return "Entregue";
}

function pedidoManualSomenteArtificial(order?: ManualOrder | null): boolean {
    if (!order) return false;

    const itens = Array.isArray(order.itens) ? order.itens : [];
    if (itens.length === 0) return false;

    return itens.every(
        (item) =>
            String(item?.tipo_coroa || "")
                .trim()
                .toLowerCase() === "artificial",
    );
}

function pedidoManualExigeConfeccaoCoroa(order?: ManualOrder | null): boolean {
    return !pedidoManualSomenteArtificial(order);
}

function acoesManualDoPedido(
    order: ManualOrder,
): ReadonlyArray<readonly [Exclude<ManualStatus, "novo">, string]> {
    const acoes: Array<readonly [Exclude<ManualStatus, "novo">, string]> = [];

    if (pedidoManualExigeConfeccaoCoroa(order)) {
        acoes.push(["coroa", "Confeccionando Coroa"]);
    }

    acoes.push(
        ["faixa", "Confeccionando Faixa"],
        ["finalizada", "Coroa Finalizada"],
        ["entregue", "Entregue"],
    );

    return acoes;
}

function acaoManualConcluida(order: ManualOrder, target: Exclude<ManualStatus, "novo">) {
    const finalizada =
        Boolean(order.finalizada_em) ||
        order.status === "finalizada" ||
        order.status === "entregue";

    const entregue =
        Boolean(order.entregue_em) ||
        order.status === "entregue";

    if (target === "coroa") {
        return (
            !pedidoManualExigeConfeccaoCoroa(order) ||
            Boolean(order.coroa_inicio_em) ||
            finalizada
        );
    }

    if (target === "faixa") return Boolean(order.faixa_inicio_em) || finalizada;
    if (target === "finalizada") return finalizada;
    return entregue;
}

function acaoManualLiberada(order: ManualOrder, target: Exclude<ManualStatus, "novo">) {
    const finalizada = acaoManualConcluida(order, "finalizada");
    const entregue = acaoManualConcluida(order, "entregue");
    const exigeCoroa = pedidoManualExigeConfeccaoCoroa(order);

    if (target === "coroa") {
        if (!exigeCoroa) return false;
        return !finalizada && !entregue && !acaoManualConcluida(order, "coroa");
    }

    if (target === "faixa") {
        return !finalizada && !entregue && !acaoManualConcluida(order, "faixa");
    }

    if (target === "finalizada") {
        const coroaOk = !exigeCoroa || acaoManualConcluida(order, "coroa");

        return (
            !finalizada &&
            !entregue &&
            coroaOk &&
            acaoManualConcluida(order, "faixa")
        );
    }

    return finalizada && !entregue;
}

function normalizeFuneralStatus(v?: string) {
    const raw = String(v || "").trim().toLowerCase();
    if (!raw) return "";
    if (raw.startsWith("fase")) {
        const n = raw.replace(/\D+/g, "");
        return n ? `fase${n.padStart(2, "0")}` : raw;
    }
    const key = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const map: Record<string, string> = {
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
        concluido: "fase11",
    };
    return map[key] || raw;
}

function isNao(v?: string) {
    const s = (v || "").toString().trim().toLowerCase();
    return s === "não" || s === "nao" || s === "n";
}

function isSim(v?: string) {
    return (v || "").toString().trim().toLowerCase() === "sim";
}

function isTerceiro(r: AtendimentoResumo) {
    if (String(r.tipo_atendimento || "").trim().toLowerCase() === "terceiro") {
        return true;
    }

    // Mesma heurística usada no quadro principal de Atendimentos.
    return isNao(r.assistencia) && isNao(r.tanato) && isNao(r.ornamentacao);
}

function atendimentoEstaNoQuadro(r: AtendimentoResumo) {
    const status = normalizeFuneralStatus(r.status);

    // Mesmas regras de visibilidade da TabelaAtendimentos:
    // - fase11 nunca aparece;
    // - terceiro sai na fase10;
    // - funerário sem Assistência=Sim sai na fase10;
    // - funerário com Assistência=Sim permanece na fase10 e sai só na fase11.
    if (status === "fase11") return false;

    if (isTerceiro(r)) {
        return status !== "fase10";
    }

    if (!isSim(r.assistencia)) {
        return status !== "fase10";
    }

    return true;
}

function normalizarTextoEstoque(v?: string | null) {
    return String(v || "")
        .trim()
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}

function categoriaEhCoroaNatural(nome?: string | null) {
    return normalizarTextoEstoque(nome) === "coroas naturais";
}

function categoriaEhCoroaArtificial(nome?: string | null) {
    return normalizarTextoEstoque(nome) === "coroas artificiais";
}

function dinheiroBRL(v?: string | number | null) {
    const n = Number(v ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(safe);
}

function normalizarFotoProduto(url?: string | null) {
    const raw = String(url || "").trim();
    if (!raw || raw === "null" || raw === "undefined") return null;
    if (/^data:image\//i.test(raw) || /^blob:/i.test(raw) || /^https?:\/\//i.test(raw)) {
        return raw;
    }

    const clean = raw.startsWith("/") ? raw : `/${raw}`;
    if (clean.startsWith("/uploads/")) {
        return `${API_PUBLIC_BASE}${clean}`;
    }

    return `${API_PUBLIC_BASE}/uploads/produtos/${raw.replace(/^\/+/, "")}`;
}

function fotoPrincipalProduto(produto?: EstoqueProduto | null) {
    if (!produto) return null;

    const fotos = Array.isArray(produto.fotos) ? [...produto.fotos] : [];
    if (fotos.length) {
        fotos.sort((a, b) => {
            const principalA = Number(a.is_principal || 0) === 1 ? 0 : 1;
            const principalB = Number(b.is_principal || 0) === 1 ? 0 : 1;
            if (principalA !== principalB) return principalA - principalB;
            return Number(a.ordem || 0) - Number(b.ordem || 0);
        });

        const primeira = fotos[0];
        return normalizarFotoProduto(primeira?.foto_url || primeira?.arquivo || null);
    }

    return normalizarFotoProduto(produto.foto_url || null);
}

function rotuloTipoCoroa(tipo: CoroaTipo) {
    if (tipo === "natural") return "Natural";
    if (tipo === "artificial") return "Artificial";
    return "";
}

function quantidadeManual(order?: ManualOrder | null) {
    if (!order) return 0;
    const q = Number(order.quantidade_coroas || 0);
    if (q > 0) return q;
    if (Array.isArray(order.itens) && order.itens.length) return order.itens.length;
    return 1;
}

function resumoModelosManual(order: ManualOrder) {
    const itens = Array.isArray(order.itens) ? order.itens.filter((x) => String(x?.modelo_coroa || "").trim()) : [];
    if (!itens.length) return order.modelo_coroa || "—";

    const nomes = itens.map((x) => x.modelo_coroa);
    if (nomes.length === 1) return nomes[0];
    return `${nomes[0]} +${nomes.length - 1}`;
}

function itensManual(order?: ManualOrder | null): ManualCoroaItem[] {
    if (!order) return [];
    if (Array.isArray(order.itens) && order.itens.length) return order.itens;

    return [{
        ordem: 1,
        modelo_coroa: order.modelo_coroa || "",
        frase: order.frase || "",
    }];
}

function totalManual(order?: ManualOrder | null) {
    return itensManual(order).reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
}

function pedidoModelosManual(order?: ManualOrder | null) {
    const nomes = itensManual(order)
        .map((item) => String(item.modelo_coroa || "").trim())
        .filter(Boolean);
    return nomes.length ? nomes.join(", ") : "—";
}

function pedidoFrasesManual(order?: ManualOrder | null) {
    const itens = itensManual(order);
    if (!itens.length) return "—";
    if (itens.length === 1) return itens[0]?.frase || "—";

    return itens
        .map((item, index) => `${item.ordem || index + 1}) ${item.frase || "—"}`)
        .join(" | ");
}

function pagamentoAutomaticoManual(order?: ManualOrder | null) {
    if (pedidoEhOnline(order) && order?.status_pagamento === "pago") return "Pago";
    return order?.comprovante_url ? "Pago" : "Aguardando Comprovante";
}

function pagamentoAutomaticoClass(order?: ManualOrder | null) {
    const pago = Boolean(order?.comprovante_url) ||
        (pedidoEhOnline(order) && order?.status_pagamento === "pago");

    return pago
        ? "bg-emerald-100 text-emerald-900 border-emerald-200"
        : "bg-amber-100 text-amber-900 border-amber-200";
}

function manualMatchesQuery(order: ManualOrder, query: string) {
    const q = normalizarTextoEstoque(query);
    if (!q) return true;

    const haystack = [
        order.id,
        order.solicitante,
        order.telefone,
        order.local_entrega,
        order.observacoes,
        order.falecido,
        order.origem_externa_id,
        origemPedidoLabel(order),
        ...itensManual(order).flatMap((item) => [item.modelo_coroa, item.frase]),
    ]
        .map((v) => normalizarTextoEstoque(String(v ?? "")))
        .join(" ");

    return haystack.includes(q);
}

function manualDateInRange(order: ManualOrder, after: string, before: string) {
    if (!after && !before) return true;
    const raw = String(order.criado_em || "").trim();
    if (!raw) return false;

    const dt = new Date(raw.replace(" ", "T"));
    if (Number.isNaN(dt.getTime())) return false;

    if (after) {
        const inicio = new Date(`${after}T00:00:00`);
        if (dt < inicio) return false;
    }

    if (before) {
        const fim = new Date(`${before}T23:59:59.999`);
        if (dt > fim) return false;
    }

    return true;
}

function buildManualPedidoText(order: ManualOrder) {
    const NL = "\r\n";
    const ZWSP = "\u200B";
    const total = totalManual(order);

    // Mesma ordem/estrutura usada no pedido online.
    const rawLines = [
        `*Pedido:* ${pedidoModelosManual(order)}`,
        `*Origem:* ${origemPedidoLabel(order)}`,
        `*Cliente:* ${order.solicitante || "—"}`,
        `*Telefone:* ${onlyDigits(order.telefone) || order.telefone || "—"}`,
        `*Valor:* ${total > 0 ? dinheiroBRL(total) : "—"}`,
        `*Local de Entrega:* ${order.local_entrega || "—"}`,
        `*Observações:* ${order.observacoes || "—"}`,
        `*Falecido(a):* ${order.falecido || "—"}`,
        `*Frase da Coroa:* ${pedidoFrasesManual(order)}`,
        `*Comprovante de pagamento:*`,
    ];

    const out: string[] = [];
    rawLines.forEach((line, index) => {
        out.push(line.trimStart());
        if (index < rawLines.length - 1) out.push(ZWSP);
    });

    return out.join(NL);
}

function comprovanteEhPdf(order?: ManualOrder | null) {
    const mime = String(order?.comprovante_mime || "").toLowerCase();
    const url = String(order?.comprovante_url || "").toLowerCase();
    return mime === "application/pdf" || /\.pdf(?:$|\?)/i.test(url);
}

const FOTO_COROA_MAX_BYTES = 12 * 1024 * 1024;
const COMPROVANTE_MAX_BYTES = 15 * 1024 * 1024;
const CAMERA_MAX_WIDTH = 960;
const CAMERA_MAX_HEIGHT = 720;
const CAMERA_TARGET_BYTES = 300 * 1024;

function validarFotoCoroaFile(file: File) {
    if (!String(file.type || "").toLowerCase().startsWith("image/")) {
        throw new Error("Selecione uma imagem válida.");
    }
    if (file.size > FOTO_COROA_MAX_BYTES) {
        throw new Error("A imagem deve ter no máximo 12 MB.");
    }
}

function validarComprovanteFile(file: File) {
    const mime = String(file.type || "").toLowerCase();
    const nome = String(file.name || "").toLowerCase();
    const permitido =
        mime === "application/pdf" ||
        mime.startsWith("image/") ||
        nome.endsWith(".pdf") ||
        nome.endsWith(".jpg") ||
        nome.endsWith(".jpeg") ||
        nome.endsWith(".png") ||
        nome.endsWith(".webp");

    if (!permitido) {
        throw new Error("O comprovante deve ser uma imagem ou arquivo PDF.");
    }
    if (file.size > COMPROVANTE_MAX_BYTES) {
        throw new Error("O comprovante deve ter no máximo 15 MB.");
    }
}

function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Não foi possível gerar a foto."));
        }, "image/jpeg", quality);
    });
}

async function criarFotoLeveDoVideo(video: HTMLVideoElement): Promise<File> {
    const sourceW = Math.max(1, Number(video.videoWidth || 0));
    const sourceH = Math.max(1, Number(video.videoHeight || 0));
    if (!sourceW || !sourceH) throw new Error("A câmera ainda não está pronta.");

    const scale = Math.min(1, CAMERA_MAX_WIDTH / sourceW, CAMERA_MAX_HEIGHT / sourceH);
    const width = Math.max(1, Math.round(sourceW * scale));
    const height = Math.max(1, Math.round(sourceH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Não foi possível preparar a captura.");

    ctx.drawImage(video, 0, 0, width, height);

    let quality = 0.62;
    let blob = await canvasToBlob(canvas, quality);
    for (let i = 0; i < 4 && blob.size > CAMERA_TARGET_BYTES; i++) {
        quality = Math.max(0.38, quality - 0.07);
        blob = await canvasToBlob(canvas, quality);
    }

    canvas.width = 1;
    canvas.height = 1;

    return new File([blob], `foto_${Date.now()}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
    });
}

function CameraCaptureDialog({
    open,
    onClose,
    onFile,
}: {
    open: boolean;
    onClose: () => void;
    onFile: (file: File) => Promise<void> | void;
}) {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const streamRef = React.useRef<MediaStream | null>(null);
    const fallbackRef = React.useRef<HTMLInputElement>(null);
    const [starting, setStarting] = React.useState(false);
    const [capturing, setCapturing] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const stopCamera = React.useCallback(() => {
        const stream = streamRef.current;
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    React.useEffect(() => {
        if (!open) {
            stopCamera();
            return;
        }

        let cancelled = false;
        setError(null);
        setStarting(true);

        (async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error("Câmera direta indisponível neste navegador.");
                }

                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        facingMode: { ideal: "environment" },
                        width: { ideal: CAMERA_MAX_WIDTH, max: 1280 },
                        height: { ideal: CAMERA_MAX_HEIGHT, max: 960 },
                    },
                });

                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => undefined);
                }
            } catch (e: any) {
                setError(e?.message || "Não foi possível abrir a câmera.");
            } finally {
                if (!cancelled) setStarting(false);
            }
        })();

        return () => {
            cancelled = true;
            stopCamera();
        };
    }, [open, stopCamera]);

    if (!open) return null;

    async function capture() {
        if (capturing || !videoRef.current) return;
        try {
            setCapturing(true);
            setError(null);
            const file = await criarFotoLeveDoVideo(videoRef.current);
            await onFile(file);
            stopCamera();
            onClose();
        } catch (e: any) {
            setError(e?.message || "Não foi possível capturar a foto.");
        } finally {
            setCapturing(false);
        }
    }

    async function handleFallback(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.currentTarget.value = "";
        if (!file) return;
        try {
            await onFile(file);
            stopCamera();
            onClose();
        } catch (err: any) {
            setError(err?.message || "Não foi possível usar a foto.");
        }
    }

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3">
            <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-950">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div className="font-semibold">Tirar foto</div>
                    <button
                        type="button"
                        className="rounded-md border px-3 py-1.5 text-sm"
                        disabled={capturing}
                        onClick={() => {
                            stopCamera();
                            onClose();
                        }}
                    >
                        Fechar
                    </button>
                </div>

                <div className="p-3">
                    <div className="overflow-hidden rounded-lg bg-black">
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            className="aspect-[4/3] w-full object-cover"
                        />
                    </div>

                    {starting && <div className="mt-3 text-sm text-muted-foreground">Abrindo câmera...</div>}
                    {error && (
                        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                            {error}
                        </div>
                    )}

                    <input
                        ref={fallbackRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleFallback}
                    />

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            className="rounded-md border px-4 py-2 text-sm"
                            disabled={capturing}
                            onClick={() => fallbackRef.current?.click()}
                        >
                            Câmera do aparelho
                        </button>
                        <button
                            type="button"
                            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                            disabled={capturing || starting || Boolean(error)}
                            onClick={capture}
                        >
                            {capturing ? "Capturando..." : "Capturar foto"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ImageUploadButtons({
    disabled,
    onFile,
}: {
    disabled?: boolean;
    onFile: (file: File) => Promise<void> | void;
}) {
    const galleryRef = React.useRef<HTMLInputElement>(null);
    const [cameraOpen, setCameraOpen] = React.useState(false);

    const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.currentTarget.value = "";
        if (!file) return;
        await onFile(file);
    };

    return (
        <>
            <div className="flex flex-wrap gap-2">
                <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handle} />
                <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    disabled={disabled}
                    onClick={() => galleryRef.current?.click()}
                >
                    <IconUpload className="size-4" />
                    Galeria
                </button>
                <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    disabled={disabled}
                    onClick={() => setCameraOpen(true)}
                >
                    <IconCamera className="size-4" />
                    Tirar foto
                </button>
            </div>
            <CameraCaptureDialog open={cameraOpen} onClose={() => setCameraOpen(false)} onFile={onFile} />
        </>
    );
}


function ComprovanteUploadButtons({
    disabled,
    onFile,
}: {
    disabled?: boolean;
    onFile: (file: File) => Promise<void> | void;
}) {
    const arquivoRef = React.useRef<HTMLInputElement>(null);
    const [cameraOpen, setCameraOpen] = React.useState(false);

    const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.currentTarget.value = "";
        if (!file) return;
        await onFile(file);
    };

    return (
        <>
            <div className="flex flex-wrap gap-2">
                <input
                    ref={arquivoRef}
                    type="file"
                    accept="image/*,application/pdf,.pdf"
                    className="hidden"
                    onChange={handle}
                />

                <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    disabled={disabled}
                    onClick={() => arquivoRef.current?.click()}
                >
                    <IconUpload className="size-4" />
                    Imagem / PDF
                </button>

                <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    disabled={disabled}
                    onClick={() => setCameraOpen(true)}
                >
                    <IconCamera className="size-4" />
                    Tirar foto
                </button>
            </div>
            <CameraCaptureDialog open={cameraOpen} onClose={() => setCameraOpen(false)} onFile={onFile} />
        </>
    );
}

/* =========================================================
   PEDIDOS ONLINE / WOOCOMMERCE — comportamento existente
   ========================================================= */
type WcOrder = {
    id: number;
    status:
    | "pending"
    | "processing"
    | "on-hold"
    | "completed"
    | "cancelled"
    | "refunded"
    | "failed";
    date_created: string;
    number: string;
    currency: string;
    total: string;
    customer_note?: string;
    billing?: {
        first_name?: string;
        last_name?: string;
        email?: string;
        phone?: string;
    };
    shipping?: {
        first_name?: string;
        last_name?: string;
        address_1?: string;
        address_2?: string;
        city?: string;
        state?: string;
        postcode?: string;
    };
};

type Meta = { key: string; value: any };

type WcOrderFull = WcOrder & {
    meta_data?: Meta[];
    line_items?: Array<{
        id: number;
        name: string;
        quantity: number;
        total: string;
        product_id?: number;
        variation_id?: number;
        sku?: string;
        meta_data?: Meta[];
        image?: { id: number | string; src: string };
    }>;
    shipping_lines?: Array<{ id: number; method_title: string; total: string }>;
};

type OrdersResponse = {
    data: WcOrder[];
    meta: { page: number; per_page: number; total: number; totalPages: number };
};

const WC_STATUS_OPTIONS: Array<{ value: WcOrder["status"] | "all"; label: string }> = [
    { value: "all", label: "Todos" },
    { value: "pending", label: "Pendente" },
    { value: "processing", label: "Processando" },
    { value: "on-hold", label: "Em espera" },
    { value: "completed", label: "Concluído" },
    { value: "cancelled", label: "Cancelado" },
    { value: "refunded", label: "Reembolsado" },
    { value: "failed", label: "Falhou" },
];

function formatCurrency(v: string | number, currency = "BRL") {
    const num = typeof v === "string" ? Number(v) : v;
    if (Number.isNaN(num)) return String(v);
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(num);
}

function formatDate(iso?: string | null) {
    if (!iso) return "—";
    try {
        const dt = new Date(iso.replace(" ", "T"));
        if (Number.isNaN(dt.getTime())) return iso;
        return dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
        return iso;
    }
}

function clsWcStatusBadge(s: WcOrder["status"]) {
    switch (s) {
        case "pending":
            return "bg-amber-100 text-amber-800 border-amber-200";
        case "processing":
            return "bg-blue-100 text-blue-800 border-blue-200";
        case "on-hold":
            return "bg-slate-100 text-slate-800 border-slate-200";
        case "completed":
            return "bg-emerald-100 text-emerald-900 border-emerald-200";
        case "cancelled":
            return "bg-rose-100 text-rose-800 border-rose-200";
        case "refunded":
            return "bg-purple-100 text-purple-900 border-purple-200";
        case "failed":
            return "bg-gray-200 text-gray-700 border-gray-300";
        default:
            return "bg-muted text-foreground border-border";
    }
}

function onlyDigits(s?: string | null) {
    return (s || "").replace(/\D+/g, "");
}

function findMetaValue(metas: Meta[] | undefined, keys: string[]): string | undefined {
    if (!metas?.length) return undefined;
    const lower = keys.map((k) => k.toLowerCase());
    for (const m of metas) {
        const k = String(m.key || "").toLowerCase();
        if (lower.some((kk) => k.includes(kk))) {
            const v = typeof m.value === "string" ? m.value : JSON.stringify(m.value);
            if (v?.trim()) return v;
        }
    }
    return undefined;
}

function buildWhatsAppText(order: WcOrderFull) {
    const NL = "\r\n";
    const ZWSP = "\u200B";
    const itens = (order.line_items || []).map((i) => i.name).filter(Boolean);
    const pedidoNome = itens.join(", ");
    const cliente = `${order.billing?.first_name || ""} ${order.billing?.last_name || ""}`.trim();
    const phone = onlyDigits(order.billing?.phone);
    const valor = formatCurrency(order.total, order.currency || "BRL");
    const localEntrega = [order.shipping?.address_1, order.shipping?.address_2].filter(Boolean).join(" - ");
    const falecido =
        findMetaValue(order.meta_data, [
            "shipping_falecido_nome",
            "falecido_nome",
            "nome_falecido",
            "nome_do_falecido",
        ]) || order.shipping?.first_name || "";
    const frase =
        findMetaValue(order.meta_data, ["frase_para_a_faixa", "frase da coroa", "frase da faixa", "faixa", "mensagem"]) ||
        findMetaValue(order.line_items?.flatMap((li) => li.meta_data || []), [
            "frase_para_a_faixa",
            "frase da coroa",
            "frase da faixa",
            "faixa",
            "mensagem",
        ]) ||
        "";

    const rawLines = [
        `*Pedido:* ${pedidoNome || `#${order.number || order.id}`}`,
        `*Origem:* Loja On-line`,
        `*Cliente:* ${cliente || "—"}`,
        `*Telefone:* ${phone || "—"}`,
        `*Valor:* ${valor}`,
        `*Local de Entrega:* ${localEntrega || "—"}`,
        `*Falecido(a):* ${falecido || "—"}`,
        `*Frase da Coroa:* ${frase || "—"}`,
        `*Comprovante de pagamento:*`,
    ];

    const out: string[] = [];
    rawLines.forEach((l, i) => {
        out.push(l.trimStart());
        if (i < rawLines.length - 1) out.push(ZWSP);
    });
    return out.join(NL);
}

async function shareOrOpenWhatsApp(text: string, toPhone?: string) {
    const phone = onlyDigits(toPhone);
    if (typeof navigator !== "undefined" && (navigator as any).share) {
        try {
            await (navigator as any).share({ text });
            return;
        } catch {
            // segue para fallback
        }
    }

    const encoded = encodeURIComponent(text);
    const isMobile = /Android|iPhone|iPad|iPod|Windows Phone/i.test(
        (typeof navigator !== "undefined" && navigator.userAgent) || "",
    );
    const deep = phone && isMobile
        ? `whatsapp://send?phone=${phone}&text=${encoded}`
        : `whatsapp://send?text=${encoded}`;
    const opened = window.open(deep, "_blank");
    if (opened) return;

    const webUrl = phone
        ? `https://wa.me/${phone}?text=${encoded}`
        : `https://web.whatsapp.com/send?text=${encoded}`;
    const openedWeb = window.open(webUrl, "_blank", "noopener,noreferrer");
    if (openedWeb) return;

    try {
        await navigator.clipboard.writeText(text);
    } catch {
        // ignore
    }
    window.open(phone ? `https://wa.me/${phone}` : "https://web.whatsapp.com/", "_blank");
}

async function convertToJpegWithWhiteBg(blob: Blob): Promise<Blob> {
    const imgUrl = URL.createObjectURL(blob);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = imgUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.width || 1024;
        canvas.height = img.height || 1024;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return await new Promise<Blob>((resolve) =>
            canvas.toBlob((b) => resolve(b as Blob), "image/jpeg", 0.92),
        );
    } finally {
        URL.revokeObjectURL(imgUrl);
    }
}

async function shareImageUrl(imageUrl: string) {
    if (!imageUrl) return;
    try {
        const resp = await fetch(imageUrl, { mode: "cors", cache: "no-store" });
        if (resp.ok) {
            let blob = await resp.blob();
            if (blob.type === "image/png") {
                try {
                    blob = await convertToJpegWithWhiteBg(blob);
                } catch {
                    // mantém original
                }
            }
            const file = new File([blob], `produto.${blob.type.includes("jpeg") ? "jpg" : "png"}`, {
                type: blob.type || "image/jpeg",
            });
            const navAny = navigator as any;
            if (navAny.canShare?.({ files: [file] }) && navAny.share) {
                await navAny.share({ files: [file] });
                return;
            }
        }
    } catch {
        // fallback abaixo
    }

    try {
        const navAny = navigator as any;
        if (navAny.share) {
            await navAny.share({ url: imageUrl });
            return;
        }
    } catch {
        // fallback abaixo
    }
    window.open(imageUrl, "_blank", "noopener,noreferrer");
}

/* =========================================================
   PÁGINA
   ========================================================= */
export default function Page() {
    const [tab, setTab] = React.useState<"confeccao" | "manuais" | "online">("confeccao");
    const [isDesktop, setIsDesktop] = React.useState(false);
    const [usuarioAtual, setUsuarioAtual] = React.useState("");

    React.useEffect(() => {
        let ativo = true;
        const controller = new AbortController();

        async function carregarUsuarioAtual() {
            try {
                const res = await fetch(USUARIO_ATUAL_API, {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store",
                    headers: { Accept: "application/json" },
                    signal: controller.signal,
                });

                const json: UsuarioAtualResponse = await res.json().catch(() => ({}));

                if (!ativo || !res.ok || json?.erro) return;

                const nome = String(json?.usuario || json?.nome || "")
                    .replace(/\s+/g, " ")
                    .trim();

                if (nome) setUsuarioAtual(nome);
            } catch (e: any) {
                if (e?.name === "AbortError") return;
            }
        }

        void carregarUsuarioAtual();

        return () => {
            ativo = false;
            controller.abort();
        };
    }, []);

    React.useEffect(() => {
        const media = window.matchMedia("(min-width: 768px)");
        const atualizar = () => setIsDesktop(media.matches);

        atualizar();
        media.addEventListener?.("change", atualizar);

        return () => media.removeEventListener?.("change", atualizar);
    }, []);

    /* -------------------------
       Falecidos no quadro
       ------------------------- */
    const [falecidosQuadro, setFalecidosQuadro] = React.useState<AtendimentoResumo[]>([]);
    const [falecidosLoading, setFalecidosLoading] = React.useState(false);
    const [falecidosError, setFalecidosError] = React.useState<string | null>(null);
    const falecidosLoadedAtRef = React.useRef(0);
    const falecidosAbortRef = React.useRef<AbortController | null>(null);

    const carregarFalecidosQuadro = React.useCallback(async (force = false) => {
        const agora = Date.now();

        // Não mantém mais polling em segundo plano. Ao abrir NOVO,
        // reaproveita por 30s o resultado já carregado.
        if (
            !force &&
            falecidosQuadro.length > 0 &&
            agora - falecidosLoadedAtRef.current < 30_000
        ) {
            return;
        }

        falecidosAbortRef.current?.abort();
        const controller = new AbortController();
        falecidosAbortRef.current = controller;

        setFalecidosLoading(true);
        setFalecidosError(null);

        try {
            const res = await fetch(ATENDIMENTOS_API, {
                credentials: "include",
                headers: { Accept: "application/json" },
                signal: controller.signal,
            });

            if (!res.ok) {
                throw new Error(`Não foi possível consultar o quadro de atendimentos (${res.status}).`);
            }

            const json = await res.json();
            const rows = Array.isArray(json) ? (json as AtendimentoResumo[]) : [];

            const ativos = rows
                .filter(atendimentoEstaNoQuadro)
                .filter((r) => String(r.falecido || "").trim() !== "");

            const unicos = Array.from(
                new Map(
                    ativos.map((r) => [
                        String(r.falecido || "").trim().toLocaleLowerCase("pt-BR"),
                        r,
                    ]),
                ).values(),
            ).sort((a, b) =>
                String(a.falecido || "").localeCompare(String(b.falecido || ""), "pt-BR"),
            );

            setFalecidosQuadro(unicos);
            falecidosLoadedAtRef.current = Date.now();
        } catch (e: any) {
            if (e?.name === "AbortError") return;
            setFalecidosError(e?.message || "Erro ao consultar os falecidos do quadro.");
        } finally {
            if (falecidosAbortRef.current === controller) {
                falecidosAbortRef.current = null;
                setFalecidosLoading(false);
            }
        }
    }, [falecidosQuadro.length]);

    React.useEffect(() => {
        return () => falecidosAbortRef.current?.abort();
    }, []);

    /* -------------------------
       Modelos de Coroa no estoque
       ------------------------- */
    const [modeloTipo, setModeloTipo] = React.useState<CoroaTipo>("");
    const [modeloModalOpen, setModeloModalOpen] = React.useState(false);
    const [modeloLoading, setModeloLoading] = React.useState(false);
    const [modeloError, setModeloError] = React.useState<string | null>(null);
    const [modeloBusca, setModeloBusca] = React.useState("");
    const [estoqueProdutos, setEstoqueProdutos] = React.useState<EstoqueProduto[]>([]);
    const [estoqueSaldos, setEstoqueSaldos] = React.useState<EstoqueSaldo[]>([]);
    const [estoqueDepositos, setEstoqueDepositos] = React.useState<EstoqueDeposito[]>([]);
    const [modeloItemIndex, setModeloItemIndex] = React.useState<number | null>(null);
    const [modeloDeposito, setModeloDeposito] = React.useState<CoroaDeposito>("");
    const estoqueLoadedAtRef = React.useRef(0);
    const estoqueAbortRef = React.useRef<AbortController | null>(null);

    const depositoIdPorNome = React.useMemo(() => {
        const map = new Map<string, number>();
        for (const dep of estoqueDepositos) {
            const nome = normalizarTextoEstoque(dep?.nome).toUpperCase();
            if (nome) map.set(nome, Number(dep?.id || 0));
        }
        return map;
    }, [estoqueDepositos]);

    const saldoPorProdutoDeposito = React.useMemo(() => {
        const map = new Map<string, number>();
        for (const saldo of estoqueSaldos) {
            const pid = Number(saldo?.produto_id || 0);
            const did = Number(saldo?.deposito_id || 0);
            if (pid <= 0 || did <= 0) continue;
            map.set(`${pid}|${did}`, Math.max(0, Number(saldo?.quantidade || 0)));
        }
        return map;
    }, [estoqueSaldos]);

    const saldoModeloSelecionado = React.useCallback((produtoId: number) => {
        if (modeloTipo !== "artificial" || !modeloDeposito) return 0;
        const did = depositoIdPorNome.get(modeloDeposito) || 0;
        return did > 0 ? (saldoPorProdutoDeposito.get(`${produtoId}|${did}`) || 0) : 0;
    }, [modeloTipo, modeloDeposito, depositoIdPorNome, saldoPorProdutoDeposito]);

    const modelosDisponiveis = React.useMemo(() => {
        const busca = normalizarTextoEstoque(modeloBusca);
        return estoqueProdutos
            .filter((produto) => Number(produto?.ativo ?? 1) === 1)
            .filter((produto) => {
                if (modeloTipo === "natural") return categoriaEhCoroaNatural(produto.categoria_nome);
                if (modeloTipo === "artificial") {
                    if (modeloDeposito !== "MEMORIAL" && modeloDeposito !== "FUNERARIA") return false;
                    const did = depositoIdPorNome.get(modeloDeposito) || 0;
                    const saldo = did > 0 ? (saldoPorProdutoDeposito.get(`${Number(produto.id)}|${did}`) || 0) : 0;
                    return categoriaEhCoroaArtificial(produto.categoria_nome) && saldo > 0;
                }
                return false;
            })
            .filter((produto) => {
                if (!busca) return true;
                return normalizarTextoEstoque(produto.nome).includes(busca) || normalizarTextoEstoque(produto.codigo_barras).includes(busca);
            })
            .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
    }, [estoqueProdutos, modeloTipo, modeloDeposito, depositoIdPorNome, saldoPorProdutoDeposito, modeloBusca]);

    const carregarModelosCoroa = React.useCallback(async (force = false) => {
        const agora = Date.now();

        // O mesmo estoque serve para todas as coroas do formulário.
        // Evita baixar novamente a lista a cada Coroa 1, Coroa 2, etc.
        if (
            !force &&
            estoqueProdutos.length > 0 &&
            agora - estoqueLoadedAtRef.current < 60_000
        ) {
            return;
        }

        estoqueAbortRef.current?.abort();
        const controller = new AbortController();
        estoqueAbortRef.current = controller;

        setModeloLoading(true);
        setModeloError(null);

        try {
            const url = new URL(MATERIAIS_API, window.location.origin);
            url.searchParams.set("init", "1");

            const res = await fetch(url.toString(), {
                method: "GET",
                credentials: "include",
                headers: { Accept: "application/json" },
                signal: controller.signal,
            });

            const json: MateriaisInitResponse = await res.json().catch(() => ({}));

            if (res.status === 401 || json?.need_login) {
                throw new Error("Login necessário para consultar o estoque.");
            }

            if (!res.ok || !json?.ok) {
                throw new Error(json?.msg || `Não foi possível consultar o estoque (${res.status}).`);
            }

            setEstoqueProdutos(Array.isArray(json.produtos) ? json.produtos : []);
            setEstoqueSaldos(Array.isArray(json.saldos) ? json.saldos : []);
            setEstoqueDepositos(Array.isArray(json.depositos) ? json.depositos : []);
            estoqueLoadedAtRef.current = Date.now();
        } catch (e: any) {
            if (e?.name === "AbortError") return;
            setModeloError(e?.message || "Erro ao carregar os modelos de coroas.");
        } finally {
            if (estoqueAbortRef.current === controller) {
                estoqueAbortRef.current = null;
                setModeloLoading(false);
            }
        }
    }, [estoqueProdutos.length]);

    React.useEffect(() => {
        return () => estoqueAbortRef.current?.abort();
    }, []);

    function abrirSeletorModelo(itemIndex: number, tipo: CoroaTipo, deposito: CoroaDeposito = "") {
        if (!tipo) return;
        if (tipo === "artificial" && deposito !== "MEMORIAL" && deposito !== "FUNERARIA") {
            setModeloError("Selecione primeiro o depósito MEMORIAL ou FUNERÁRIA.");
            return;
        }
        setModeloItemIndex(itemIndex);
        setModeloTipo(tipo);
        setModeloDeposito(tipo === "artificial" ? deposito : "");
        setModeloBusca("");
        setModeloError(null);
        setModeloModalOpen(true);
        void carregarModelosCoroa();
    }

    function selecionarModeloCoroa(produto: EstoqueProduto) {
        if (modeloItemIndex == null) return;

        setNewItems((atuais) =>
            atuais.map((item, index) =>
                index === modeloItemIndex
                    ? {
                        ...item,
                        tipo_coroa: modeloTipo,
                        produto,
                    }
                    : item,
            ),
        );

        setModeloModalOpen(false);
        setModeloBusca("");
        setModeloItemIndex(null);
    }

    /* -------------------------
       Manual: dados / Confecção / Histórico
       ------------------------- */

    // Confecção: novo, coroa, faixa e finalizada. O pedido só sai após 'entregue'.
    const [confeccaoOrders, setConfeccaoOrders] = React.useState<ManualOrder[]>([]);
    const [confeccaoLoading, setConfeccaoLoading] = React.useState(false);
    const [confeccaoError, setConfeccaoError] = React.useState<string | null>(null);
    const [confeccaoQ, setConfeccaoQ] = React.useState("");
    const [confeccaoStatusFilter, setConfeccaoStatusFilter] = React.useState<"todos" | "novo" | "coroa" | "faixa" | "finalizada">("todos");
    const [confeccaoAppliedQ, setConfeccaoAppliedQ] = React.useState("");
    const [confeccaoAppliedStatus, setConfeccaoAppliedStatus] = React.useState<"todos" | "novo" | "coroa" | "faixa" | "finalizada">("todos");
    const [confeccaoRefreshToken, setConfeccaoRefreshToken] = React.useState(0);
    const [confeccaoPage, setConfeccaoPage] = React.useState(1);
    const confeccaoPerPage = 30;
    const [confeccaoTotal, setConfeccaoTotal] = React.useState(0);
    const [confeccaoTotalPages, setConfeccaoTotalPages] = React.useState(1);

    // Pedidos Manuais: histórico somente após confirmação de entrega.
    const [manualHistoricoOrders, setManualHistoricoOrders] = React.useState<ManualOrder[]>([]);
    const [manualLoading, setManualLoading] = React.useState(false);
    const [manualError, setManualError] = React.useState<string | null>(null);
    const [manualQ, setManualQ] = React.useState("");
    const [manualStatusFilter, setManualStatusFilter] = React.useState<"todos" | "entregue">("todos");
    const [manualAfter, setManualAfter] = React.useState("");
    const [manualBefore, setManualBefore] = React.useState("");
    const [manualAppliedQ, setManualAppliedQ] = React.useState("");
    const [manualAppliedStatus, setManualAppliedStatus] = React.useState<"todos" | "entregue">("todos");
    const [manualAppliedAfter, setManualAppliedAfter] = React.useState("");
    const [manualAppliedBefore, setManualAppliedBefore] = React.useState("");
    const [manualRefreshToken, setManualRefreshToken] = React.useState(0);
    const [manualPage, setManualPage] = React.useState(1);
    const [manualPerPage, setManualPerPage] = React.useState(20);
    const [manualTotal, setManualTotal] = React.useState(0);
    const [manualTotalPages, setManualTotalPages] = React.useState(1);
    const confeccaoAbortRef = React.useRef<AbortController | null>(null);
    const historicoAbortRef = React.useRef<AbortController | null>(null);
    const onlineSyncLoadedAtRef = React.useRef(0);
    const onlineSyncPromiseRef = React.useRef<Promise<void> | null>(null);

    const sincronizarPedidosOnlineConfeccao = React.useCallback(async (force = false) => {
        const agora = Date.now();

        // Evita consultar o WooCommerce várias vezes por causa de filtros/paginação.
        // O botão Atualizar força uma nova reconciliação imediatamente.
        if (!force && agora - onlineSyncLoadedAtRef.current < 15_000) return;

        if (onlineSyncPromiseRef.current) {
            await onlineSyncPromiseRef.current;
            return;
        }

        const tarefa = (async () => {
            try {
                const res = await fetch(`/api/wc/orders?sync_confeccao=1&_ts=${Date.now()}`, {
                    method: "GET",
                    cache: "no-store",
                    headers: { Accept: "application/json" },
                });

                const json = await res.json().catch(() => null);

                if (!res.ok) {
                    throw new Error(
                        json?.message ||
                        json?.error ||
                        `Falha ao sincronizar pedidos online com a Confecção (${res.status}).`,
                    );
                }

                if (Array.isArray(json?.erros) && json.erros.length > 0) {
                    console.warn("Alguns pedidos online novos não foram sincronizados com a Confecção:", json.erros);
                }

                onlineSyncLoadedAtRef.current = Date.now();
            } catch (error) {
                // A lista de Confecção continua sendo carregada mesmo se a reconciliação
                // com o WooCommerce falhar. O próximo refresh tenta novamente.
                console.error("Falha na reconciliação WooCommerce → Confecção:", error);
            } finally {
                onlineSyncPromiseRef.current = null;
            }
        })();

        onlineSyncPromiseRef.current = tarefa;
        await tarefa;
    }, []);

    const fetchConfeccaoOrders = React.useCallback(async (forceFresh = false) => {
        confeccaoAbortRef.current?.abort();
        const controller = new AbortController();
        confeccaoAbortRef.current = controller;

        setConfeccaoLoading(true);
        setConfeccaoError(null);

        try {
            // Reconciliação de segurança. O backend aplica um marco de corte,
            // portanto somente pedidos online criados a partir da ativação desta
            // versão podem entrar na fila de Confecção.
            await sincronizarPedidosOnlineConfeccao(forceFresh);

            const u = new URL(COROAS_API, window.location.origin);
            u.searchParams.set("listar", "1");
            u.searchParams.set("grupo", "confeccao");
            u.searchParams.set("page", String(confeccaoPage));
            u.searchParams.set("per_page", String(confeccaoPerPage));

            if (forceFresh) u.searchParams.set("fresh", String(Date.now()));
            if (confeccaoAppliedQ.trim()) u.searchParams.set("q", confeccaoAppliedQ.trim());
            if (confeccaoAppliedStatus !== "todos") {
                u.searchParams.set("status", confeccaoAppliedStatus);
            }

            const res = await fetch(u.toString(), {
                credentials: "include",
                cache: forceFresh ? "no-cache" : "default",
                signal: controller.signal,
            });

            const json: ManualListResponse = await res.json().catch(() => ({
                sucesso: false,
                dados: [],
            }));

            if (!res.ok || !json?.sucesso) {
                throw new Error(json?.msg || `Falha ao carregar a confecção (${res.status}).`);
            }

            setConfeccaoOrders(Array.isArray(json.dados) ? json.dados : []);
            setConfeccaoTotal(Math.max(0, Number(json.meta?.total || 0)));
            setConfeccaoTotalPages(Math.max(1, Number(json.meta?.total_pages || 1)));
        } catch (e: any) {
            if (e?.name === "AbortError") return;
            setConfeccaoError(e?.message || "Erro ao carregar pedidos em confecção.");
        } finally {
            if (confeccaoAbortRef.current === controller) {
                confeccaoAbortRef.current = null;
                setConfeccaoLoading(false);
            }
        }
    }, [
        confeccaoPage,
        confeccaoAppliedQ,
        confeccaoAppliedStatus,
        confeccaoRefreshToken,
        sincronizarPedidosOnlineConfeccao,
    ]);

    const fetchHistoricoOrders = React.useCallback(async (forceFresh = false) => {
        historicoAbortRef.current?.abort();
        const controller = new AbortController();
        historicoAbortRef.current = controller;

        setManualLoading(true);
        setManualError(null);

        try {
            const u = new URL(COROAS_API, window.location.origin);
            u.searchParams.set("listar", "1");
            u.searchParams.set("grupo", "historico");
            u.searchParams.set("page", String(manualPage));
            u.searchParams.set("per_page", String(manualPerPage));

            if (forceFresh) u.searchParams.set("fresh", String(Date.now()));
            if (manualAppliedQ.trim()) u.searchParams.set("q", manualAppliedQ.trim());
            if (manualAppliedStatus !== "todos") {
                u.searchParams.set("status", manualAppliedStatus);
            }
            if (manualAppliedAfter) u.searchParams.set("after", manualAppliedAfter);
            if (manualAppliedBefore) u.searchParams.set("before", manualAppliedBefore);

            const res = await fetch(u.toString(), {
                credentials: "include",
                cache: forceFresh ? "no-cache" : "default",
                signal: controller.signal,
            });

            const json: ManualListResponse = await res.json().catch(() => ({
                sucesso: false,
                dados: [],
            }));

            if (!res.ok || !json?.sucesso) {
                throw new Error(json?.msg || `Falha ao carregar pedidos manuais (${res.status}).`);
            }

            setManualHistoricoOrders(Array.isArray(json.dados) ? json.dados : []);
            setManualTotal(Math.max(0, Number(json.meta?.total || 0)));
            setManualTotalPages(Math.max(1, Number(json.meta?.total_pages || 1)));
        } catch (e: any) {
            if (e?.name === "AbortError") return;
            setManualError(e?.message || "Erro ao carregar pedidos manuais.");
        } finally {
            if (historicoAbortRef.current === controller) {
                historicoAbortRef.current = null;
                setManualLoading(false);
            }
        }
    }, [
        manualPage,
        manualPerPage,
        manualAppliedQ,
        manualAppliedStatus,
        manualAppliedAfter,
        manualAppliedBefore,
        manualRefreshToken,
    ]);

    // Depois de uma alteração atualiza somente a lista que o usuário está vendo.
    const fetchManualOrders = React.useCallback(async (forceFresh = false) => {
        if (tab === "confeccao") {
            await fetchConfeccaoOrders(forceFresh);
        } else if (tab === "manuais") {
            await fetchHistoricoOrders(forceFresh);
        }
    }, [tab, fetchConfeccaoOrders, fetchHistoricoOrders]);

    React.useEffect(() => {
        if (tab !== "confeccao") return;
        void fetchConfeccaoOrders();
    }, [tab, fetchConfeccaoOrders]);

    React.useEffect(() => {
        if (tab !== "manuais") return;
        void fetchHistoricoOrders();
    }, [tab, fetchHistoricoOrders]);

    React.useEffect(() => {
        return () => {
            confeccaoAbortRef.current?.abort();
            historicoAbortRef.current?.abort();
        };
    }, []);

    /* -------------------------
       Manual: novo pedido
       ------------------------- */
    const [newOpen, setNewOpen] = React.useState(false);
    const [newSaving, setNewSaving] = React.useState(false);
    const [newError, setNewError] = React.useState<string | null>(null);
    const [newAtendimentoSelecionado, setNewAtendimentoSelecionado] = React.useState("");
    const [quantidadeCoroas, setQuantidadeCoroas] = React.useState(1);
    const [newItems, setNewItems] = React.useState<NovoCoroaItem[]>([criarNovoCoroaItem()]);
    const [newComprovante, setNewComprovante] = React.useState<File | null>(null);
    const [newForm, setNewForm] = React.useState({
        solicitante: "",
        telefone: "",
        local_entrega: "",
        observacoes: "",
        falecido: "",
    });

    function resetNewForm() {
        setNewForm({
            solicitante: "",
            telefone: "",
            local_entrega: "",
            observacoes: "",
            falecido: "",
        });
        setQuantidadeCoroas(1);
        setNewItems([criarNovoCoroaItem()]);
        setNewComprovante(null);
        setNewAtendimentoSelecionado("");
        setModeloTipo("");
        setModeloItemIndex(null);
        setModeloDeposito("");
        setModeloModalOpen(false);
        setModeloBusca("");
        setModeloError(null);
        setNewError(null);
    }

    function atualizarQuantidadeCoroas(valor: number) {
        const quantidade = Math.max(1, Math.min(20, Math.floor(Number(valor) || 1)));
        setQuantidadeCoroas(quantidade);

        setNewItems((atuais) => {
            const proximos = atuais.slice(0, quantidade);
            while (proximos.length < quantidade) {
                proximos.push(criarNovoCoroaItem());
            }
            return proximos;
        });
    }

    function atualizarItemCoroa(index: number, patch: Partial<NovoCoroaItem>) {
        setNewItems((atuais) =>
            atuais.map((item, i) => (i === index ? { ...item, ...patch } : item)),
        );
    }

    async function salvarNovoPedido(e: React.FormEvent) {
        e.preventDefault();
        setNewError(null);

        if (!newForm.solicitante.trim()) {
            setNewError("Preencha o campo Solicitante.");
            return;
        }

        if (!newForm.telefone.trim()) {
            setNewError("Preencha o campo Telefone.");
            return;
        }

        if (!newForm.local_entrega.trim()) {
            setNewError("Preencha o campo Local de Entrega.");
            return;
        }

        if (!newForm.falecido.trim()) {
            setNewError("Preencha o campo Falecido(a).");
            return;
        }

        if (quantidadeCoroas < 1 || newItems.length !== quantidadeCoroas) {
            setNewError("Informe corretamente a quantidade de coroas.");
            return;
        }

        for (let i = 0; i < newItems.length; i += 1) {
            const item = newItems[i];

            if (!item.tipo_coroa) {
                setNewError(`Selecione o tipo da Coroa ${i + 1}.`);
                return;
            }

            if (item.tipo_coroa === "artificial" && item.deposito_nome !== "MEMORIAL" && item.deposito_nome !== "FUNERARIA") {
                setNewError(`Selecione o depósito da Coroa ${i + 1} (MEMORIAL ou FUNERÁRIA).`);
                return;
            }

            if (!item.produto?.id || !String(item.produto?.nome || "").trim()) {
                setNewError(`Selecione o modelo da Coroa ${i + 1}.`);
                return;
            }

            if (!item.frase.trim()) {
                setNewError(`Preencha a frase da Coroa ${i + 1}.`);
                return;
            }
        }

        // Prioriza o atendimento explicitamente selecionado. Se o usuário
        // digitou o falecido manualmente, mantém o fallback por nome para
        // preservar a compatibilidade do fluxo anterior.
        const atendimentoSelecionado = falecidosQuadro.find(
            (r) => String(r.id || r.falecido || "") === newAtendimentoSelecionado,
        );

        const match =
            atendimentoSelecionado ||
            falecidosQuadro.find(
                (r) =>
                    String(r.falecido || "").trim().toLocaleLowerCase("pt-BR") ===
                    newForm.falecido.trim().toLocaleLowerCase("pt-BR"),
            );

        setNewSaving(true);

        try {
            if (newComprovante) validarComprovanteFile(newComprovante);

            const payload = {
                acao: "novo",
                solicitante: newForm.solicitante.trim(),
                telefone: newForm.telefone.trim(),
                local_entrega: newForm.local_entrega.trim(),
                observacoes: newForm.observacoes.trim(),
                quantidade_coroas: quantidadeCoroas,
                itens: newItems.map((item, index) => ({
                    ordem: index + 1,
                    tipo_coroa: item.tipo_coroa,
                    produto_id: Number(item.produto?.id || 0),
                    deposito_nome: item.tipo_coroa === "artificial" ? item.deposito_nome : null,
                    modelo_coroa: String(item.produto?.nome || "").trim(),
                    frase: item.frase.trim(),
                    valor: Number(item.produto?.valor || 0),
                    foto_produto_url: fotoPrincipalProduto(item.produto),
                })),
                falecido: newForm.falecido.trim(),
                falecido_atendimento_id: match?.id ? Number(match.id) || null : null,
                status_pagamento: newComprovante ? "pago" : "aguardando_pagamento",
                // Pedido criado manualmente nesta página é sempre Venda Direta.
                // Ordem de Serviço é reservada aos pedidos gerados pelo Atendimento Funerário.
                origem: "venda_direta" as ManualOrigem,
            };

            const json = newComprovante
                ? await postManualComArquivo(payload, "comprovante", newComprovante)
                : await postManual(payload);

            setNewOpen(false);
            resetNewForm();

            // Novo pedido pertence à Confecção. Não baixa o Histórico sem necessidade.
            setTab("confeccao");
            setConfeccaoPage(1);
            setConfeccaoRefreshToken((v) => v + 1);

            if (json?.notificacao_enviada === false) {
                const erroPush =
                    json?.notificacao?.erro ||
                    "O pedido foi salvo, mas o OneSignal não confirmou o envio da notificação.";
                window.alert(erroPush);
            }
        } catch (e: any) {
            setNewError(e?.message || "Não foi possível criar o pedido.");
        } finally {
            setNewSaving(false);
        }
    }

    /* -------------------------
       Manual: Ver / Ações
       ------------------------- */
    const [manualPanel, setManualPanel] = React.useState<"ver" | "acoes" | null>(null);
    const [manualDetail, setManualDetail] = React.useState<ManualOrder | null>(null);
    const [manualDetailLoading, setManualDetailLoading] = React.useState(false);
    const [manualActionLoading, setManualActionLoading] = React.useState(false);
    const [manualDetailMsg, setManualDetailMsg] = React.useState<string | null>(null);
    const [manualCopied, setManualCopied] = React.useState(false);
    const manualDetailAbortRef = React.useRef<AbortController | null>(null);

    const [finalizarOpen, setFinalizarOpen] = React.useState(false);
    const [finalizarFile, setFinalizarFile] = React.useState<File | null>(null);
    const [finalizarPreview, setFinalizarPreview] = React.useState<string | null>(null);
    const [finalizarError, setFinalizarError] = React.useState<string | null>(null);

    function limparPreviewFinalizacao() {
        setFinalizarPreview((url) => {
            if (url) URL.revokeObjectURL(url);
            return null;
        });
    }

    React.useEffect(() => {
        return () => {
            if (finalizarPreview) URL.revokeObjectURL(finalizarPreview);
        };
    }, [finalizarPreview]);

    async function carregarManualDetail(id: number, forceFresh = false) {
        manualDetailAbortRef.current?.abort();
        const controller = new AbortController();
        manualDetailAbortRef.current = controller;

        setManualDetailLoading(true);
        setManualDetailMsg(null);

        try {
            const u = new URL(COROAS_API, window.location.origin);
            u.searchParams.set("id", String(id));
            if (forceFresh) u.searchParams.set("fresh", String(Date.now()));

            const res = await fetch(u.toString(), {
                credentials: "include",
                cache: forceFresh ? "no-cache" : "default",
                signal: controller.signal,
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.sucesso) {
                throw new Error(json?.msg || "Não foi possível carregar o pedido.");
            }

            setManualDetail(json.dado as ManualOrder);
            return json.dado as ManualOrder;
        } catch (e: any) {
            if (e?.name === "AbortError") return null;
            setManualDetail(null);
            setManualDetailMsg(e?.message || "Erro ao carregar pedido.");
            return null;
        } finally {
            if (manualDetailAbortRef.current === controller) {
                manualDetailAbortRef.current = null;
                setManualDetailLoading(false);
            }
        }
    }

    async function openManualView(id: number) {
        setManualPanel("ver");
        setManualDetail(null);
        setManualCopied(false);
        await carregarManualDetail(id);
    }

    async function openManualActions(id: number) {
        setManualPanel("acoes");
        setManualDetail(null);
        await carregarManualDetail(id);
    }

    async function postManual(payload: Record<string, any>) {
        const payloadComUsuario = {
            ...payload,
            ...(usuarioAtual ? { usuario_nome: usuarioAtual } : {}),
        };

        const res = await fetch(COROAS_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payloadComUsuario),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.sucesso) {
            throw new Error(json?.msg || "Não foi possível concluir a operação.");
        }
        return json;
    }

    async function postManualComArquivo(
        payload: Record<string, any>,
        campoArquivo: "foto_coroa" | "comprovante",
        file: File,
    ) {
        const payloadComUsuario = {
            ...payload,
            ...(usuarioAtual ? { usuario_nome: usuarioAtual } : {}),
        };

        const form = new FormData();
        Object.entries(payloadComUsuario).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            if (typeof value === "object") {
                form.append(key, JSON.stringify(value));
            } else {
                form.append(key, String(value));
            }
        });
        form.append(campoArquivo, file, file.name || `${campoArquivo}.jpg`);

        const res = await fetch(COROAS_API, {
            method: "POST",
            credentials: "include",
            body: form,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.sucesso) {
            throw new Error(json?.msg || "Não foi possível concluir a operação.");
        }
        return json;
    }

    async function anexarComprovanteManual(file: File) {
        if (!manualDetail) return;
        setManualActionLoading(true);
        setManualDetailMsg(null);

        try {
            validarComprovanteFile(file);
            await postManualComArquivo(
                {
                    acao: "anexar_comprovante",
                    id: manualDetail.id,
                },
                "comprovante",
                file,
            );
            await postManual({
                acao: "atualizar_pagamento",
                id: manualDetail.id,
                status_pagamento: "pago",
            });
            await carregarManualDetail(manualDetail.id, true);
            await fetchManualOrders(true);
        } catch (e: any) {
            setManualDetailMsg(e?.message || "Não foi possível anexar o comprovante.");
        } finally {
            setManualActionLoading(false);
        }
    }


    async function executarStatusManual(target: Exclude<ManualStatus, "novo">) {
        if (!manualDetail) return;

        if (target === "coroa" && !pedidoManualExigeConfeccaoCoroa(manualDetail)) {
            setManualDetailMsg("Coroas artificiais não possuem a etapa “Confeccionando Coroa”.");
            return;
        }

        if (!acaoManualLiberada(manualDetail, target)) return;

        if (!window.confirm(`Confirmar a ação “${acaoManualLabel(target)}”?`)) {
            return;
        }

        setManualActionLoading(true);
        setManualDetailMsg(null);

        try {
            const json = await postManual({
                acao: "atualizar_status",
                id: manualDetail.id,
                status: target,
            });

            await carregarManualDetail(manualDetail.id, true);
            await fetchManualOrders(true);

            if (json?.notificacao_enviada === false) {
                setManualDetailMsg(
                    json?.notificacao?.erro
                        ? `A ação foi registrada, mas a notificação não foi enviada: ${json.notificacao.erro}`
                        : "A ação foi registrada, mas o OneSignal não confirmou o envio da notificação.",
                );
            }
        } catch (e: any) {
            setManualDetailMsg(e?.message || "Não foi possível registrar a ação.");
        } finally {
            setManualActionLoading(false);
        }
    }

    function clicarAcaoManual(target: Exclude<ManualStatus, "novo">) {
        if (!manualDetail) return;
        if (!acaoManualLiberada(manualDetail, target)) return;

        if (target === "finalizada") {
            setFinalizarFile(null);
            limparPreviewFinalizacao();
            setFinalizarError(null);
            setFinalizarOpen(true);
            return;
        }

        void executarStatusManual(target);
    }

    function selecionarFotoFinalizacao(file: File) {
        try {
            validarFotoCoroaFile(file);
            limparPreviewFinalizacao();
            setFinalizarFile(file);
            // Não cria preview da foto original. Isso evita que Androids com pouca RAM
            // decodifiquem imagens de 12/48 MP apenas para exibição no modal.
            setFinalizarPreview(null);
            setFinalizarError(null);
        } catch (e: any) {
            setFinalizarFile(null);
            setFinalizarPreview(null);
            setFinalizarError(e?.message || "Selecione uma imagem válida.");
        }
    }

    async function confirmarFinalizacaoManual() {
        if (!manualDetail) return;

        if (!finalizarFile) {
            setFinalizarError("Anexe a foto da coroa pronta para confirmar a finalização.");
            return;
        }

        setManualActionLoading(true);
        setFinalizarError(null);

        try {
            validarFotoCoroaFile(finalizarFile);

            const json = await postManualComArquivo(
                {
                    acao: "atualizar_status",
                    id: manualDetail.id,
                    status: "finalizada",
                },
                "foto_coroa",
                finalizarFile,
            );

            setFinalizarOpen(false);
            setFinalizarFile(null);
            limparPreviewFinalizacao();
            setManualPanel(null);

            await carregarManualDetail(manualDetail.id, true);
            await fetchManualOrders(true);

            if (json?.notificacao_enviada === false) {
                setManualDetailMsg(
                    json?.notificacao?.erro
                        ? `A coroa foi finalizada, mas a notificação não foi enviada: ${json.notificacao.erro}`
                        : "A coroa foi finalizada, mas o OneSignal não confirmou o envio da notificação.",
                );
            }
        } catch (e: any) {
            setFinalizarError(e?.message || "Não foi possível finalizar o pedido.");
        } finally {
            setManualActionLoading(false);
        }
    }

    async function copyManualToClipboard() {
        if (!manualDetail) return;

        try {
            await navigator.clipboard.writeText(buildManualPedidoText(manualDetail));
            setManualCopied(true);
            window.setTimeout(() => setManualCopied(false), 1500);
        } catch {
            alert("Não foi possível copiar o pedido.");
        }
    }

    /* -------------------------
       Online / WooCommerce
       ------------------------- */
    const [q, setQ] = React.useState("");
    const [wcStatus, setWcStatus] = React.useState<"all" | WcOrder["status"]>("all");
    const [after, setAfter] = React.useState("");
    const [before, setBefore] = React.useState("");
    const [onlineAppliedQ, setOnlineAppliedQ] = React.useState("");
    const [onlineAppliedStatus, setOnlineAppliedStatus] = React.useState<"all" | WcOrder["status"]>("all");
    const [onlineAppliedAfter, setOnlineAppliedAfter] = React.useState("");
    const [onlineAppliedBefore, setOnlineAppliedBefore] = React.useState("");
    const [onlineRefreshToken, setOnlineRefreshToken] = React.useState(0);
    const [page, setPage] = React.useState(1);
    const [perPage, setPerPage] = React.useState(20);
    const [orders, setOrders] = React.useState<WcOrder[]>([]);
    const [meta, setMeta] = React.useState<OrdersResponse["meta"]>({
        page: 1,
        per_page: 20,
        total: 0,
        totalPages: 0,
    });
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [open, setOpen] = React.useState(false);
    const [detail, setDetail] = React.useState<WcOrderFull | null>(null);
    const [detailLoading, setDetailLoading] = React.useState(false);
    const [detailImage, setDetailImage] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);
    const [updating, setUpdating] = React.useState(false);
    const onlineAbortRef = React.useRef<AbortController | null>(null);

    const fetchOrders = React.useCallback(async (forceFresh = false) => {
        onlineAbortRef.current?.abort();
        const controller = new AbortController();
        onlineAbortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const u = new URL("/api/wc/orders", window.location.origin);
            u.searchParams.set("page", String(page));
            u.searchParams.set("per_page", String(perPage));

            if (forceFresh) u.searchParams.set("fresh", String(Date.now()));
            if (onlineAppliedQ.trim()) u.searchParams.set("search", onlineAppliedQ.trim());
            if (onlineAppliedStatus !== "all") u.searchParams.set("status", onlineAppliedStatus);
            if (onlineAppliedAfter) {
                u.searchParams.set("after", new Date(onlineAppliedAfter).toISOString());
            }
            if (onlineAppliedBefore) {
                const d = new Date(onlineAppliedBefore);
                d.setHours(23, 59, 59, 999);
                u.searchParams.set("before", d.toISOString());
            }

            const res = await fetch(u.toString(), {
                cache: forceFresh ? "no-cache" : "default",
                signal: controller.signal,
            });

            if (!res.ok) throw new Error(`Falha ao buscar pedidos (${res.status})`);

            const json: OrdersResponse = await res.json();
            setOrders(json.data);
            setMeta(json.meta);
        } catch (e: any) {
            if (e?.name === "AbortError") return;
            setError(e?.message || "Erro ao carregar pedidos");
        } finally {
            if (onlineAbortRef.current === controller) {
                onlineAbortRef.current = null;
                setLoading(false);
            }
        }
    }, [
        page,
        perPage,
        onlineAppliedQ,
        onlineAppliedStatus,
        onlineAppliedAfter,
        onlineAppliedBefore,
        onlineRefreshToken,
    ]);

    React.useEffect(() => {
        if (tab !== "online") return;
        void fetchOrders();
    }, [tab, fetchOrders]);

    React.useEffect(() => {
        return () => onlineAbortRef.current?.abort();
    }, []);

    async function openDetail(id: number) {
        setDetail(null);
        setDetailImage(null);
        setCopied(false);
        setOpen(true);
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/wc/orders/${id}`, { cache: "default" });
            if (!res.ok) throw new Error(`Falha ao carregar pedido #${id}`);
            const data: WcOrderFull = await res.json();
            setDetail(data);

            const fromOrder = data.line_items?.find((li) => li.image?.src)?.image?.src || null;
            if (fromOrder) {
                setDetailImage(fromOrder);
            } else {
                const pid = data.line_items?.[0]?.product_id;
                const vid = data.line_items?.[0]?.variation_id;
                if (pid) {
                    try {
                        const url = vid ? `/api/wc/products/${pid}/variations/${vid}` : `/api/wc/products/${pid}`;
                        const pr = await fetch(url, { cache: "default" });
                        if (pr.ok) {
                            const prod = await pr.json();
                            const src: string | undefined = prod?.image?.src || prod?.images?.[0]?.src;
                            if (src) setDetailImage(src);
                        }
                    } catch {
                        // mantém sem imagem
                    }
                }
            }
        } catch (e: any) {
            setDetail({
                id,
                number: String(id),
                status: "failed",
                date_created: new Date().toISOString(),
                currency: "BRL",
                total: "0",
                customer_note: e?.message || "Erro ao carregar",
            } as WcOrderFull);
        } finally {
            setDetailLoading(false);
        }
    }

    async function updateStatus(id: number, newStatus: WcOrder["status"]) {
        setUpdating(true);
        try {
            const res = await fetch(`/api/wc/orders/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || "Falha ao atualizar status");
            }
            await fetchOrders(true);
            if (detail?.id === id) await openDetail(id);
        } catch (e: any) {
            alert(e?.message || "Não foi possível atualizar o status.");
        } finally {
            setUpdating(false);
        }
    }

    async function notifyWhatsApp(orderId: number) {
        try {
            const res = await fetch(`/api/wc/orders/${orderId}`, { cache: "default" });
            if (!res.ok) throw new Error(`Falha ao carregar o pedido #${orderId}`);
            const full: WcOrderFull = await res.json();
            await shareOrOpenWhatsApp(buildWhatsAppText(full));
        } catch (e: any) {
            alert(e?.message || "Não foi possível abrir o WhatsApp.");
        }
    }

    async function copyDetailToClipboard() {
        try {
            if (!detail) return;
            await navigator.clipboard.writeText(buildWhatsAppText(detail));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            alert("Não foi possível copiar o texto.");
        }
    }

    const canNotifyRow = (o: WcOrder) => o.status === "completed";
    const canNotifyDetail = detail?.status === "completed";

    return (
        <div className="flex h-full max-w-full flex-col overflow-x-hidden">
            <style jsx global>{`
                html,
                body {
                    max-width: 100%;
                    overflow-x: hidden;
                    overscroll-behavior-x: none;
                }

                input,
                select,
                textarea {
                    font-size: 16px !important;
                }

                @media (min-width: 640px) {
                    input,
                    select,
                    textarea {
                        font-size: 14px !important;
                    }
                }
            `}</style>

            {/* Cabeçalho */}
            <div className="flex flex-col gap-3 px-4 py-3 lg:px-6">
                <div className="flex items-center justify-between gap-3">
                    <h1 className="min-w-0 text-xl font-semibold">Pedidos — Coroas de Flores</h1>

                    <button
                        className="inline-flex shrink-0 items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:brightness-95"
                        onClick={() => {
                            resetNewForm();
                            void carregarFalecidosQuadro();
                            setNewOpen(true);
                        }}
                    >
                        <IconPlus className="size-4" />
                        NOVO
                    </button>
                </div>
            </div>

            {/* Abas — sempre em uma única linha, igualmente divididas */}
            <div className="px-4 pb-3 lg:px-6">
                <div className="grid w-full grid-cols-3 gap-1 rounded-lg border bg-muted/30 p-1">
                    <button
                        type="button"
                        className={`min-w-0 rounded-md px-2 py-2 text-center text-xs font-medium sm:px-4 sm:text-sm ${tab === "confeccao"
                            ? "bg-background shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                            }`}
                        onClick={() => setTab("confeccao")}
                    >
                        Confecção
                    </button>
                    <button
                        type="button"
                        className={`min-w-0 rounded-md px-2 py-2 text-center text-xs font-medium sm:px-4 sm:text-sm ${tab === "manuais"
                            ? "bg-background shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                            }`}
                        onClick={() => setTab("manuais")}
                    >
                        Pedidos Manuais
                    </button>
                    <button
                        type="button"
                        className={`min-w-0 rounded-md px-2 py-2 text-center text-xs font-medium sm:px-4 sm:text-sm ${tab === "online"
                            ? "bg-background shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                            }`}
                        onClick={() => setTab("online")}
                    >
                        Pedidos Online
                    </button>
                </div>
            </div>

            {/* =====================================================
                CONFECÇÃO — somente pedidos ainda em produção
                ===================================================== */}
            {tab === "confeccao" && (
                <>
                    <form
                        className="mx-4 mb-3 grid grid-cols-1 items-end gap-3 rounded-lg border bg-card p-3 sm:grid-cols-3 lg:mx-6"
                        onSubmit={(e) => {
                            e.preventDefault();
                            setConfeccaoAppliedQ(confeccaoQ.trim());
                            setConfeccaoAppliedStatus(confeccaoStatusFilter);
                            setConfeccaoPage(1);
                            setConfeccaoRefreshToken((v) => v + 1);
                        }}
                    >
                        <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-medium">Buscar</label>
                            <div className="relative">
                                <IconSearch className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-60" />
                                <input
                                    value={confeccaoQ}
                                    onChange={(e) => setConfeccaoQ(e.target.value)}
                                    className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-sm outline-none"
                                    placeholder="Solicitante, falecido, modelo..."
                                />
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium">Status</label>
                            <div className="flex gap-2">
                                <select
                                    value={confeccaoStatusFilter}
                                    onChange={(e) => setConfeccaoStatusFilter(e.target.value as "todos" | "novo" | "coroa" | "faixa" | "finalizada")}
                                    className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                                >
                                    <option value="todos">Todos</option>
                                    <option value="novo">Aguardando Confecção</option>
                                    <option value="coroa">Coroa em Confecção</option>
                                    <option value="faixa">Faixa em Confecção</option>
                                    <option value="finalizada">Coroa Finalizada</option>
                                </select>
                                <button type="submit" className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">
                                    Buscar
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* Confecção mobile */}
                    <div className="px-4 pb-6 md:hidden lg:px-6">
                        <div className="space-y-3">
                            {(!isDesktop ? confeccaoOrders : []).map((o) => (
                                <div key={o.id} className="rounded-lg border bg-card p-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-medium">{o.solicitante}</div>
                                            <div className="mt-1 text-xs text-muted-foreground">{o.falecido}</div>
                                        </div>
                                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${manualStatusClass(o.status)}`}>
                                            {manualStatusLabel(o.status)}
                                        </span>
                                    </div>
                                    <div className="mt-2 text-xs text-muted-foreground">
                                        {quantidadeManual(o)} {quantidadeManual(o) === 1 ? "coroa" : "coroas"} • {resumoModelosManual(o)}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${pagamentoAutomaticoClass(o)}`}>
                                            {pagamentoAutomaticoManual(o)}
                                        </span>
                                        <span className="rounded-full border px-2 py-0.5 text-[10px]">{origemPedidoLabel(o)}</span>
                                    </div>
                                    <div className="mt-3 flex gap-2">
                                        <button
                                            className="inline-flex flex-1 items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white"
                                            onClick={() => openManualActions(o.id)}
                                        >
                                            Ações
                                        </button>
                                        <button
                                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs"
                                            onClick={() => openManualView(o.id)}
                                        >
                                            <IconEye className="size-4" />
                                            Ver
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {!confeccaoLoading && confeccaoOrders.length === 0 && (
                                <div className="py-6 text-center text-sm text-muted-foreground">
                                    Nenhum pedido em confecção.
                                </div>
                            )}
                            {confeccaoLoading && <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>}
                            {confeccaoError && <div className="text-sm text-rose-600">{confeccaoError}</div>}
                        </div>
                    </div>

                    {/* Confecção desktop */}
                    <div className="hidden flex-1 overflow-auto px-4 pb-6 md:block lg:px-6">
                        <div className="overflow-hidden rounded-lg border bg-card">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-muted/50 text-left">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">Status</th>
                                            <th className="px-3 py-2 font-medium">Solicitante</th>
                                            <th className="px-3 py-2 font-medium">Falecido(a)</th>
                                            <th className="px-3 py-2 font-medium">Coroas</th>
                                            <th className="px-3 py-2 font-medium">Pagamento</th>
                                            <th className="px-3 py-2 font-medium">Origem</th>
                                            <th className="px-3 py-2 font-medium text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(isDesktop ? confeccaoOrders : []).map((o) => (
                                            <tr key={o.id} className="border-t">
                                                <td className="px-3 py-2">
                                                    <span className={`rounded-full border px-2 py-0.5 text-xs ${manualStatusClass(o.status)}`}>
                                                        {manualStatusLabel(o.status)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">{o.solicitante}</td>
                                                <td className="px-3 py-2">{o.falecido}</td>
                                                <td className="px-3 py-2">
                                                    <div>{quantidadeManual(o)} {quantidadeManual(o) === 1 ? "coroa" : "coroas"}</div>
                                                    <div className="mt-0.5 text-xs text-muted-foreground">{resumoModelosManual(o)}</div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={`rounded-full border px-2 py-0.5 text-xs ${pagamentoAutomaticoClass(o)}`}>
                                                        {pagamentoAutomaticoManual(o)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">{origemPedidoLabel(o)}</td>
                                                <td className="px-3 py-2">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                                                            onClick={() => openManualActions(o.id)}
                                                        >
                                                            Ações
                                                        </button>
                                                        <button
                                                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs"
                                                            onClick={() => openManualView(o.id)}
                                                        >
                                                            <IconEye className="size-4" /> Ver
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {!confeccaoLoading && confeccaoOrders.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                                                    Nenhum pedido em confecção.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                {confeccaoLoading && <div className="py-5 text-center text-sm text-muted-foreground">Carregando…</div>}
                                {confeccaoError && <div className="px-3 pb-3 text-sm text-rose-600">{confeccaoError}</div>}
                            </div>
                            <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
                                <div>
                                    Página {Math.min(confeccaoPage, confeccaoTotalPages)} de {confeccaoTotalPages} — {confeccaoTotal} pedidos
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        className="rounded-md border px-2 py-1 disabled:opacity-50"
                                        disabled={confeccaoPage <= 1 || confeccaoLoading}
                                        onClick={() => setConfeccaoPage((p) => Math.max(1, p - 1))}
                                    >
                                        Anterior
                                    </button>
                                    <button
                                        className="rounded-md border px-2 py-1 disabled:opacity-50"
                                        disabled={confeccaoPage >= confeccaoTotalPages || confeccaoLoading}
                                        onClick={() => setConfeccaoPage((p) => Math.min(confeccaoTotalPages, p + 1))}
                                    >
                                        Próxima
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* =====================================================
                PEDIDOS MANUAIS — entregues, sem Ações
                ===================================================== */}
            {tab === "manuais" && (
                <>
                    {/* Mesmos filtros do Online */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            setManualAppliedQ(manualQ.trim());
                            setManualAppliedStatus(manualStatusFilter);
                            setManualAppliedAfter(manualAfter);
                            setManualAppliedBefore(manualBefore);
                            setManualPage(1);
                            setManualRefreshToken((v) => v + 1);
                        }}
                        className="mx-4 mb-3 grid grid-cols-1 items-end gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:mx-6 lg:grid-cols-6"
                    >
                        <div className="col-span-1 sm:col-span-2 lg:col-span-2">
                            <label className="mb-1 block text-xs font-medium">Buscar</label>
                            <div className="relative">
                                <IconSearch className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-60" />
                                <input
                                    className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-sm outline-none"
                                    placeholder="Solicitante, falecido, modelo, nº do pedido..."
                                    value={manualQ}
                                    onChange={(e) => setManualQ(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium">Status</label>
                            <select
                                className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                                value={manualStatusFilter}
                                onChange={(e) => setManualStatusFilter(e.target.value as "todos" | "entregue")}
                            >
                                <option value="todos">Todos</option>
                                <option value="entregue">Entregue</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium">De</label>
                            <input
                                type="date"
                                className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                                value={manualAfter}
                                onChange={(e) => setManualAfter(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium">Até</label>
                            <input
                                type="date"
                                className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                                value={manualBefore}
                                onChange={(e) => setManualBefore(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                                disabled={manualLoading}
                            >
                                <IconSearch className="size-4" />
                                Buscar
                            </button>
                            <button
                                type="button"
                                className="inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm"
                                onClick={() => {
                                    setManualQ("");
                                    setManualStatusFilter("todos");
                                    setManualAfter("");
                                    setManualBefore("");
                                    setManualAppliedQ("");
                                    setManualAppliedStatus("todos");
                                    setManualAppliedAfter("");
                                    setManualAppliedBefore("");
                                    setManualPage(1);
                                    setManualRefreshToken((v) => v + 1);
                                }}
                            >
                                Limpar
                            </button>
                        </div>
                    </form>

                    {/* Manual histórico mobile */}
                    <div className="px-4 pb-6 md:hidden lg:px-6">
                        <div className="space-y-3">
                            {(!isDesktop ? manualHistoricoOrders : []).map((o) => (
                                <div key={o.id} className="rounded-lg border bg-card p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-xs text-muted-foreground">
                                            Nº <b>{o.id}</b> • {formatDate(o.criado_em)}
                                        </div>
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${manualStatusClass(o.status)}`}>
                                            {manualStatusLabel(o.status)}
                                        </span>
                                    </div>
                                    <div className="mt-2 text-sm">
                                        <div className="font-medium">{o.solicitante || "—"}</div>
                                        <div className="mt-1 text-muted-foreground">
                                            {totalManual(o) > 0 ? dinheiroBRL(totalManual(o)) : "—"}
                                        </div>
                                    </div>
                                    <div className="mt-2">
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${pagamentoAutomaticoClass(o)}`}>
                                            {pagamentoAutomaticoManual(o)}
                                        </span>
                                    </div>
                                    <div className="mt-3">
                                        <button
                                            className="inline-flex w-full items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs"
                                            onClick={() => openManualView(o.id)}
                                        >
                                            <IconEye className="size-4" /> Ver
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {!manualLoading && manualHistoricoOrders.length === 0 && (
                                <div className="py-6 text-center text-sm text-muted-foreground">Nenhum pedido manual encontrado.</div>
                            )}
                            {manualLoading && <div className="py-6 text-center text-sm text-muted-foreground">Carregando pedidos…</div>}
                            {manualError && <div className="text-sm text-rose-600">{manualError}</div>}
                        </div>
                    </div>

                    {/* Manual histórico desktop — padrão semelhante ao Online */}
                    <div className="hidden flex-1 overflow-auto px-4 pb-6 md:block lg:px-6">
                        <div className="overflow-hidden rounded-lg border bg-card">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-muted/50 text-left">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">Nº</th>
                                            <th className="px-3 py-2 font-medium">Data</th>
                                            <th className="px-3 py-2 font-medium">Cliente</th>
                                            <th className="px-3 py-2 font-medium">Total</th>
                                            <th className="px-3 py-2 font-medium">Pagamento</th>
                                            <th className="px-3 py-2 font-medium">Status</th>
                                            <th className="px-3 py-2 font-medium text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(isDesktop ? manualHistoricoOrders : []).map((o) => (
                                            <tr key={o.id} className="border-t">
                                                <td className="px-3 py-2">{o.id}</td>
                                                <td className="px-3 py-2">{formatDate(o.criado_em)}</td>
                                                <td className="px-3 py-2">{o.solicitante || "—"}</td>
                                                <td className="px-3 py-2">{totalManual(o) > 0 ? dinheiroBRL(totalManual(o)) : "—"}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`rounded-full border px-2 py-0.5 text-xs ${pagamentoAutomaticoClass(o)}`}>
                                                        {pagamentoAutomaticoManual(o)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={`rounded-full border px-2 py-0.5 text-xs ${manualStatusClass(o.status)}`}>
                                                        {manualStatusLabel(o.status)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex justify-end">
                                                        <button
                                                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                                                            onClick={() => openManualView(o.id)}
                                                        >
                                                            <IconEye className="size-4" /> Ver
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {!manualLoading && manualHistoricoOrders.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                                                    Nenhum pedido manual encontrado.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                {manualLoading && <div className="py-5 text-center text-sm text-muted-foreground">Carregando pedidos…</div>}
                                {manualError && <div className="px-3 pb-3 text-sm text-rose-600">{manualError}</div>}
                            </div>
                            <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
                                <div className="text-xs text-muted-foreground">
                                    Página {Math.min(manualPage, manualTotalPages)} de {manualTotalPages} — {manualTotal} pedidos
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                                        onClick={() => setManualPage((p) => Math.max(1, p - 1))}
                                        disabled={manualPage <= 1 || manualLoading}
                                    >
                                        <IconChevronLeft className="size-4" /> Anterior
                                    </button>
                                    <button
                                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                                        onClick={() => setManualPage((p) => Math.min(manualTotalPages, p + 1))}
                                        disabled={manualPage >= manualTotalPages || manualLoading}
                                    >
                                        Próxima <IconChevronRight className="size-4" />
                                    </button>
                                    <select
                                        className="rounded-md border bg-background px-2 py-1 text-xs"
                                        value={manualPerPage}
                                        onChange={(e) => setManualPerPage(Number(e.target.value))}
                                    >
                                        {[10, 20, 50, 100].map((n) => (
                                            <option key={n} value={n}>{n} por página</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* =====================================================
                PEDIDOS ONLINE
                ===================================================== */}
            {tab === "online" && (
                <>
                    {/* ONLINE — filtros existentes */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            setOnlineAppliedQ(q.trim());
                            setOnlineAppliedStatus(wcStatus);
                            setOnlineAppliedAfter(after);
                            setOnlineAppliedBefore(before);
                            setPage(1);
                            setOnlineRefreshToken((v) => v + 1);
                        }}
                        className="mx-4 mb-3 grid grid-cols-1 items-end gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:mx-6 lg:grid-cols-6"
                    >
                        <div className="col-span-1 sm:col-span-2 lg:col-span-2">
                            <label className="mb-1 block text-xs font-medium">Buscar</label>
                            <div className="relative">
                                <IconSearch className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-60" />
                                <input
                                    className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-sm outline-none"
                                    placeholder="Nome, e-mail, nº do pedido..."
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium">Status</label>
                            <select
                                className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                                value={wcStatus}
                                onChange={(e) => setWcStatus(e.target.value as any)}
                            >
                                {WC_STATUS_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium">De</label>
                            <input
                                type="date"
                                className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                                value={after}
                                onChange={(e) => setAfter(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium">Até</label>
                            <input
                                type="date"
                                className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                                value={before}
                                onChange={(e) => setBefore(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                                disabled={loading}
                            >
                                <IconSearch className="size-4" />
                                Buscar
                            </button>
                            <button
                                type="button"
                                className="inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm"
                                onClick={() => {
                                    setQ("");
                                    setWcStatus("all");
                                    setAfter("");
                                    setBefore("");
                                    setOnlineAppliedQ("");
                                    setOnlineAppliedStatus("all");
                                    setOnlineAppliedAfter("");
                                    setOnlineAppliedBefore("");
                                    setPage(1);
                                    setOnlineRefreshToken((v) => v + 1);
                                }}
                            >
                                Limpar
                            </button>
                        </div>
                    </form>

                    {/* Online mobile */}
                    <div className="px-4 pb-6 md:hidden lg:px-6">
                        <div className="space-y-3">
                            {(!isDesktop ? orders : []).map((o) => {
                                const cliente = `${o.billing?.first_name || ""} ${o.billing?.last_name || ""}`.trim() || "—";
                                const disabled = !canNotifyRow(o);
                                return (
                                    <div key={o.id} className="rounded-lg border bg-card p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-xs text-muted-foreground">
                                                Nº <b>{o.number || o.id}</b> • {formatDate(o.date_created)}
                                            </div>
                                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${clsWcStatusBadge(o.status)}`}>
                                                {WC_STATUS_OPTIONS.find((s) => s.value === o.status)?.label ?? o.status}
                                            </span>
                                        </div>
                                        <div className="mt-2 text-sm">
                                            <div className="font-medium">{cliente}</div>
                                            <div className="mt-1 text-muted-foreground">{formatCurrency(o.total, o.currency || "BRL")}</div>
                                        </div>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs"
                                                onClick={() => openDetail(o.id)}
                                            >
                                                <IconEye className="size-4" /> Ver
                                            </button>
                                            <button
                                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs disabled:opacity-50"
                                                onClick={() => notifyWhatsApp(o.id)}
                                                disabled={disabled}
                                            >
                                                <IconSend className="size-4" /> Notificar
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {!loading && orders.length === 0 && (
                                <div className="py-6 text-center text-sm text-muted-foreground">Nenhum pedido encontrado.</div>
                            )}
                            {loading && <div className="py-6 text-center text-sm text-muted-foreground">Carregando pedidos…</div>}
                            {error && <div className="text-sm text-rose-600">{error}</div>}
                        </div>
                    </div>

                    {/* Online desktop */}
                    <div className="hidden flex-1 overflow-auto px-4 pb-6 md:block lg:px-6">
                        <div className="overflow-hidden rounded-lg border bg-card">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-muted/50 text-left">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">Nº</th>
                                            <th className="px-3 py-2 font-medium">Data</th>
                                            <th className="px-3 py-2 font-medium">Cliente</th>
                                            <th className="px-3 py-2 font-medium">Total</th>
                                            <th className="px-3 py-2 font-medium">Status</th>
                                            <th className="px-3 py-2 font-medium text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(isDesktop ? orders : []).map((o) => {
                                            const cliente = `${o.billing?.first_name || ""} ${o.billing?.last_name || ""}`.trim() || "—";
                                            const disabled = !canNotifyRow(o);
                                            return (
                                                <tr key={o.id} className="border-t">
                                                    <td className="px-3 py-2">{o.number || o.id}</td>
                                                    <td className="px-3 py-2">{formatDate(o.date_created)}</td>
                                                    <td className="px-3 py-2">{cliente}</td>
                                                    <td className="px-3 py-2">{formatCurrency(o.total, o.currency || "BRL")}</td>
                                                    <td className="px-3 py-2">
                                                        <span className={`rounded-full border px-2 py-0.5 text-xs ${clsWcStatusBadge(o.status)}`}>
                                                            {WC_STATUS_OPTIONS.find((s) => s.value === o.status)?.label ?? o.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                                                                onClick={() => openDetail(o.id)}
                                                            >
                                                                <IconEye className="size-4" /> Ver
                                                            </button>
                                                            <button
                                                                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                                                                onClick={() => notifyWhatsApp(o.id)}
                                                                disabled={disabled}
                                                            >
                                                                <IconSend className="size-4" /> Notificar
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {!loading && orders.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                                                    Nenhum pedido encontrado.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                {loading && <div className="py-5 text-center text-sm text-muted-foreground">Carregando pedidos…</div>}
                                {error && <div className="px-3 pb-3 text-sm text-rose-600">{error}</div>}
                            </div>
                            <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
                                <div className="text-xs text-muted-foreground">
                                    Página {meta.page} de {meta.totalPages} — {meta.total} pedidos
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page <= 1 || loading}
                                    >
                                        <IconChevronLeft className="size-4" /> Anterior
                                    </button>
                                    <button
                                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                                        onClick={() => setPage((p) => (meta.totalPages ? Math.min(meta.totalPages, p + 1) : p + 1))}
                                        disabled={meta.totalPages ? page >= meta.totalPages || loading : loading}
                                    >
                                        Próxima <IconChevronRight className="size-4" />
                                    </button>
                                    <select
                                        className="rounded-md border bg-background px-2 py-1 text-xs"
                                        value={perPage}
                                        onChange={(e) => {
                                            setPerPage(Number(e.target.value));
                                            setPage(1);
                                        }}
                                    >
                                        {[10, 20, 50, 100].map((n) => (
                                            <option key={n} value={n}>{n} por página</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Modal NOVO */}
            {newOpen && (
                <div className="fixed inset-0 z-50 grid place-items-center p-4">
                    <div className="absolute inset-0 bg-black/40" onClick={() => !newSaving && setNewOpen(false)} />
                    <form
                        onSubmit={salvarNovoPedido}
                        className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-x-hidden overflow-y-auto rounded-xl border bg-background shadow-xl"
                    >
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <div className="text-lg font-semibold">Novo Pedido de Coroa</div>
                            </div>
                            <button type="button" className="rounded-md p-2 hover:bg-muted" onClick={() => setNewOpen(false)}>
                                <IconX className="size-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                            {/* 1. Atendimento existente */}
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">Atendimento</label>
                                <select
                                    value={newAtendimentoSelecionado}
                                    onChange={(e) => {
                                        const chave = e.target.value;
                                        setNewAtendimentoSelecionado(chave);

                                        if (!chave) return;

                                        const atendimento = falecidosQuadro.find(
                                            (r) => String(r.id || r.falecido || "") === chave,
                                        );

                                        if (!atendimento) return;

                                        const nomeFalecido = String(atendimento.falecido || "").trim();
                                        const localVelorio = String(atendimento.local_velorio || "").trim();

                                        setNewForm((p) => ({
                                            ...p,
                                            falecido: nomeFalecido,
                                            // O Local do Velório é o Local de Entrega.
                                            // Se o atendimento ainda não tiver local, permanece vazio
                                            // para preenchimento manual.
                                            local_entrega: localVelorio,
                                        }));
                                    }}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    disabled={falecidosLoading && falecidosQuadro.length === 0}
                                >
                                    <option value="">
                                        {falecidosLoading
                                            ? "Consultando o quadro de atendimentos..."
                                            : "Selecione um atendimento"}
                                    </option>
                                    {falecidosQuadro.map((r) => (
                                        <option
                                            key={String(r.id || r.falecido)}
                                            value={String(r.id || r.falecido || "")}
                                        >
                                            {String(r.falecido || "")}
                                        </option>
                                    ))}
                                </select>

                                {falecidosError && (
                                    <div className="mt-1 text-xs text-rose-600">
                                        {falecidosError}
                                        <button
                                            type="button"
                                            className="ml-2 underline underline-offset-2"
                                            onClick={() => void carregarFalecidosQuadro(true)}
                                        >
                                            Tentar novamente
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* 2. Falecido, também permite preenchimento livre */}
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">Falecido(a) *</label>
                                <input
                                    value={newForm.falecido}
                                    onChange={(e) => {
                                        setNewAtendimentoSelecionado("");
                                        setNewForm((p) => ({ ...p, falecido: e.target.value }));
                                    }}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    placeholder="Digite o nome do falecido ou selecione um atendimento acima"
                                />
                            </div>

                            {/* 3. Local do velório = local de entrega */}
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">Local de Entrega *</label>
                                <input
                                    value={newForm.local_entrega}
                                    onChange={(e) => setNewForm((p) => ({ ...p, local_entrega: e.target.value }))}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    placeholder="Local da entrega"
                                />
                                <div className="mt-1 text-xs text-muted-foreground">
                                    Ao selecionar um atendimento, este campo recebe automaticamente o Local do Velório. Se o atendimento não tiver local cadastrado, preencha manualmente.
                                </div>
                            </div>

                            {/* 4. Quantidade e dados de cada coroa */}
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">Quantidade de Coroas *</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    inputMode="numeric"
                                    value={quantidadeCoroas}
                                    onChange={(e) => atualizarQuantidadeCoroas(Number(e.target.value))}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                />
                            </div>

                            <div className="sm:col-span-2 space-y-4">
                                {newItems.map((item, index) => {
                                    const produto = item.produto;
                                    const foto = fotoPrincipalProduto(produto);

                                    return (
                                        <div key={index} className="rounded-xl border bg-muted/10 p-3">
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <div className="font-semibold">
                                                    Coroa {index + 1}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {index + 1} de {quantidadeCoroas}
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    <label className="mb-1 block text-sm font-medium">Tipo *</label>
                                                    <select
                                                        value={item.tipo_coroa}
                                                        onChange={(e) => {
                                                            const tipo = e.target.value as CoroaTipo;
                                                            atualizarItemCoroa(index, {
                                                                tipo_coroa: tipo,
                                                                deposito_nome: "",
                                                                produto: null,
                                                            });

                                                            if (tipo === "natural") {
                                                                abrirSeletorModelo(index, tipo, "");
                                                            }
                                                        }}
                                                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                                    >
                                                        <option value="">Selecione o tipo da coroa</option>
                                                        <option value="natural">Natural</option>
                                                        <option value="artificial">Artificial</option>
                                                    </select>
                                                </div>

                                                {item.tipo_coroa === "artificial" && (
                                                    <div>
                                                        <label className="mb-1 block text-sm font-medium">Depósito *</label>
                                                        <select
                                                            value={item.deposito_nome}
                                                            onChange={(e) => {
                                                                const deposito = e.target.value as CoroaDeposito;
                                                                atualizarItemCoroa(index, { deposito_nome: deposito, produto: null });
                                                                if (deposito) abrirSeletorModelo(index, "artificial", deposito);
                                                            }}
                                                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                                        >
                                                            <option value="">Selecione o depósito</option>
                                                            <option value="MEMORIAL">MEMORIAL</option>
                                                            <option value="FUNERARIA">FUNERÁRIA</option>
                                                        </select>
                                                    </div>
                                                )}

                                                <div>
                                                    <label className="mb-1 block text-sm font-medium">Modelo *</label>

                                                    {produto ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => abrirSeletorModelo(index, item.tipo_coroa, item.deposito_nome)}
                                                            className="flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left transition hover:bg-muted/40"
                                                        >
                                                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-muted/30">
                                                                {foto ? (
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    <img
                                                                        src={foto}
                                                                        alt={produto.nome}
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                                                        Sem foto
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="min-w-0 flex-1">
                                                                <div className="truncate font-medium">{produto.nome}</div>
                                                                <div className="mt-1 text-xs text-muted-foreground">
                                                                    {rotuloTipoCoroa(item.tipo_coroa)}
                                                                    {item.tipo_coroa === "artificial" && item.deposito_nome ? ` • ${item.deposito_nome === "FUNERARIA" ? "FUNERÁRIA" : item.deposito_nome}` : ""}
                                                                    {produto.codigo_barras ? ` • ${produto.codigo_barras}` : ""}
                                                                </div>
                                                                <div className="mt-1 font-semibold text-emerald-700">
                                                                    {dinheiroBRL(produto.valor)}
                                                                </div>
                                                            </div>

                                                            <div className="shrink-0 text-xs text-blue-600">
                                                                Alterar
                                                            </div>
                                                        </button>
                                                    ) : item.tipo_coroa ? (
                                                        <button
                                                            type="button"
                                                            disabled={item.tipo_coroa === "artificial" && !item.deposito_nome}
                                                            onClick={() => abrirSeletorModelo(index, item.tipo_coroa, item.deposito_nome)}
                                                            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm hover:bg-muted/40 disabled:opacity-50"
                                                        >
                                                            <IconSearch className="size-4" />
                                                            {item.tipo_coroa === "artificial" && !item.deposito_nome
                                                                ? "Selecione primeiro o depósito"
                                                                : `Escolher modelo ${rotuloTipoCoroa(item.tipo_coroa)}`}
                                                        </button>
                                                    ) : (
                                                        <div className="rounded-md border border-dashed px-3 py-3 text-center text-sm text-muted-foreground">
                                                            Primeiro selecione Natural ou Artificial.
                                                        </div>
                                                    )}
                                                </div>

                                                <div>
                                                    <label className="mb-1 block text-sm font-medium">Sugestões de frases</label>
                                                    <select
                                                        value={item.frase_sugestao}
                                                        onChange={(e) => {
                                                            const frase = e.target.value;
                                                            atualizarItemCoroa(index, {
                                                                frase_sugestao: frase,
                                                                ...(frase ? { frase } : {}),
                                                            });
                                                        }}
                                                        className="mb-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
                                                    >
                                                        <option value="">Selecione uma sugestão ou escreva a sua própria frase abaixo</option>
                                                        {FRASES_SUGERIDAS.map((sugestao) => (
                                                            <option key={sugestao.numero} value={sugestao.texto}>
                                                                {sugestao.numero} — {sugestao.texto}
                                                            </option>
                                                        ))}
                                                    </select>

                                                    <label className="mb-1 block text-sm font-medium">Frase *</label>
                                                    <textarea
                                                        value={item.frase}
                                                        onChange={(e) =>
                                                            atualizarItemCoroa(index, {
                                                                frase: e.target.value,
                                                                frase_sugestao: "",
                                                            })
                                                        }
                                                        className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                                                        placeholder={`Frase da Coroa ${index + 1}`}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Informações complementares do pedido */}
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">Observações</label>
                                <textarea
                                    value={newForm.observacoes}
                                    onChange={(e) => setNewForm((p) => ({ ...p, observacoes: e.target.value }))}
                                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    placeholder="Digite observações do pedido (opcional)"
                                />
                            </div>


                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">Comprovante</label>
                                <ComprovanteUploadButtons
                                    disabled={newSaving}
                                    onFile={(file) => {
                                        try {
                                            validarComprovanteFile(file);
                                            setNewComprovante(file);
                                            setNewError(null);
                                        } catch (e: any) {
                                            setNewComprovante(null);
                                            setNewError(e?.message || "Comprovante inválido.");
                                        }
                                    }}
                                />

                                {newComprovante && (
                                    <div className="mt-2 flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                                        <div className="min-w-0">
                                            <div className="truncate font-medium">{newComprovante.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatFileSize(newComprovante.size)}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="shrink-0 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                            onClick={() => setNewComprovante(null)}
                                        >
                                            Remover
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* 5. Solicitante por último, conforme o fluxo operacional */}
                            <div className="sm:col-span-2 border-t pt-4">
                                <div className="mb-3 text-sm font-semibold">Dados do solicitante</div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-sm font-medium">Solicitante *</label>
                                        <input
                                            value={newForm.solicitante}
                                            onChange={(e) => setNewForm((p) => ({ ...p, solicitante: e.target.value }))}
                                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                            placeholder="Nome do solicitante"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-sm font-medium">Telefone *</label>
                                        <input
                                            type="tel"
                                            inputMode="tel"
                                            value={newForm.telefone}
                                            onChange={(e) => setNewForm((p) => ({ ...p, telefone: e.target.value }))}
                                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                            placeholder="Telefone do solicitante"
                                        />
                                    </div>
                                </div>
                            </div>

                            {newError && <div className="sm:col-span-2 text-sm text-rose-600">{newError}</div>}
                        </div>
                        <div className="flex justify-end gap-2 border-t px-4 py-3">
                            <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setNewOpen(false)} disabled={newSaving}>
                                Cancelar
                            </button>
                            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={newSaving}>
                                {newSaving ? "Salvando..." : "Criar Pedido"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Drawer manual */}
            {modeloModalOpen && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-2 sm:p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Selecionar Coroa ${rotuloTipoCoroa(modeloTipo)}`}
                >
                    <div className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-background shadow-2xl">
                        <div className="flex items-start justify-between gap-3 border-b p-4">
                            <div className="min-w-0">
                                <h2 className="text-lg font-semibold">
                                    Selecionar Coroa {rotuloTipoCoroa(modeloTipo)}
                                </h2>
                                {modeloTipo === "artificial" && modeloDeposito && (
                                    <div className="mt-1 text-xs text-muted-foreground">Depósito: {modeloDeposito === "FUNERARIA" ? "FUNERÁRIA" : modeloDeposito}</div>
                                )}
                            </div>

                            <button
                                type="button"
                                className="rounded-md p-2 hover:bg-muted"
                                onClick={() => { setModeloModalOpen(false); setModeloItemIndex(null); }}
                                aria-label="Fechar"
                            >
                                <IconX className="size-5" />
                            </button>
                        </div>

                        <div className="border-b p-4">
                            <div className="relative">
                                <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={modeloBusca}
                                    onChange={(e) => setModeloBusca(e.target.value)}
                                    className="w-full rounded-xl border bg-background py-2 pl-9 pr-3 text-[16px] sm:text-sm"
                                    placeholder="Pesquisar modelo pelo nome ou código..."
                                    autoFocus
                                />
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span>
                                    {modeloLoading
                                        ? "Consultando estoque..."
                                        : `${modelosDisponiveis.length} modelo(s) disponível(is).`}
                                </span>

                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"
                                    onClick={() => void carregarModelosCoroa(true)}
                                    disabled={modeloLoading}
                                >
                                    <IconRefresh className={`size-3.5 ${modeloLoading ? "animate-spin" : ""}`} />
                                    Atualizar
                                </button>
                            </div>

                            {modeloError && (
                                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                                    {modeloError}
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {modeloLoading && modelosDisponiveis.length === 0 ? (
                                <div className="p-8 text-center text-sm text-muted-foreground">
                                    Carregando modelos...
                                </div>
                            ) : !modeloError && modelosDisponiveis.length === 0 ? (
                                <div className="p-8 text-center text-sm text-muted-foreground">
                                    {modeloTipo === "artificial"
                                        ? "Nenhuma coroa artificial com estoque disponível."
                                        : "Nenhum modelo cadastrado em COROAS NATURAIS."}
                                </div>
                            ) : (
                                <>
                                    {/* Desktop: tabela simples */}
                                    <div className="hidden overflow-x-auto lg:block">
                                        <table className="min-w-full text-left text-sm">
                                            <thead className="sticky top-0 bg-muted/80 text-xs">
                                                <tr>
                                                    <th className="w-24 px-4 py-3">Foto</th>
                                                    <th className="px-4 py-3">Modelo</th>
                                                    <th className="px-4 py-3">Categoria</th>
                                                    {modeloTipo === "artificial" && (
                                                        <th className="px-4 py-3 text-right">Qtd.</th>
                                                    )}
                                                    <th className="px-4 py-3 text-right">Preço</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {modelosDisponiveis.map((produto) => {
                                                    const foto = fotoPrincipalProduto(produto);
                                                    const saldo = saldoModeloSelecionado(Number(produto.id));

                                                    return (
                                                        <tr
                                                            key={produto.id}
                                                            onClick={() => selecionarModeloCoroa(produto)}
                                                            className="cursor-pointer transition hover:bg-muted/50"
                                                        >
                                                            <td className="px-4 py-3">
                                                                <div className="h-16 w-16 overflow-hidden rounded-xl border bg-muted/30">
                                                                    {foto ? (
                                                                        // eslint-disable-next-line @next/next/no-img-element
                                                                        <img
                                                                            src={foto}
                                                                            alt={produto.nome}
                                                                            className="h-full w-full object-cover"
                                                                        />
                                                                    ) : (
                                                                        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                                                            Sem foto
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="font-semibold">{produto.nome}</div>
                                                                {produto.codigo_barras ? (
                                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                                        CB: {produto.codigo_barras}
                                                                    </div>
                                                                ) : null}
                                                            </td>
                                                            <td className="px-4 py-3 text-muted-foreground">
                                                                {produto.categoria_nome || "—"}
                                                            </td>
                                                            {modeloTipo === "artificial" && (
                                                                <td className="px-4 py-3 text-right font-semibold">
                                                                    {saldo}
                                                                </td>
                                                            )}
                                                            <td className="px-4 py-3 text-right font-semibold">
                                                                {dinheiroBRL(produto.valor)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile/tablet: mesmo padrão de cartões da consulta de produtos */}
                                    <div className="grid grid-cols-1 gap-3 p-3 lg:hidden">
                                        {modelosDisponiveis.map((produto) => {
                                            const foto = fotoPrincipalProduto(produto);
                                            const saldo = saldoModeloSelecionado(Number(produto.id));

                                            return (
                                                <button
                                                    key={produto.id}
                                                    type="button"
                                                    onClick={() => selecionarModeloCoroa(produto)}
                                                    className="w-full rounded-2xl border bg-background p-3 text-left outline-none transition hover:border-slate-300 hover:shadow-sm focus:ring-2 focus:ring-slate-200"
                                                >
                                                    <div className="flex gap-4">
                                                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-muted/30">
                                                            {foto ? (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img
                                                                    src={foto}
                                                                    alt={produto.nome}
                                                                    className="h-full w-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                                                    Sem foto
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="min-w-0 flex-1">
                                                            <p className="line-clamp-2 font-semibold">
                                                                {produto.nome}
                                                            </p>
                                                            <p className="mt-1 truncate text-xs font-medium text-muted-foreground">
                                                                {produto.categoria_nome || "—"}
                                                            </p>
                                                            {produto.codigo_barras ? (
                                                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                                    CB: {produto.codigo_barras}
                                                                </p>
                                                            ) : null}
                                                            <p className="mt-1 text-sm font-semibold">
                                                                {dinheiroBRL(produto.valor)}
                                                            </p>
                                                        </div>

                                                        <div className="shrink-0 text-right">
                                                            {modeloTipo === "artificial" ? (
                                                                <>
                                                                    <p className="text-xs text-muted-foreground">Qtd</p>
                                                                    <p className="text-xl font-bold">{saldo}</p>
                                                                </>
                                                            ) : (
                                                                <span className="inline-flex rounded-full border px-2 py-1 text-[11px] font-medium">
                                                                    Natural
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="border-t p-3 text-right">
                            <button
                                type="button"
                                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
                                onClick={() => { setModeloModalOpen(false); setModeloItemIndex(null); }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Ações do pedido manual */}
            {manualPanel === "acoes" && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
                    <div className="w-full max-w-xl overflow-hidden rounded-xl border bg-background shadow-xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <div className="text-lg font-semibold">Registrar uma ação</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                    Status sincronizado com o servidor.
                                </div>
                            </div>
                            <button
                                type="button"
                                className="rounded-md p-2 hover:bg-muted"
                                onClick={() => setManualPanel(null)}
                            >
                                <IconX className="size-5" />
                            </button>
                        </div>

                        <div className="p-4">
                            {manualDetailLoading ? (
                                <div className="py-6 text-center text-sm text-muted-foreground">
                                    Carregando...
                                </div>
                            ) : manualDetail ? (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {acoesManualDoPedido(manualDetail).map(([target, label]) => {
                                        const concluida = acaoManualConcluida(manualDetail, target);
                                        const liberada = acaoManualLiberada(manualDetail, target);

                                        return (
                                            <button
                                                key={target}
                                                type="button"
                                                disabled={manualActionLoading || concluida || !liberada}
                                                onClick={() => clicarAcaoManual(target)}
                                                className={[
                                                    "min-h-12 rounded-md border px-3 py-2 text-sm font-medium transition",
                                                    concluida
                                                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                                        : liberada
                                                            ? "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100"
                                                            : "bg-muted/20 text-muted-foreground opacity-60",
                                                ].join(" ")}
                                            >
                                                <span className="inline-flex items-center gap-2">
                                                    {concluida ? <IconCheck className="size-4" /> : null}
                                                    {label}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-sm text-rose-600">
                                    {manualDetailMsg || "Pedido não encontrado."}
                                </div>
                            )}

                            {manualDetailMsg && manualDetail && (
                                <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                                    {manualDetailMsg}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Foto obrigatória para Finalizada */}
            {finalizarOpen && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-3">
                    <div className="w-full max-w-lg overflow-hidden rounded-xl border bg-background shadow-2xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <div className="text-lg font-semibold">Coroa Finalizada</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                    Anexe a foto da coroa pronta para confirmar.
                                </div>
                            </div>
                            <button
                                type="button"
                                className="rounded-md p-2 hover:bg-muted"
                                disabled={manualActionLoading}
                                onClick={() => {
                                    setFinalizarOpen(false);
                                    setFinalizarFile(null);
                                    limparPreviewFinalizacao();
                                    setFinalizarError(null);
                                }}
                            >
                                <IconX className="size-5" />
                            </button>
                        </div>

                        <div className="space-y-4 p-4">
                            <ImageUploadButtons
                                disabled={manualActionLoading}
                                onFile={selecionarFotoFinalizacao}
                            />

                            {finalizarFile && (
                                <div className="rounded-lg border bg-emerald-50 p-3 text-sm text-emerald-800">
                                    <div className="font-medium">Foto pronta para envio</div>
                                    <div className="mt-1 text-xs">
                                        {finalizarFile.name} · {formatFileSize(finalizarFile.size)}
                                    </div>
                                </div>
                            )}

                            {finalizarError && (
                                <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                                    {finalizarError}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 border-t px-4 py-3">
                            <button
                                type="button"
                                className="rounded-md border px-4 py-2 text-sm"
                                disabled={manualActionLoading}
                                onClick={() => {
                                    setFinalizarOpen(false);
                                    setFinalizarFile(null);
                                    limparPreviewFinalizacao();
                                    setFinalizarError(null);
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                                disabled={manualActionLoading || !finalizarFile}
                                onClick={confirmarFinalizacaoManual}
                            >
                                {manualActionLoading ? "Finalizando..." : "Confirmar Coroa Finalizada"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Ver pedido manual — mesmo padrão visual do pedido online */}
            {manualPanel === "ver" && (
                <div className="fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setManualPanel(null)} />
                    <div className="absolute right-0 top-0 h-full w-full overflow-x-hidden overflow-y-auto bg-white shadow-xl md:max-w-xl">
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
                            <div>
                                <div className="text-sm text-muted-foreground">
                                    {pedidoEhOnline(manualDetail) ? "Pedido online em produção" : "Pedido manual"}
                                </div>
                                <div className="text-lg font-semibold">
                                    #{manualDetail?.id || "—"}
                                    {pedidoEhOnline(manualDetail) && manualDetail?.origem_externa_id
                                        ? ` • Woo #${manualDetail.origem_externa_id}`
                                        : ""}
                                </div>
                            </div>
                            <button
                                className="rounded-md p-2 hover:bg-muted"
                                onClick={() => setManualPanel(null)}
                            >
                                <IconX className="size-5" />
                            </button>
                        </div>

                        {manualDetailLoading ? (
                            <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
                        ) : manualDetail ? (
                            <div className="space-y-4 p-4">
                                {/* Fotos dos modelos */}
                                {itensManual(manualDetail).some((item) => item.foto_produto_url) && (
                                    <div className="space-y-3">
                                        {itensManual(manualDetail).map((item, index) =>
                                            item.foto_produto_url ? (
                                                <div key={item.id || `${item.ordem}-${index}`} className="overflow-hidden rounded-lg border bg-white">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={item.foto_produto_url}
                                                        alt={item.modelo_coroa || `Coroa ${index + 1}`}
                                                        className="w-full object-cover"
                                                    />
                                                    {itensManual(manualDetail).length > 1 && (
                                                        <div className="border-t px-3 py-2 text-xs font-medium">
                                                            Coroa {item.ordem || index + 1} — {item.modelo_coroa}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : null,
                                        )}
                                    </div>
                                )}

                                {/* Informações do pedido — mesma ordem do Online */}
                                <div className="rounded-lg border p-3 text-sm leading-6">
                                    <div><b>Pedido:</b> {pedidoModelosManual(manualDetail)}</div>
                                    <div><b>Origem:</b> {origemPedidoLabel(manualDetail)}</div>
                                    {pedidoEhOnline(manualDetail) && manualDetail.origem_externa_id && (
                                        <div><b>Pedido WooCommerce:</b> #{manualDetail.origem_externa_id}</div>
                                    )}
                                    <div><b>Cliente:</b> {manualDetail.solicitante || "—"}</div>
                                    <div><b>Telefone:</b> {manualDetail.telefone || "—"}</div>
                                    <div><b>Valor:</b> {totalManual(manualDetail) > 0 ? dinheiroBRL(totalManual(manualDetail)) : "—"}</div>
                                    <div><b>Local de Entrega:</b> {manualDetail.local_entrega || "—"}</div>
                                    <div className="whitespace-pre-wrap"><b>Observações:</b> {manualDetail.observacoes || "—"}</div>
                                    <div><b>Falecido(a):</b> {manualDetail.falecido || "—"}</div>
                                    <div className="whitespace-pre-wrap"><b>Frase da Coroa:</b> {pedidoFrasesManual(manualDetail)}</div>
                                </div>

                                {/* Status do pedido */}
                                <div className="rounded-lg border p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className={`rounded-full border px-2 py-0.5 text-xs ${manualStatusClass(manualDetail.status)}`}>
                                            {manualStatusLabel(manualDetail.status)}
                                        </span>
                                        <div className="text-xs text-muted-foreground">
                                            Criado em {formatDate(manualDetail.criado_em)} — Total <b>{totalManual(manualDetail) > 0 ? dinheiroBRL(totalManual(manualDetail)) : "—"}</b>
                                        </div>
                                    </div>
                                </div>

                                {/* Pagamento e comprovante ficam no Ver */}
                                <div className="rounded-lg border p-3">
                                    <div className="mb-2 font-medium">Pagamento</div>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                        <div>
                                            <div className="mb-1 text-xs font-medium">Status</div>
                                            <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${pagamentoAutomaticoClass(manualDetail)}`}>
                                                {pagamentoAutomaticoManual(manualDetail)}
                                            </span>
                                        </div>

                                        <div>
                                            <div className="mb-1 text-xs font-medium">Comprovante</div>
                                            {pedidoEhOnline(manualDetail) ? (
                                                <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                                    Pagamento confirmado pelo WooCommerce. Não é necessário anexar comprovante manual.
                                                </div>
                                            ) : (
                                                <ComprovanteUploadButtons
                                                    disabled={manualActionLoading}
                                                    onFile={anexarComprovanteManual}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {manualDetail.comprovante_url && (
                                        comprovanteEhPdf(manualDetail) ? (
                                            <a
                                                href={manualDetail.comprovante_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-3 flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-sm hover:bg-muted/40"
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-medium">Comprovante em PDF</div>
                                                    <div className="truncate text-xs text-muted-foreground">
                                                        {manualDetail.comprovante_nome || "Abrir arquivo"}
                                                    </div>
                                                </div>
                                                <span className="shrink-0 text-blue-600">Abrir</span>
                                            </a>
                                        ) : (
                                            <a
                                                href={manualDetail.comprovante_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-3 block overflow-hidden rounded-lg border"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={manualDetail.comprovante_url}
                                                    alt="Comprovante"
                                                    className="max-h-72 w-full object-contain bg-muted/20"
                                                />
                                            </a>
                                        )
                                    )}
                                </div>

                                {/* Foto final, somente visualização */}
                                {manualDetail.foto_coroa_url && (
                                    <div className="rounded-lg border p-3">
                                        <div className="mb-2 font-medium">Coroa Pronta</div>
                                        <a
                                            href={manualDetail.foto_coroa_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block overflow-hidden rounded-lg border"
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={manualDetail.foto_coroa_url}
                                                alt="Coroa pronta"
                                                className="max-h-96 w-full object-contain bg-muted/20"
                                            />
                                        </a>
                                    </div>
                                )}

                                {manualDetailMsg && (
                                    <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                                        {manualDetailMsg}
                                    </div>
                                )}

                                {/* Mesmo padrão de utilidades do pedido online */}
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                        onClick={copyManualToClipboard}
                                    >
                                        <IconCopy className="size-4" />
                                        {manualCopied ? "Copiado!" : "Copiar Pedido"}
                                    </button>

                                    {itensManual(manualDetail)
                                        .filter((item) => Boolean(item.foto_produto_url))
                                        .map((item, index, fotos) => (
                                            <button
                                                key={`share-${item.id || item.ordem || index}`}
                                                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                                onClick={() => item.foto_produto_url && shareImageUrl(item.foto_produto_url)}
                                            >
                                                <IconPhoto className="size-4" />
                                                {fotos.length === 1
                                                    ? "Compartilhar Foto"
                                                    : `Compartilhar Foto ${index + 1}`}
                                            </button>
                                        ))}

                                    {manualDetail.foto_coroa_url && (
                                        <button
                                            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                            onClick={() => manualDetail.foto_coroa_url && shareImageUrl(manualDetail.foto_coroa_url)}
                                        >
                                            <IconPhoto className="size-4" />
                                            Compartilhar Foto Final
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 text-sm text-rose-600">
                                {manualDetailMsg || "Pedido não encontrado."}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Drawer online — mantém a experiência existente */}
            {open && (
                <div className="fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-0 h-full w-full overflow-auto bg-white shadow-xl md:max-w-xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <div className="text-sm text-muted-foreground">Pedido</div>
                                <div className="text-lg font-semibold">#{detail?.number || detail?.id || "—"}</div>
                            </div>
                            <button className="rounded-md p-2 hover:bg-muted" onClick={() => setOpen(false)}>
                                <IconX className="size-5" />
                            </button>
                        </div>

                        {!detail || detailLoading ? (
                            <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
                        ) : (
                            <div className="space-y-4 p-4">
                                {detailImage && (
                                    <div className="overflow-hidden rounded-lg border bg-white">
                                        <img src={detailImage} alt={detail.line_items?.[0]?.name || "Produto"} className="w-full object-cover" />
                                    </div>
                                )}
                                <div className="rounded-lg border p-3 text-sm leading-6">
                                    <div><b>Pedido:</b> {detail.line_items?.map((i) => i.name).filter(Boolean).join(", ") || `#${detail.number || detail.id}`}</div>
                                    <div><b>Origem:</b> Loja On-line</div>
                                    <div><b>Cliente:</b> {(detail.billing?.first_name || "") + " " + (detail.billing?.last_name || "")}</div>
                                    <div><b>Telefone:</b> {detail.billing?.phone || "—"}</div>
                                    <div><b>Valor:</b> {formatCurrency(detail.total, detail.currency || "BRL")}</div>
                                    <div><b>Local de Entrega:</b> {[detail.shipping?.address_1, detail.shipping?.address_2].filter(Boolean).join(" - ") || "—"}</div>
                                    <div>
                                        <b>Falecido(a):</b>{" "}
                                        {findMetaValue(detail.meta_data, ["shipping_falecido_nome", "falecido_nome", "nome_falecido", "nome_do_falecido"]) || detail.shipping?.first_name || "—"}
                                    </div>
                                    <div>
                                        <b>Frase da Coroa:</b>{" "}
                                        {findMetaValue(detail.meta_data, ["frase_para_a_faixa", "frase da coroa", "frase da faixa", "faixa", "mensagem"]) ||
                                            findMetaValue(detail.line_items?.flatMap((li) => li.meta_data || []), ["frase_para_a_faixa", "frase da coroa", "frase da faixa", "faixa", "mensagem"]) ||
                                            "—"}
                                    </div>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <span className={`w-fit rounded-full border px-2 py-0.5 text-xs ${clsWcStatusBadge(detail.status)}`}>
                                            {WC_STATUS_OPTIONS.find((s) => s.value === detail.status)?.label ?? detail.status}
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {(["processing", "completed", "cancelled", "on-hold"] as const).map((s) => (
                                                <button
                                                    key={s}
                                                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                                                    onClick={() => updateStatus(detail.id, s)}
                                                    disabled={updating || detail.status === s}
                                                >
                                                    <IconCheck className="size-4" />
                                                    {WC_STATUS_OPTIONS.find((o) => o.value === s)?.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        Criado em {formatDate(detail.date_created)} — Total <b>{formatCurrency(detail.total, detail.currency || "BRL")}</b>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm" onClick={copyDetailToClipboard}>
                                        <IconCopy className="size-4" /> {copied ? "Copiado!" : "Copiar Pedido"}
                                    </button>
                                    <button
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                                        onClick={() => detailImage && shareImageUrl(detailImage)}
                                        disabled={!detailImage}
                                    >
                                        <IconPhoto className="size-4" /> Compartilhar Foto
                                    </button>
                                    <button
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                                        onClick={() => detail && notifyWhatsApp(detail.id)}
                                        disabled={!canNotifyDetail}
                                        title={canNotifyDetail ? "Compartilhar mensagem" : "Só é possível notificar pedidos Concluídos."}
                                    >
                                        <IconSend className="size-4" /> Notificar (WhatsApp)
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
