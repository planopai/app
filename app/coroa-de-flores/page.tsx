"use client";

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
const MATERIAIS_API = "https://api.planoassistencialintegrado.com.br/materiais_gerais.php";
const API_PUBLIC_BASE = "https://api.planoassistencialintegrado.com.br";

/* =========================================================
   PEDIDOS MANUAIS
   ========================================================= */
type ManualStatus = "novo" | "coroa" | "faixa" | "finalizada" | "entregue";
type ManualPagamento = "pago" | "aguardando_pagamento";
type ManualOrigem =
    | "ordem_servico"
    | "venda_direta_colaborador"
    | "venda_direta_escritorio"
    | "venda_direta_memorial";

type ManualCoroaItem = {
    id?: number;
    coroa_id?: number;
    ordem: number;
    tipo_coroa?: "natural" | "artificial" | null;
    produto_id?: number | null;
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
    quantidade_coroas?: number;
    itens?: ManualCoroaItem[];
    modelo_coroa: string;
    frase: string;
    falecido: string;
    falecido_atendimento_id?: number | null;
    status_pagamento: ManualPagamento;
    origem: ManualOrigem;
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
    status?: string;
    assistencia?: string;
    tanato?: string;
    ornamentacao?: string;
    tipo_atendimento?: string;
};

type CoroaTipo = "" | "natural" | "artificial";

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
    produto: EstoqueProduto | null;
    frase: string;
    frase_sugestao: string;
};

function criarNovoCoroaItem(): NovoCoroaItem {
    return {
        tipo_coroa: "",
        produto: null,
        frase: "",
        frase_sugestao: "",
    };
}

type EstoqueSaldo = {
    id?: number;
    produto_id: number;
    deposito_id?: number;
    quantidade: number;
};

type MateriaisInitResponse = {
    ok?: boolean;
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

const ORIGEM_OPTIONS: Array<{ value: ManualOrigem; label: string }> = [
    { value: "ordem_servico", label: "Ordem de Serviço" },
    { value: "venda_direta_colaborador", label: "Venda Direta Colaborador" },
    { value: "venda_direta_escritorio", label: "Venda Direta Escritório" },
    { value: "venda_direta_memorial", label: "Venda Direta Memorial" },
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
    return ORIGEM_OPTIONS.find((x) => x.value === v)?.label || v || "—";
}

function proximoStatusManual(status: ManualStatus): ManualStatus | null {
    if (status === "novo") return "coroa";
    if (status === "coroa") return "faixa";
    if (status === "faixa") return "finalizada";
    if (status === "finalizada") return "entregue";
    return null;
}

function proximaAcaoLabel(status: ManualStatus) {
    const next = proximoStatusManual(status);
    if (next === "coroa") return "Coroa — Início de Confecção";
    if (next === "faixa") return "Faixa — Início de Confecção";
    if (next === "finalizada") return "Finalizada";
    if (next === "entregue") return "Entregue";
    return "Fluxo concluído";
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
    return order?.comprovante_url ? "Pago" : "Aguardando Comprovante";
}

function pagamentoAutomaticoClass(order?: ManualOrder | null) {
    return order?.comprovante_url
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
        order.falecido,
        origemLabel(order.origem),
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
        `*Origem:* ${origemLabel(order.origem)}`,
        `*Cliente:* ${order.solicitante || "—"}`,
        `*Telefone:* ${onlyDigits(order.telefone) || order.telefone || "—"}`,
        `*Valor:* ${total > 0 ? dinheiroBRL(total) : "—"}`,
        `*Local de Entrega:* ${order.local_entrega || "—"}`,
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

async function fileToDataUrl(file: File): Promise<string> {
    if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem válido.");
    if (file.size > 8 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 8 MB.");
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
        reader.readAsDataURL(file);
    });
}

async function comprovanteToDataUrl(file: File): Promise<string> {
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

    if (file.size > 15 * 1024 * 1024) {
        throw new Error("O comprovante deve ter no máximo 15 MB.");
    }

    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Não foi possível ler o comprovante."));
        reader.readAsDataURL(file);
    });
}

function ImageUploadButtons({
    disabled,
    onFile,
}: {
    disabled?: boolean;
    onFile: (file: File) => Promise<void> | void;
}) {
    const galleryRef = React.useRef<HTMLInputElement>(null);
    const cameraRef = React.useRef<HTMLInputElement>(null);

    const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.currentTarget.value = "";
        if (!file) return;
        await onFile(file);
    };

    return (
        <div className="flex flex-wrap gap-2">
            <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handle} />
            <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handle}
            />
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
                onClick={() => cameraRef.current?.click()}
            >
                <IconCamera className="size-4" />
                Tirar foto
            </button>
        </div>
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
    const cameraRef = React.useRef<HTMLInputElement>(null);

    const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.currentTarget.value = "";
        if (!file) return;
        await onFile(file);
    };

    return (
        <div className="flex flex-wrap gap-2">
            <input
                ref={arquivoRef}
                type="file"
                accept="image/*,application/pdf,.pdf"
                className="hidden"
                onChange={handle}
            />
            <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
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
                onClick={() => cameraRef.current?.click()}
            >
                <IconCamera className="size-4" />
                Tirar foto
            </button>
        </div>
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

    /* -------------------------
       Falecidos no quadro
       ------------------------- */
    const [falecidosQuadro, setFalecidosQuadro] = React.useState<AtendimentoResumo[]>([]);
    const [falecidosLoading, setFalecidosLoading] = React.useState(false);
    const [falecidosError, setFalecidosError] = React.useState<string | null>(null);

    const carregarFalecidosQuadro = React.useCallback(async () => {
        setFalecidosLoading(true);
        setFalecidosError(null);

        try {
            const res = await fetch(`${ATENDIMENTOS_API}&_ts=${Date.now()}`, {
                cache: "no-store",
                credentials: "include",
                headers: { Accept: "application/json" },
            });

            if (!res.ok) {
                throw new Error(`Não foi possível consultar o quadro de atendimentos (${res.status}).`);
            }

            const json = await res.json();
            const rows = Array.isArray(json) ? (json as AtendimentoResumo[]) : [];

            const ativos = rows
                .filter(atendimentoEstaNoQuadro)
                .filter((r) => String(r.falecido || "").trim() !== "");

            // Evita nomes duplicados no seletor.
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
        } catch (e: any) {
            setFalecidosQuadro([]);
            setFalecidosError(e?.message || "Erro ao consultar os falecidos do quadro.");
        } finally {
            setFalecidosLoading(false);
        }
    }, []);

    React.useEffect(() => {
        void carregarFalecidosQuadro();

        // Mantém a relação sincronizada com o quadro de atendimentos.
        const id = window.setInterval(() => {
            void carregarFalecidosQuadro();
        }, 8000);

        return () => window.clearInterval(id);
    }, [carregarFalecidosQuadro]);

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
    const [modeloItemIndex, setModeloItemIndex] = React.useState<number | null>(null);

    const saldoTotalPorProduto = React.useMemo(() => {
        const map = new Map<number, number>();

        for (const saldo of estoqueSaldos) {
            const produtoId = Number(saldo?.produto_id || 0);
            if (produtoId <= 0) continue;

            const quantidade = Math.max(0, Number(saldo?.quantidade || 0));
            map.set(produtoId, (map.get(produtoId) || 0) + quantidade);
        }

        return map;
    }, [estoqueSaldos]);

    const modelosDisponiveis = React.useMemo(() => {
        const busca = normalizarTextoEstoque(modeloBusca);

        return estoqueProdutos
            .filter((produto) => Number(produto?.ativo ?? 1) === 1)
            .filter((produto) => {
                if (modeloTipo === "natural") {
                    // Coroas naturais aparecem mesmo com estoque zerado.
                    return categoriaEhCoroaNatural(produto.categoria_nome);
                }

                if (modeloTipo === "artificial") {
                    // Coroas artificiais somente aparecem quando existe saldo positivo
                    // somando todos os depósitos do estoque.
                    return (
                        categoriaEhCoroaArtificial(produto.categoria_nome) &&
                        (saldoTotalPorProduto.get(Number(produto.id)) || 0) > 0
                    );
                }

                return false;
            })
            .filter((produto) => {
                if (!busca) return true;

                return (
                    normalizarTextoEstoque(produto.nome).includes(busca) ||
                    normalizarTextoEstoque(produto.codigo_barras).includes(busca)
                );
            })
            .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
    }, [estoqueProdutos, saldoTotalPorProduto, modeloTipo, modeloBusca]);

    const carregarModelosCoroa = React.useCallback(async () => {
        setModeloLoading(true);
        setModeloError(null);

        try {
            const url = new URL(MATERIAIS_API, window.location.origin);
            url.searchParams.set("init", "1");
            url.searchParams.set("_ts", String(Date.now()));

            const res = await fetch(url.toString(), {
                method: "GET",
                cache: "no-store",
                credentials: "include",
                headers: { Accept: "application/json" },
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
        } catch (e: any) {
            setModeloError(e?.message || "Erro ao carregar os modelos de coroas.");
            setEstoqueProdutos([]);
            setEstoqueSaldos([]);
        } finally {
            setModeloLoading(false);
        }
    }, []);

    function abrirSeletorModelo(itemIndex: number, tipo: CoroaTipo) {
        setModeloItemIndex(itemIndex);
        setModeloTipo(tipo);
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
    const [manualOrders, setManualOrders] = React.useState<ManualOrder[]>([]);
    const [manualLoading, setManualLoading] = React.useState(false);
    const [manualError, setManualError] = React.useState<string | null>(null);

    // Confecção: novo, coroa e faixa.
    const [confeccaoQ, setConfeccaoQ] = React.useState("");
    const [confeccaoStatusFilter, setConfeccaoStatusFilter] = React.useState<"todos" | "novo" | "coroa" | "faixa">("todos");
    const [confeccaoPage, setConfeccaoPage] = React.useState(1);
    const confeccaoPerPage = 30;

    // Pedidos Manuais: histórico a partir de Finalizada.
    const [manualQ, setManualQ] = React.useState("");
    const [manualStatusFilter, setManualStatusFilter] = React.useState<"todos" | "finalizada" | "entregue">("todos");
    const [manualAfter, setManualAfter] = React.useState("");
    const [manualBefore, setManualBefore] = React.useState("");
    const [manualPage, setManualPage] = React.useState(1);
    const [manualPerPage, setManualPerPage] = React.useState(20);

    const fetchManualOrders = React.useCallback(async () => {
        setManualLoading(true);
        setManualError(null);

        try {
            const todos: ManualOrder[] = [];
            let pagina = 1;
            let totalPages = 1;

            do {
                const u = new URL(COROAS_API, window.location.origin);
                u.searchParams.set("listar", "1");
                u.searchParams.set("page", String(pagina));
                u.searchParams.set("per_page", "100");
                u.searchParams.set("_ts", String(Date.now()));

                const res = await fetch(u.toString(), {
                    cache: "no-store",
                    credentials: "include",
                });
                const json: ManualListResponse = await res.json().catch(() => ({ sucesso: false, dados: [] }));

                if (!res.ok || !json?.sucesso) {
                    throw new Error(json?.msg || `Falha ao carregar pedidos (${res.status}).`);
                }

                todos.push(...(Array.isArray(json.dados) ? json.dados : []));
                totalPages = Math.max(1, Number(json.meta?.total_pages || 1));
                pagina += 1;
            } while (pagina <= totalPages && pagina <= 500);

            // Evita duplicados e mantém os mais recentes primeiro.
            const unicos = Array.from(new Map(todos.map((pedido) => [Number(pedido.id), pedido])).values())
                .sort((a, b) => Number(b.id) - Number(a.id));

            setManualOrders(unicos);
        } catch (e: any) {
            setManualOrders([]);
            setManualError(e?.message || "Erro ao carregar pedidos manuais.");
        } finally {
            setManualLoading(false);
        }
    }, []);

    React.useEffect(() => {
        if (tab === "online") return;
        void fetchManualOrders();
    }, [tab, fetchManualOrders]);

    React.useEffect(() => {
        const onFocus = () => {
            if (tab !== "online") void fetchManualOrders();
        };
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [tab, fetchManualOrders]);

    const confeccaoFiltrada = React.useMemo(() => {
        return manualOrders
            .filter((pedido) => ["novo", "coroa", "faixa"].includes(pedido.status))
            .filter((pedido) => confeccaoStatusFilter === "todos" || pedido.status === confeccaoStatusFilter)
            .filter((pedido) => manualMatchesQuery(pedido, confeccaoQ));
    }, [manualOrders, confeccaoStatusFilter, confeccaoQ]);

    const confeccaoTotalPages = Math.max(1, Math.ceil(confeccaoFiltrada.length / confeccaoPerPage));
    const confeccaoOrders = React.useMemo(() => {
        const page = Math.min(confeccaoPage, confeccaoTotalPages);
        const inicio = (page - 1) * confeccaoPerPage;
        return confeccaoFiltrada.slice(inicio, inicio + confeccaoPerPage);
    }, [confeccaoFiltrada, confeccaoPage, confeccaoTotalPages]);

    const manualHistoricoFiltrado = React.useMemo(() => {
        return manualOrders
            .filter((pedido) => pedido.status === "finalizada" || pedido.status === "entregue")
            .filter((pedido) => manualStatusFilter === "todos" || pedido.status === manualStatusFilter)
            .filter((pedido) => manualMatchesQuery(pedido, manualQ))
            .filter((pedido) => manualDateInRange(pedido, manualAfter, manualBefore));
    }, [manualOrders, manualStatusFilter, manualQ, manualAfter, manualBefore]);

    const manualTotalPages = Math.max(1, Math.ceil(manualHistoricoFiltrado.length / manualPerPage));
    const manualHistoricoOrders = React.useMemo(() => {
        const page = Math.min(manualPage, manualTotalPages);
        const inicio = (page - 1) * manualPerPage;
        return manualHistoricoFiltrado.slice(inicio, inicio + manualPerPage);
    }, [manualHistoricoFiltrado, manualPage, manualPerPage, manualTotalPages]);

    React.useEffect(() => {
        setConfeccaoPage(1);
    }, [confeccaoQ, confeccaoStatusFilter]);

    React.useEffect(() => {
        setManualPage(1);
    }, [manualQ, manualStatusFilter, manualAfter, manualBefore, manualPerPage]);

    /* -------------------------
       Manual: novo pedido
       ------------------------- */
    const [newOpen, setNewOpen] = React.useState(false);
    const [newSaving, setNewSaving] = React.useState(false);
    const [newError, setNewError] = React.useState<string | null>(null);
    const [newFalecidoSugestao, setNewFalecidoSugestao] = React.useState("");
    const [quantidadeCoroas, setQuantidadeCoroas] = React.useState(1);
    const [newItems, setNewItems] = React.useState<NovoCoroaItem[]>([criarNovoCoroaItem()]);
    const [newComprovante, setNewComprovante] = React.useState<File | null>(null);
    const [newForm, setNewForm] = React.useState({
        solicitante: "",
        telefone: "",
        local_entrega: "",
        falecido: "",
        origem: "ordem_servico" as ManualOrigem,
    });

    function resetNewForm() {
        setNewForm({
            solicitante: "",
            telefone: "",
            local_entrega: "",
            falecido: "",
            origem: "ordem_servico",
        });
        setQuantidadeCoroas(1);
        setNewItems([criarNovoCoroaItem()]);
        setNewComprovante(null);
        setNewFalecidoSugestao("");
        setModeloTipo("");
        setModeloItemIndex(null);
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

            if (!item.produto?.id || !String(item.produto?.nome || "").trim()) {
                setNewError(`Selecione o modelo da Coroa ${i + 1}.`);
                return;
            }

            if (!item.frase.trim()) {
                setNewError(`Preencha a frase da Coroa ${i + 1}.`);
                return;
            }
        }

        // Se o nome digitado coincidir com alguém que está no quadro,
        // guarda também o ID do atendimento. Caso contrário, permanece livre.
        const match = falecidosQuadro.find(
            (r) =>
                String(r.falecido || "").trim().toLocaleLowerCase("pt-BR") ===
                newForm.falecido.trim().toLocaleLowerCase("pt-BR"),
        );

        setNewSaving(true);

        try {
            let comprovante_base64 = "";
            if (newComprovante) {
                comprovante_base64 = await comprovanteToDataUrl(newComprovante);
            }

            const payload = {
                acao: "novo",
                solicitante: newForm.solicitante.trim(),
                telefone: newForm.telefone.trim(),
                local_entrega: newForm.local_entrega.trim(),
                quantidade_coroas: quantidadeCoroas,
                itens: newItems.map((item, index) => ({
                    ordem: index + 1,
                    tipo_coroa: item.tipo_coroa,
                    produto_id: Number(item.produto?.id || 0),
                    modelo_coroa: String(item.produto?.nome || "").trim(),
                    frase: item.frase.trim(),
                    valor: Number(item.produto?.valor || 0),
                    foto_produto_url: fotoPrincipalProduto(item.produto),
                })),
                falecido: newForm.falecido.trim(),
                falecido_atendimento_id: match?.id ? Number(match.id) || null : null,
                status_pagamento: newComprovante ? "pago" : "aguardando_pagamento",
                origem: newForm.origem,
                ...(newComprovante
                    ? {
                        comprovante_base64,
                        comprovante_nome: newComprovante.name,
                        comprovante_mime: newComprovante.type || "",
                    }
                    : {}),
            };

            const res = await fetch(COROAS_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.sucesso) {
                throw new Error(json?.msg || "Não foi possível criar o pedido.");
            }

            setNewOpen(false);
            resetNewForm();
            setManualPage(1);
            await fetchManualOrders();
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

    async function carregarManualDetail(id: number) {
        setManualDetailLoading(true);
        setManualDetailMsg(null);

        try {
            const res = await fetch(`${COROAS_API}?id=${encodeURIComponent(String(id))}&_ts=${Date.now()}`, {
                cache: "no-store",
                credentials: "include",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.sucesso) {
                throw new Error(json?.msg || "Não foi possível carregar o pedido.");
            }
            setManualDetail(json.dado as ManualOrder);
            return json.dado as ManualOrder;
        } catch (e: any) {
            setManualDetail(null);
            setManualDetailMsg(e?.message || "Erro ao carregar pedido.");
            return null;
        } finally {
            setManualDetailLoading(false);
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
        const res = await fetch(COROAS_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
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
            const base64 = await comprovanteToDataUrl(file);
            await postManual({
                acao: "anexar_comprovante",
                id: manualDetail.id,
                base64,
                comprovante_nome: file.name,
                comprovante_mime: file.type || "",
            });
            await postManual({
                acao: "atualizar_pagamento",
                id: manualDetail.id,
                status_pagamento: "pago",
            });
            await carregarManualDetail(manualDetail.id);
            await fetchManualOrders();
        } catch (e: any) {
            setManualDetailMsg(e?.message || "Não foi possível anexar o comprovante.");
        } finally {
            setManualActionLoading(false);
        }
    }


    function rankStatusManual(status: ManualStatus) {
        const rank: Record<ManualStatus, number> = {
            novo: 0,
            coroa: 1,
            faixa: 2,
            finalizada: 3,
            entregue: 4,
        };
        return rank[status];
    }

    async function executarStatusManual(target: Exclude<ManualStatus, "novo">) {
        if (!manualDetail) return;

        const next = proximoStatusManual(manualDetail.status);
        if (next !== target) return;

        if (!window.confirm(`Confirmar a ação “${proximaAcaoLabel(manualDetail.status)}”?`)) {
            return;
        }

        setManualActionLoading(true);
        setManualDetailMsg(null);

        try {
            await postManual({
                acao: "atualizar_status",
                id: manualDetail.id,
                status: target,
            });
            await carregarManualDetail(manualDetail.id);
            await fetchManualOrders();
        } catch (e: any) {
            setManualDetailMsg(e?.message || "Não foi possível registrar a ação.");
        } finally {
            setManualActionLoading(false);
        }
    }

    function clicarAcaoManual(target: Exclude<ManualStatus, "novo">) {
        if (!manualDetail) return;

        const next = proximoStatusManual(manualDetail.status);
        if (next !== target) return;

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
        if (!file.type.startsWith("image/")) {
            setFinalizarError("Selecione uma imagem válida.");
            return;
        }

        if (file.size > 8 * 1024 * 1024) {
            setFinalizarError("A imagem deve ter no máximo 8 MB.");
            return;
        }

        limparPreviewFinalizacao();
        setFinalizarFile(file);
        setFinalizarPreview(URL.createObjectURL(file));
        setFinalizarError(null);
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
            const base64 = await fileToDataUrl(finalizarFile);

            await postManual({
                acao: "atualizar_status",
                id: manualDetail.id,
                status: "finalizada",
                foto_coroa_base64: base64,
            });

            setFinalizarOpen(false);
            setFinalizarFile(null);
            limparPreviewFinalizacao();
            setManualPanel(null);

            await carregarManualDetail(manualDetail.id);
            await fetchManualOrders();
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

    const fetchOrders = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const u = new URL("/api/wc/orders", window.location.origin);
            u.searchParams.set("page", String(page));
            u.searchParams.set("per_page", String(perPage));
            if (q.trim()) u.searchParams.set("search", q.trim());
            if (wcStatus !== "all") u.searchParams.set("status", wcStatus);
            if (after) u.searchParams.set("after", new Date(after).toISOString());
            if (before) {
                const d = new Date(before);
                d.setHours(23, 59, 59, 999);
                u.searchParams.set("before", d.toISOString());
            }
            const res = await fetch(u.toString(), { cache: "no-store" });
            if (!res.ok) throw new Error(`Falha ao buscar pedidos (${res.status})`);
            const json: OrdersResponse = await res.json();
            setOrders(json.data);
            setMeta(json.meta);
        } catch (e: any) {
            setError(e?.message || "Erro ao carregar pedidos");
        } finally {
            setLoading(false);
        }
    }, [page, perPage, q, wcStatus, after, before]);

    React.useEffect(() => {
        if (tab !== "online") return;
        fetchOrders();
    }, [tab, page, perPage, fetchOrders]);

    async function openDetail(id: number) {
        setDetail(null);
        setDetailImage(null);
        setCopied(false);
        setOpen(true);
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/wc/orders/${id}`, { cache: "no-store" });
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
                        const pr = await fetch(url, { cache: "no-store" });
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
            await fetchOrders();
            if (detail?.id === id) await openDetail(id);
        } catch (e: any) {
            alert(e?.message || "Não foi possível atualizar o status.");
        } finally {
            setUpdating(false);
        }
    }

    async function notifyWhatsApp(orderId: number) {
        try {
            const res = await fetch(`/api/wc/orders/${orderId}`, { cache: "no-store" });
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
                            setConfeccaoPage(1);
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
                                    onChange={(e) => setConfeccaoStatusFilter(e.target.value as "todos" | "novo" | "coroa" | "faixa")}
                                    className="w-full rounded-md border bg-background px-2 py-2 text-sm outline-none"
                                >
                                    <option value="todos">Todos</option>
                                    <option value="novo">Aguardando Confecção</option>
                                    <option value="coroa">Coroa em Confecção</option>
                                    <option value="faixa">Faixa em Confecção</option>
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
                            {confeccaoOrders.map((o) => (
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
                                        <span className="rounded-full border px-2 py-0.5 text-[10px]">{origemLabel(o.origem)}</span>
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

                            {!manualLoading && confeccaoOrders.length === 0 && (
                                <div className="py-6 text-center text-sm text-muted-foreground">
                                    Nenhum pedido em confecção.
                                </div>
                            )}
                            {manualLoading && <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>}
                            {manualError && <div className="text-sm text-rose-600">{manualError}</div>}
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
                                        {confeccaoOrders.map((o) => (
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
                                                <td className="px-3 py-2">{origemLabel(o.origem)}</td>
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
                                        {!manualLoading && confeccaoOrders.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                                                    Nenhum pedido em confecção.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                {manualLoading && <div className="py-5 text-center text-sm text-muted-foreground">Carregando…</div>}
                                {manualError && <div className="px-3 pb-3 text-sm text-rose-600">{manualError}</div>}
                            </div>
                            <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
                                <div>
                                    Página {Math.min(confeccaoPage, confeccaoTotalPages)} de {confeccaoTotalPages} — {confeccaoFiltrada.length} pedidos
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        className="rounded-md border px-2 py-1 disabled:opacity-50"
                                        disabled={confeccaoPage <= 1 || manualLoading}
                                        onClick={() => setConfeccaoPage((p) => Math.max(1, p - 1))}
                                    >
                                        Anterior
                                    </button>
                                    <button
                                        className="rounded-md border px-2 py-1 disabled:opacity-50"
                                        disabled={confeccaoPage >= confeccaoTotalPages || manualLoading}
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
                PEDIDOS MANUAIS — finalizados/entregues, sem Ações
                ===================================================== */}
            {tab === "manuais" && (
                <>
                    {/* Mesmos filtros do Online */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            setManualPage(1);
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
                                onChange={(e) => setManualStatusFilter(e.target.value as "todos" | "finalizada" | "entregue")}
                            >
                                <option value="todos">Todos</option>
                                <option value="finalizada">Finalizada</option>
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
                                    setManualPage(1);
                                }}
                            >
                                Limpar
                            </button>
                        </div>
                    </form>

                    {/* Manual histórico mobile */}
                    <div className="px-4 pb-6 md:hidden lg:px-6">
                        <div className="space-y-3">
                            {manualHistoricoOrders.map((o) => (
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
                                        {manualHistoricoOrders.map((o) => (
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
                                    Página {Math.min(manualPage, manualTotalPages)} de {manualTotalPages} — {manualHistoricoFiltrado.length} pedidos
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
                            setPage(1);
                            fetchOrders();
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
                                    setPage(1);
                                }}
                            >
                                Limpar
                            </button>
                        </div>
                    </form>

                    {/* Online mobile */}
                    <div className="px-4 pb-6 md:hidden lg:px-6">
                        <div className="space-y-3">
                            {orders.map((o) => {
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
                                        {orders.map((o) => {
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
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">Solicitante *</label>
                                <input
                                    value={newForm.solicitante}
                                    onChange={(e) => setNewForm((p) => ({ ...p, solicitante: e.target.value }))}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    placeholder="Nome do cliente"
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
                                    placeholder="Telefone do cliente"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium">Local de Entrega *</label>
                                <input
                                    value={newForm.local_entrega}
                                    onChange={(e) => setNewForm((p) => ({ ...p, local_entrega: e.target.value }))}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    placeholder="Local da entrega"
                                />
                            </div>

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
                                                                produto: null,
                                                            });

                                                            if (tipo) {
                                                                abrirSeletorModelo(index, tipo);
                                                            }
                                                        }}
                                                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                                    >
                                                        <option value="">Selecione o tipo da coroa</option>
                                                        <option value="natural">Natural</option>
                                                        <option value="artificial">Artificial</option>
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="mb-1 block text-sm font-medium">Modelo *</label>

                                                    {produto ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => abrirSeletorModelo(index, item.tipo_coroa)}
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
                                                                <div className="text-xs text-muted-foreground">
                                                                    Coroa {rotuloTipoCoroa(item.tipo_coroa)}
                                                                </div>
                                                                <div className="line-clamp-2 font-semibold">
                                                                    {produto.nome}
                                                                </div>
                                                                <div className="mt-1 text-sm font-medium">
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
                                                            onClick={() => abrirSeletorModelo(index, item.tipo_coroa)}
                                                            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm hover:bg-muted/40"
                                                        >
                                                            <IconSearch className="size-4" />
                                                            Escolher modelo {rotuloTipoCoroa(item.tipo_coroa)}
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

                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">Atendimentos</label>
                                <select
                                    value={newFalecidoSugestao}
                                    onChange={(e) => {
                                        const nome = e.target.value;
                                        setNewFalecidoSugestao(nome);

                                        if (nome) {
                                            setNewForm((p) => ({ ...p, falecido: nome }));
                                        }
                                    }}
                                    className="mb-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    disabled={falecidosLoading && falecidosQuadro.length === 0}
                                >
                                    <option value="">
                                        {falecidosLoading
                                            ? "Consultando o quadro de atendimentos..."
                                            : "Selecione um atendimento"}
                                    </option>
                                    {falecidosQuadro.map((r) => (
                                        <option key={String(r.id || r.falecido)} value={String(r.falecido || "")}>
                                            {String(r.falecido || "")}
                                        </option>
                                    ))}
                                </select>

                                <label className="mb-1 block text-sm font-medium">Falecido(a) *</label>
                                <input
                                    value={newForm.falecido}
                                    onChange={(e) => {
                                        setNewFalecidoSugestao("");
                                        setNewForm((p) => ({ ...p, falecido: e.target.value }));
                                    }}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    placeholder="Digite o nome do falecido ou selecione um atendimento acima"
                                />

                                {falecidosError && (
                                    <div className="mt-1 text-xs text-rose-600">
                                        {falecidosError}
                                        <button
                                            type="button"
                                            className="ml-2 underline underline-offset-2"
                                            onClick={() => void carregarFalecidosQuadro()}
                                        >
                                            Tentar novamente
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium">Origem *</label>
                                <select
                                    value={newForm.origem}
                                    onChange={(e) => setNewForm((p) => ({ ...p, origem: e.target.value as ManualOrigem }))}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                >
                                    {ORIGEM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium">Comprovante</label>
                                <input
                                    type="file"
                                    accept="image/*,application/pdf,.pdf"
                                    onChange={(e) => setNewComprovante(e.target.files?.[0] || null)}
                                    className="block w-full rounded-md border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
                                />

                                {newComprovante && (
                                    <div className="mt-2 flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                                        <div className="min-w-0">
                                            <div className="truncate font-medium">{newComprovante.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {(newComprovante.size / 1024 / 1024).toFixed(2)} MB
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
                                    onClick={() => void carregarModelosCoroa()}
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
                                                    const saldo = saldoTotalPorProduto.get(Number(produto.id)) || 0;

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
                                            const saldo = saldoTotalPorProduto.get(Number(produto.id)) || 0;

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
                                    {([
                                        ["coroa", "Coroa"],
                                        ["faixa", "Faixa"],
                                        ["finalizada", "Finalizada"],
                                        ["entregue", "Entregue"],
                                    ] as const).map(([target, label]) => {
                                        const atual = rankStatusManual(manualDetail.status);
                                        const alvo = rankStatusManual(target);
                                        const concluida = atual >= alvo;
                                        const liberada = proximoStatusManual(manualDetail.status) === target;

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
                                <div className="text-lg font-semibold">Finalizar Coroa</div>
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

                            {finalizarPreview && (
                                <div className="overflow-hidden rounded-lg border bg-muted/20">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={finalizarPreview}
                                        alt="Prévia da coroa pronta"
                                        className="max-h-[55vh] w-full object-contain"
                                    />
                                </div>
                            )}

                            {finalizarFile && (
                                <div className="text-xs text-muted-foreground">
                                    {finalizarFile.name}
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
                                {manualActionLoading ? "Finalizando..." : "Confirmar Finalizada"}
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
                                <div className="text-sm text-muted-foreground">Pedido manual</div>
                                <div className="text-lg font-semibold">#{manualDetail?.id || "—"}</div>
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
                                    <div><b>Origem:</b> {origemLabel(manualDetail.origem)}</div>
                                    <div><b>Cliente:</b> {manualDetail.solicitante || "—"}</div>
                                    <div><b>Telefone:</b> {manualDetail.telefone || "—"}</div>
                                    <div><b>Valor:</b> {totalManual(manualDetail) > 0 ? dinheiroBRL(totalManual(manualDetail)) : "—"}</div>
                                    <div><b>Local de Entrega:</b> {manualDetail.local_entrega || "—"}</div>
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
                                            <ComprovanteUploadButtons
                                                disabled={manualActionLoading}
                                                onFile={anexarComprovanteManual}
                                            />
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
