"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

/**
 * PAGE ÚNICA (page.tsx) — CATÁLOGO + ORÇAMENTOS (com fluxo de "Homenagem")
 *
 * ALTERAÇÕES IMPLEMENTADAS (resumo):
 * 1) Home -> "ELEMENTOS DE HOMENAGEM" abre modal de seleção de Usuário (Operador) via pai_api.php?action=list_users
 * 2) Após selecionar Operador, abre modal "Início da Homenagem" (Responsável/Falecido/Telefone)
 *    - Telefone com teclado numérico (inputMode="numeric")
 *    - Botões: Cancelar / Começar
 * 3) Somente após "Começar" o usuário entra no catálogo (categorias/linhas/produtos)
 * 4) Mesmo item NÃO pode ser adicionado 2x (botão + bloqueia duplicado)
 * 5) No detalhe do produto:
 *    - Remove "PÁGINA DE APRESENTAÇÃO DO PRODUTO"
 *    - Título vira "Linha: <LINHA>" (se houver linha)
 *    - Mostra botões "Retornar" e "Próximo Passo" (ou "Concluir" na última categoria)
 *    - Pode avançar sem selecionar itens
 * 6) "Próximo Passo" navega automaticamente pelas categorias:
 *    URNAS -> APRESENTAÇÃO -> ESPAÇO DE DESPEDIDA -> PREPARAÇÃO E CUIDADO -> AMBIENTAÇÃO -> CUIDADOS ADICIONAIS
 * 7) Ao "Concluir" (ou ✅ no topo), abre modal de revisão com itens agrupados por categoria e botão "Finalizar"
 *    -> Ao finalizar, cria Orçamento e vai para Lista de Orçamentos
 * 8) Removidos textos de "Itens/Total" fora das telas/ações próprias (não aparece em Elementos nem no detalhe)
 * 9) Resumo da Homenagem (UI):
 *    - Logo no canto superior esquerdo ao lado de "ORÇAMENTO" e "Nº ..."
 *    - Remove botão Exportar CSV
 *    - Topo com botões: Voltar (lista) + ✅ + PDF
 * 10) PDF:
 *    - Logo no canto superior esquerdo
 *    - Título "Resumo da Homenagem"
 *    - Abaixo: Nº do orçamento
 *    - Depois: Responsável / Falecido(a) / Telefone
 */

type CatalogGroup =
    | "home"
    | "elementos"
    | "urnas_linhas"
    | "listagem"
    | "detalhe"
    | "orcamentos"
    | "resumo";

type CategoriaFluxo =
    | "URNAS"
    | "APRESENTACAO"
    | "ESPACO_DESPEDIDA"
    | "PREPARACAO_CUIDADO"
    | "AMBIENTACAO"
    | "CUIDADOS_ADICIONAIS";

type Linha =
    | "SERENIDADE"
    | "HARMONIA"
    | "ESSENCIA"
    | "ETERNUM"
    | "ALVORADA"
    | "AMPARO";

type Produto = {
    id: number;
    categoria: CategoriaFluxo;
    linha?: Linha;
    nome: string;
    preco: number;
    saldo: number;
    thumb: string;
    descricaoCurta: string;
    inspiracao: string;
    conceito: string;
    especificacoes: string;
};

type OrcamentoItem = {
    produtoId: number;
    nome: string;
    categoria: CategoriaFluxo;
    linha?: Linha;
    valorUnit: number;
    qtd: number;
};

type Orcamento = {
    id: string;
    criadoEmISO: string;

    // operador escolhido no início:
    operadorId: number;
    operadorNome: string;
    operadorUsuario: string;

    // dados da homenagem:
    responsavel: string;
    falecido: string;
    telefone: string;

    itens: OrcamentoItem[];
};

type Usuario = { id: number; nome: string; usuario: string };

const API_URL = "https://api.planoassistencialintegrado.com.br/pai_api.php";

const BG_IMAGE = "https://pai.planoassistencialintegrado.com.br/catalogo.png";
const LOGO_URL_UI = "https://pai.planoassistencialintegrado.com.br/logo.png";
const LOGO_URL_PDF = "https://pai.planoassistencialintegrado.com.br/logo.png";

// ---------- helpers UI ----------
function cn(...parts: Array<string | false | null | undefined>) {
    return parts.filter(Boolean).join(" ");
}
function formatBRL(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function clampInt(v: any) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}

// ---------- parser robusto (tolera BOM/HTML) ----------
async function safeJsonFetch(input: RequestInfo, init?: RequestInit & { timeoutMs?: number }) {
    const timeoutMs = init?.timeoutMs ?? 15000;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
        const { timeoutMs: _omit, ...rest } = init || {};
        const r = await fetch(input, { cache: "no-store", signal: ctrl.signal, ...rest });
        const txt = await r.text();
        const cleaned = txt.replace(/^\uFEFF/, "").trim();
        let json: any = null;

        if (!cleaned.startsWith("<")) {
            try {
                json = JSON.parse(cleaned);
            } catch {
                const m = cleaned.match(/\{[\s\S]*\}$/m);
                if (m) json = JSON.parse(m[0]);
            }
        }

        if (json == null)
            throw new Error(
                `Resposta não-JSON do backend:\n${cleaned.slice(0, 300)}${cleaned.length > 300 ? "…" : ""
                }`
            );
        if (!r.ok || json?.erro)
            throw new Error(json?.erro || json?.msg || `HTTP ${r.status}`);
        return json;
    } catch (e: any) {
        if (e?.name === "AbortError") {
            throw new Error("Tempo esgotado ao conectar com o servidor. Tente novamente.");
        }
        throw e;
    } finally {
        clearTimeout(t);
    }
}

// ---------- mock images (data-uri) ----------
function mockImg(label: string, hue = 200) {
    const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="900" height="520">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="hsl(${hue} 80% 55%)"/>
        <stop offset="1" stop-color="hsl(${hue + 40} 80% 35%)"/>
      </linearGradient>
      <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="rgba(0,0,0,0.35)"/>
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <g filter="url(#s)">
      <rect x="85" y="120" rx="18" ry="18" width="730" height="280" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.25)"/>
      <text x="450" y="260" font-family="Arial" font-size="46" fill="rgba(255,255,255,0.95)" text-anchor="middle" font-weight="700">${label}</text>
      <text x="450" y="315" font-family="Arial" font-size="20" fill="rgba(255,255,255,0.9)" text-anchor="middle">Imagem fictícia • Catálogo PAI</text>
    </g>
  </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---------- fluxo/categorias ----------
const CATEGORIAS_FLUXO: Array<{ id: CategoriaFluxo; label: string }> = [
    { id: "URNAS", label: "URNAS" },
    { id: "APRESENTACAO", label: "APRESENTAÇÃO" },
    { id: "ESPACO_DESPEDIDA", label: "ESPAÇO DE\nDESPEDIDA" },
    { id: "PREPARACAO_CUIDADO", label: "PREPARAÇÃO E\nCUIDADO" },
    { id: "AMBIENTACAO", label: "AMBIENTAÇÃO" },
    { id: "CUIDADOS_ADICIONAIS", label: "CUIDADOS\nADICIONAIS" },
];

const LINHAS: Array<{ id: Linha; title: string }> = [
    { id: "SERENIDADE", title: "LINHA\nSERENIDADE" },
    { id: "HARMONIA", title: "LINHA\nHARMONIA" },
    { id: "ESSENCIA", title: "LINHA\nESSENCIA" },
    { id: "ETERNUM", title: "LINHA\nETERNUM" },
    { id: "ALVORADA", title: "LINHA\nALVORADA" },
    { id: "AMPARO", title: "LINHA\nAMPARO" },
];

// ---------- mock produtos (para todas as categorias do fluxo) ----------
const mockProdutos: Produto[] = [
    // URNAS (com linha)
    {
        id: 101,
        categoria: "URNAS",
        linha: "SERENIDADE",
        nome: "Urna Serenidade Zeus",
        preco: 1890,
        saldo: 8,
        thumb: mockImg("URNA ZEUS", 26),
        descricaoCurta: "Uma urna sóbria e sofisticada para homenagens memoráveis.",
        inspiracao: "O nome Zeus remete a uma presença soberana e única, evocando força e dignidade na despedida.",
        conceito: "Pensada para famílias que buscam a máxima homenagem possível, com acabamento premium e estética marcante.",
        especificacoes:
            "Madeira nobre • acabamento acetinado • detalhes em textura • alças discretas • forração interna premium.",
    },
    {
        id: 102,
        categoria: "URNAS",
        linha: "SERENIDADE",
        nome: "Urna Serenidade Aurora",
        preco: 1490,
        saldo: 4,
        thumb: mockImg("URNA AURORA", 32),
        descricaoCurta: "Equilíbrio e beleza em linhas suaves e acabamento elegante.",
        inspiracao: "Aurora representa novos começos e serenidade, como um amanhecer de paz.",
        conceito: "Design harmônico e acolhedor para uma despedida com respeito e tranquilidade.",
        especificacoes:
            "MDF premium • pintura especial • detalhes em frisos • forração interna • fecho reforçado.",
    },
    {
        id: 201,
        categoria: "URNAS",
        linha: "HARMONIA",
        nome: "Urna Harmonia Nobre",
        preco: 2090,
        saldo: 2,
        thumb: mockImg("URNA NOBRE", 55),
        descricaoCurta: "Acabamento refinado com presença discreta e imponente.",
        inspiracao: "Harmonia é equilíbrio: forma e função em um produto de alta qualidade.",
        conceito: "Criada para quem deseja uma homenagem com estética clássica e materiais selecionados.",
        especificacoes:
            "Madeira maciça • verniz fosco • cantos arredondados • forração interna • suporte de alças.",
    },
    // APRESENTAÇÃO
    {
        id: 1001,
        categoria: "APRESENTACAO",
        nome: "Véu de Apresentação Clássico",
        preco: 120,
        saldo: 50,
        thumb: mockImg("APRESENTAÇÃO", 160),
        descricaoCurta: "Véu discreto e elegante para apresentação.",
        inspiracao: "Sutileza e respeito em cada detalhe.",
        conceito: "Complemento pensado para cerimônias com estética tradicional.",
        especificacoes: "Tecido leve • acabamento fino • tamanho padrão.",
    },
    {
        id: 1002,
        categoria: "APRESENTACAO",
        nome: "Arranjo Floral (mock)",
        preco: 180,
        saldo: 20,
        thumb: mockImg("ARRANJO", 168),
        descricaoCurta: "Arranjo floral simbólico (mock).",
        inspiracao: "Uma homenagem visual delicada.",
        conceito: "Peça complementar para cerimônia.",
        especificacoes: "Composição mista • base simples • montagem rápida.",
    },
    // ESPAÇO DE DESPEDIDA
    {
        id: 2001,
        categoria: "ESPACO_DESPEDIDA",
        nome: "Kit Velas Cerimoniais",
        preco: 90,
        saldo: 60,
        thumb: mockImg("VELAS", 210),
        descricaoCurta: "Kit com velas para ambientação do espaço.",
        inspiracao: "Luz como símbolo de memória.",
        conceito: "Acompanha cerimônias em espaço de despedida.",
        especificacoes: "6 unidades • suporte simples.",
    },
    // PREPARAÇÃO E CUIDADO
    {
        id: 3001,
        categoria: "PREPARACAO_CUIDADO",
        nome: "Preparação Básica (mock)",
        preco: 300,
        saldo: 999,
        thumb: mockImg("PREPARO", 120),
        descricaoCurta: "Serviço de preparação (mock).",
        inspiracao: "Cuidado e dignidade.",
        conceito: "Etapa de preparação para cerimônia.",
        especificacoes: "Procedimento padrão • equipe especializada (mock).",
    },
    // AMBIENTAÇÃO
    {
        id: 4001,
        categoria: "AMBIENTACAO",
        nome: "Ambientação Suave (mock)",
        preco: 220,
        saldo: 999,
        thumb: mockImg("AMBIENTAÇÃO", 90),
        descricaoCurta: "Ambientação com elementos suaves (mock).",
        inspiracao: "Conforto e serenidade.",
        conceito: "Complemento para o clima da cerimônia.",
        especificacoes: "Itens decorativos • montagem simples.",
    },
    // CUIDADOS ADICIONAIS
    {
        id: 5001,
        categoria: "CUIDADOS_ADICIONAIS",
        nome: "Cuidados Adicionais (mock)",
        preco: 140,
        saldo: 999,
        thumb: mockImg("CUIDADOS", 260),
        descricaoCurta: "Serviços adicionais (mock).",
        inspiracao: "Atenção aos detalhes.",
        conceito: "Complemento conforme necessidade.",
        especificacoes: "Pacote flexível (mock).",
    },
];

// ---------- icons ----------
function IconBack({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M10 7L5 12L10 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 12H20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}
function IconHome({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 10.5L12 4L20 10.5V20H4V10.5Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M9.5 20V14H14.5V20" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
    );
}
function IconList({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 6H21M7 12H21M7 18H21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M3 6H3.01M3 12H3.01M3 18H3.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}
function IconSearch({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M10.5 18.5C14.6421 18.5 18 15.1421 18 11C18 6.85786 14.6421 3.5 10.5 3.5C6.35786 3.5 3 6.85786 3 11C3 15.1421 6.35786 18.5 10.5 18.5Z" stroke="currentColor" strokeWidth="2.2" />
            <path d="M20.5 20.5L16.8 16.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}
function IconChevron({ dir }: { dir: "left" | "right" }) {
    const rotate = dir === "left" ? "180deg" : "0deg";
    return (
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" style={{ transform: `rotate(${rotate})` }} aria-hidden="true">
            <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
function IconDollar({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3v18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <path
                d="M16 7.5c0-1.6-1.8-2.9-4-2.9s-4 1.3-4 2.9 1.8 2.9 4 2.9 4 1.3 4 2.9-1.8 2.9-4 2.9-4-1.3-4-2.9"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
function IconPlus({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
        </svg>
    );
}
function IconCheck({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
function IconPrint({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M7 9V4h10v5M7 18H6a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="M7 14h10v6H7v-6Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
    );
}

// ---------- small UI blocks ----------
function TopRightNav({
    onBack,
    onHome,
    onList,
    onCheck,
    disabledBack,
    showCheck = true,
    checkCount = 0,
}: {
    onBack: () => void;
    onHome: () => void;
    onList: () => void;
    onCheck?: () => void;
    disabledBack?: boolean;
    showCheck?: boolean;
    checkCount?: number;
}) {
    const n = Math.max(0, Math.floor(checkCount || 0));

    return (
        <div style={{ position: "absolute", top: 18, right: 18, display: "flex", gap: 10, zIndex: 5 }}>
            <button
                type="button"
                onClick={onBack}
                disabled={disabledBack}
                className={cn("iconBtn", disabledBack && "iconBtnDisabled")}
                aria-label="Voltar"
                title="Voltar"
            >
                <IconBack />
            </button>

            <button type="button" onClick={onHome} className="iconBtn" aria-label="Home" title="Home">
                <IconHome />
            </button>

            <button type="button" onClick={onList} className="iconBtn" aria-label="Lista" title="Lista">
                <IconList />
            </button>

            {showCheck ? (
                <button
                    type="button"
                    onClick={onCheck}
                    className="iconBtn iconBtnCheck"
                    aria-label="Concluir"
                    title="Concluir"
                >
                    <IconCheck />
                    {n > 0 ? <span className="badgeCount" aria-label={`${n} itens selecionados`}>{n}</span> : null}
                </button>
            ) : null}
        </div>
    );
}

function BigButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="bigBtn">
            <span className="btnLabel">{label.replace(/\n/g, " ")}</span>
        </button>
    );
}
function Title({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ textAlign: "center", marginTop: 38, marginBottom: 26 }}>
            <div className="title">{children}</div>
        </div>
    );
}
function ScreenContainer({ children }: { children: React.ReactNode }) {
    return <div className="screen">{children}</div>;
}
function SectionPill({ children }: { children: React.ReactNode }) {
    return <div className="pill">{children}</div>;
}
function ProductCard({ p, onOpen }: { p: Produto; onOpen: () => void }) {
    return (
        <button type="button" className="prodCard" onClick={onOpen} title={p.nome}>
            <div className="prodImgWrap">
                <img src={p.thumb} alt={p.nome} className="prodImg" loading="lazy" />
            </div>
            <div className="prodName">{p.nome}</div>
        </button>
    );
}

function Modal({
    open,
    title,
    children,
    onClose,
    footer,
    maxWidth = 680,
}: {
    open: boolean;
    title: string;
    children: React.ReactNode;
    onClose: () => void;
    footer?: React.ReactNode;
    maxWidth?: number;
}) {
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="modalOverlay"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={(e) => {
                if (e.currentTarget === e.target) onClose();
            }}
        >
            <div className="modalCard" style={{ width: `min(${maxWidth}px, 96vw)` }}>
                <div className="modalHeader">
                    <button
                        type="button"
                        className="modalClose"
                        onClick={onClose}
                        aria-label="Fechar modal"
                        title="Fechar"
                    >
                        ✕
                    </button>

                    <div className="modalTitle">{title}</div>
                </div>
                <div className="modalBody">{children}</div>
                {footer ? <div className="modalFooter">{footer}</div> : null}
            </div>
        </div>
    );
}

// ---------- PDF helpers (logo -> dataURL) ----------
async function toDataUrl(url: string): Promise<string | null> {
    try {
        const r = await fetch(url, { mode: "cors", cache: "no-store" });
        const b = await r.blob();
        const reader = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onerror = () => reject(new Error("Falha ao ler logo"));
            fr.onload = () => resolve(String(fr.result || ""));
            fr.readAsDataURL(b);
        });
        return reader;
    } catch {
        return null;
    }
}

function labelCategoria(c: CategoriaFluxo) {
    const map: Record<CategoriaFluxo, string> = {
        URNAS: "URNAS",
        APRESENTACAO: "APRESENTAÇÃO",
        ESPACO_DESPEDIDA: "ESPAÇO DE DESPEDIDA",
        PREPARACAO_CUIDADO: "PREPARAÇÃO E CUIDADO",
        AMBIENTACAO: "AMBIENTAÇÃO",
        CUIDADOS_ADICIONAIS: "CUIDADOS ADICIONAIS",
    };
    return map[c];
}

// ---------- main page ----------
export default function Page() {
    const [stack, setStack] = useState<CatalogGroup[]>(["home"]);
    const current = stack[stack.length - 1];

    // catálogo
    const [categoria, setCategoria] = useState<CategoriaFluxo | null>(null);
    const [linha, setLinha] = useState<Linha | null>(null);
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const pageSize = 8;
    const [selected, setSelected] = useState<Produto | null>(null);
    const [openPrices, setOpenPrices] = useState(false);

    // itens selecionados (não duplica)
    const [draftItens, setDraftItens] = useState<OrcamentoItem[]>([]);

    // orçamentos
    const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
    const [orcamentoSelecionadoId, setOrcamentoSelecionadoId] = useState<string | null>(null);

    // ----- fluxo de homenagem (operador + dados iniciais) -----
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [usersError, setUsersError] = useState<string | null>(null);

    const [openUserPick, setOpenUserPick] = useState(false);
    const [operadorSel, setOperadorSel] = useState<Usuario | null>(null);

    // ✅ typeahead (buscar operador)
    const [userQuery, setUserQuery] = useState("");
    const [userHighlight, setUserHighlight] = useState(0);

    const [operadorTemp, setOperadorTemp] = useState<Usuario | null>(null);

    const [openInicio, setOpenInicio] = useState(false);
    const [formResp, setFormResp] = useState("");
    const [formFalecido, setFormFalecido] = useState("");
    const [formTel, setFormTel] = useState("");

    const [openConcluir, setOpenConcluir] = useState(false);

    const canBack = stack.length > 1;

    const go = useCallback((to: CatalogGroup) => {
        setStack((s) => [...s, to]);
    }, []);

    const back = useCallback(() => {
        setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    }, []);

    const home = useCallback(() => {
        setStack(["home"]);
        setCategoria(null);
        setLinha(null);
        setQ("");
        setPage(1);
        setSelected(null);
        setOpenPrices(false);

        // não zera orçamentos salvos, mas zera o fluxo atual:
        setDraftItens([]);
        setOperadorSel(null);
        setFormResp("");
        setFormFalecido("");
        setFormTel("");
        setOpenUserPick(false);
        setOpenInicio(false);
        setOpenConcluir(false);
    }, []);

    const goBudgets = useCallback(() => {
        setStack(["home", "orcamentos"]);
    }, []);

    const list = useCallback(() => {
        // ícone "lista": volta para o menu de categorias do fluxo se já começou; senão home->elementos
        if (operadorSel && formResp.trim() && formFalecido.trim() && formTel.trim()) {
            setStack(["home", "elementos"]);
            return;
        }
        setStack(["home"]);
    }, [operadorSel, formResp, formFalecido, formTel]);

    // ---------- usuários ----------
    const fetchUsuarios = useCallback(async () => {
        setLoadingUsers(true);
        setUsersError(null);
        try {
            const j = await safeJsonFetch(`${API_URL}?action=list_users&_=${Date.now()}`, { timeoutMs: 15000 });
            setUsuarios(Array.isArray(j) ? (j as Usuario[]) : []);
        } catch (e: any) {
            setUsuarios([]);
            setUsersError(e?.message || "Erro ao listar usuários.");
        } finally {
            setLoadingUsers(false);
        }
    }, []);

    const openFluxoHomenagem = useCallback(async () => {
        setOpenUserPick(true);

        // ✅ reset do typeahead
        setUserQuery("");
        setUserHighlight(0);
        setOperadorTemp(null);

        if (!usuarios.length) {
            await fetchUsuarios();
        }
    }, [fetchUsuarios, usuarios.length]);

    const selectOperador = useCallback((u: Usuario) => {
        setOperadorTemp(u);
    }, []);

    const confirmarOperador = useCallback(() => {
        if (!operadorTemp) return;

        setOperadorSel(operadorTemp);
        setOpenUserPick(false);

        // ✅ reset do typeahead
        setUserQuery("");
        setUserHighlight(0);

        // abrir modal de início (dados da homenagem)
        setFormResp("");
        setFormFalecido("");
        setFormTel("");
        setOpenInicio(true);
    }, [operadorTemp]);

    const filteredUsuarios = useMemo(() => {
        const qq = userQuery.trim().toLowerCase();
        if (!qq) return []; // ✅ não mostra nada se vazio

        return usuarios
            .filter((u) => {
                const hay = `${u.nome} ${u.usuario}`.toLowerCase();
                return hay.includes(qq);
            })
            .slice(0, 12); // ✅ limita pra não ficar grande
    }, [usuarios, userQuery]);

    const iniciarHomenagem = useCallback(() => {
        const responsavel = formResp.trim();
        const falecido = formFalecido.trim();
        const telefone = formTel.trim();

        if (!operadorSel) {
            alert("Selecione o Operador.");
            return;
        }
        if (!responsavel || !falecido || !telefone) {
            alert("Preencha Responsável, Falecido(a) e Telefone.");
            return;
        }

        // inicia o fluxo no menu de categorias
        setOpenInicio(false);
        setDraftItens([]);
        setCategoria(null);
        setLinha(null);
        setQ("");
        setPage(1);
        setSelected(null);
        setOpenPrices(false);

        setStack(["home", "elementos"]);
    }, [formResp, formFalecido, formTel, operadorSel]);

    // ---------- catálogo ----------
    useEffect(() => {
        // URNAS usa LINHAS; demais vão direto para listagem
        if (categoria !== "URNAS" && linha) setLinha(null);
    }, [categoria, linha]);

    const produtosFiltrados = useMemo(() => {
        let arr = mockProdutos.slice();
        if (categoria) arr = arr.filter((p) => p.categoria === categoria);
        if (linha) arr = arr.filter((p) => p.linha === linha);

        const qq = q.trim().toLowerCase();
        if (qq) {
            arr = arr.filter((p) => {
                const hay = `${p.nome} ${p.descricaoCurta} ${p.inspiracao} ${p.conceito} ${p.especificacoes}`.toLowerCase();
                return hay.includes(qq);
            });
        }
        return arr;
    }, [categoria, linha, q]);

    const totalPages = Math.max(1, Math.ceil(produtosFiltrados.length / pageSize));
    const paged = useMemo(() => {
        const start = (page - 1) * pageSize;
        return produtosFiltrados.slice(start, start + pageSize);
    }, [produtosFiltrados, page, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
        if (page < 1) setPage(1);
    }, [totalPages, page]);

    const openProduct = useCallback(
        (p: Produto) => {
            setSelected(p);
            if (current !== "detalhe") go("detalhe");
        },
        [current, go]
    );

    // ✅ abrir item da revisão no detalhe (apresentação do produto)
    const openItemFromReview = useCallback((produtoId: number) => {
        const p = mockProdutos.find((x) => x.id === produtoId);
        if (!p) return;

        // Ajusta filtros para o detalhe bater com o produto
        setCategoria(p.categoria);

        if (p.categoria === "URNAS") {
            setLinha((p.linha as Linha) ?? null);
            setStack(["home", "elementos", "urnas_linhas", "listagem", "detalhe"]);
        } else {
            setLinha(null);
            setStack(["home", "elementos", "listagem", "detalhe"]);
        }

        setSelected(p);
        setOpenConcluir(false); // fecha a revisão ao abrir o detalhe
    }, []);

    

    useEffect(() => {
        if (current !== "detalhe") return;
        if (!produtosFiltrados.length) {
            setSelected(null);
            return;
        }
        if (!selected || !produtosFiltrados.some((p) => p.id === selected.id)) {
            setSelected(produtosFiltrados[0]);
        }
    }, [current, selected, produtosFiltrados]);

    const detailThumbs = useMemo(() => {
        return Array.from({ length: 6 }).map((_, i) => ({
            key: `thumb-${i + 1}`,
            src: mockImg(`IMG ${i + 1}`, 26 + i * 12),
            alt: `Miniatura ${i + 1}`,
        }));
    }, []);

    const tabelaValores = useMemo(() => {
        if (!selected) return [];
        const extraLinha = selected.linha ? 80 : 0;
        return [
            { label: "Preço base", value: formatBRL(selected.preco) },
            { label: "Taxa de preparação (mock)", value: formatBRL(120) },
            { label: "Ajuste por linha (mock)", value: formatBRL(extraLinha) },
            { label: "Total estimado", value: formatBRL(selected.preco + 120 + extraLinha) },
        ];
    }, [selected]);

    const isSelectedInDraft = useCallback(
        (produtoId: number) => {
            return draftItens.some((x) => x.produtoId === produtoId);
        },
        [draftItens]
    );

    

    // ---------- draft: toggle (adiciona/remove) ----------
    const toggleDraftItem = useCallback((p: Produto) => {
        setDraftItens((prev) => {
            const exists = prev.some((x) => x.produtoId === p.id);

            // ✅ se já existe, remove (anula seleção)
            if (exists) return prev.filter((x) => x.produtoId !== p.id);

            // ✅ se não existe, adiciona
            return [
                ...prev,
                {
                    produtoId: p.id,
                    nome: p.nome,
                    categoria: p.categoria,
                    linha: p.linha,
                    valorUnit: Number(p.preco) || 0,
                    qtd: 1,
                },
            ];
        });
    }, []);

    const removeFromDraft = useCallback((produtoId: number) => {
        setDraftItens((prev) => prev.filter((x) => x.produtoId !== produtoId));
    }, []);

    const groupedByCategoria = useMemo(() => {
        const g: Record<string, OrcamentoItem[]> = {};
        for (const it of draftItens) {
            const k = it.categoria;
            if (!g[k]) g[k] = [];
            g[k].push(it);
        }
        return g as Record<CategoriaFluxo, OrcamentoItem[]>;
    }, [draftItens]);

    // ---------- navegação Próximo Passo / Retornar ----------
    const currentCatIndex = useMemo(() => {
        if (!categoria) return -1;
        return CATEGORIAS_FLUXO.findIndex((x) => x.id === categoria);
    }, [categoria]);

    // ✅ mostrar botões Retornar/Próximo somente quando estiver dentro de uma categoria do fluxo
    const showStepperButtons = useMemo(() => {
        return Boolean(categoria); // se tem categoria selecionada, está no fluxo
    }, [categoria]);

    // ✅ última categoria do fluxo? (para trocar "Próximo Passo" por "Concluir")
    const isLastCategoria = useMemo(() => {
        if (!categoria) return false;
        return currentCatIndex === CATEGORIAS_FLUXO.length - 1;
    }, [categoria, currentCatIndex]);

    const goCategoria = useCallback(
        (cat: CategoriaFluxo) => {
            setCategoria(cat);
            setQ("");
            setPage(1);
            setSelected(null);
            setOpenPrices(false);

            if (cat === "URNAS") {
                setLinha(null);
                setStack(["home", "elementos", "urnas_linhas"]);
            } else {
                setLinha(null);
                setStack(["home", "elementos", "listagem"]);
            }
        },
        []
    );

    const nextCategoria = useCallback(() => {
        const idx = currentCatIndex;
        if (idx < 0) return;
        const next = CATEGORIAS_FLUXO[idx + 1]?.id;
        if (!next) {
            setOpenConcluir(true);
            return;
        }
        goCategoria(next);
    }, [currentCatIndex, goCategoria]);

    const prevCategoria = useCallback(() => {
        const idx = currentCatIndex;
        if (idx <= 0) {
            // se está na primeira, volta para menu de categorias
            setStack(["home", "elementos"]);
            setCategoria(null);
            setLinha(null);
            setQ("");
            setPage(1);
            setSelected(null);
            return;
        }
        const prev = CATEGORIAS_FLUXO[idx - 1]?.id;
        if (!prev) return;
        goCategoria(prev);
    }, [currentCatIndex, goCategoria]);

    const openConcluirModal = useCallback(() => {
        // pode concluir mesmo sem itens
        if (!operadorSel || !formResp.trim() || !formFalecido.trim() || !formTel.trim()) {
            alert("Para concluir, inicie a homenagem (Operador + dados).");
            return;
        }
        setOpenConcluir(true);
    }, [operadorSel, formResp, formFalecido, formTel]);

    // ---------- criar orçamento (somente no Finalizar) ----------
    const finalizarOrcamento = useCallback(() => {
        if (!operadorSel) {
            alert("Operador não selecionado.");
            return;
        }
        const responsavel = formResp.trim();
        const falecido = formFalecido.trim();
        const telefone = formTel.trim();

        if (!responsavel || !falecido || !telefone) {
            alert("Dados da homenagem incompletos.");
            return;
        }

        const now = new Date();
        const id = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Math.random()
            .toString(16)
            .slice(2, 8)
            .toUpperCase()}`;

        const novo: Orcamento = {
            id,
            criadoEmISO: now.toISOString(),

            operadorId: operadorSel.id,
            operadorNome: operadorSel.nome,
            operadorUsuario: operadorSel.usuario,

            responsavel,
            falecido,
            telefone,

            itens: draftItens.map((x) => ({ ...x, qtd: 1 })),
        };

        setOrcamentos((prev) => [novo, ...prev]);

        // reset fluxo atual
        setDraftItens([]);
        setCategoria(null);
        setLinha(null);
        setQ("");
        setPage(1);
        setSelected(null);
        setOpenPrices(false);
        setOpenConcluir(false);

        // ir para lista
        setOrcamentoSelecionadoId(null);
        setStack(["home", "orcamentos"]);
    }, [draftItens, formFalecido, formResp, formTel, operadorSel]);

    const openOrcamentoResumo = useCallback((id: string) => {
        setOrcamentoSelecionadoId(id);
        setStack(["home", "orcamentos", "resumo"]);
    }, []);

    const orcamentoSelecionado = useMemo(() => {
        if (!orcamentoSelecionadoId) return null;
        return orcamentos.find((o) => o.id === orcamentoSelecionadoId) ?? null;
    }, [orcamentos, orcamentoSelecionadoId]);

    const totalOrcamentoSelecionado = useMemo(() => {
        if (!orcamentoSelecionado) return 0;
        let t = 0;
        for (const it of orcamentoSelecionado.itens) t += clampInt(it.qtd) * (Number(it.valorUnit) || 0);
        return t;
    }, [orcamentoSelecionado]);

    // ---------- EXPORT PDF (Resumo) ----------
    const exportarResumoPDF = useCallback(async (o: Orcamento) => {
        const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

        const logoDataUrl = await toDataUrl(LOGO_URL_PDF);
        const logoFormat = logoDataUrl?.startsWith("data:image/jpeg") ? "JPEG" : "PNG";

        const dt = new Date(o.criadoEmISO);
        const dataBR = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(dt);
        const geradoEm = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());

        // A4 landscape
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const marginX = 12;

        let y = 12;

        // Logo (top-left)
        if (logoDataUrl) {
            const imgW = 40;
            const imgH = 12;
            doc.addImage(logoDataUrl, logoFormat as any, marginX, y, imgW, imgH);
        }

        // Título (ao lado)
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("Resumo da Homenagem", marginX + 45, y + 8);

        // Gerado em (top-right)
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        doc.text(`Gerado em: ${geradoEm}`, pageW - marginX, y + 8, { align: "right" });

        y += 18;

        // Número do orçamento embaixo do título
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(`Nº ${o.id}`, marginX + 45, y);

        y += 8;

        // Caixa com dados (somente Responsável/Falecido/Telefone + Data)
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(marginX, y, pageW - marginX * 2, 18, 2, 2, "FD");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);

        doc.text(`Responsável: ${o.responsavel}`, marginX + 3, y + 6);
        doc.text(`Falecido(a): ${o.falecido}`, marginX + 3, y + 12);
        doc.text(`Telefone: ${o.telefone}`, marginX + 85, y + 12);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(`Data: ${dataBR}`, pageW - marginX - 3, y + 6, { align: "right" });

        y += 24;

        // Tabela
        const head = ["Categoria", "Item", "Qtd", "Valor (un)", "Subtotal"];
        const body = o.itens.map((it) => {
            const qtd = clampInt(it.qtd);
            const v = Number(it.valorUnit) || 0;
            const sub = qtd * v;
            return [labelCategoria(it.categoria), it.nome, String(qtd), formatBRL(v), formatBRL(sub)];
        });

        const total = o.itens.reduce((acc, it) => acc + clampInt(it.qtd) * (Number(it.valorUnit) || 0), 0);

        autoTable(doc, {
            startY: y,
            head: [head],
            body,
            margin: { left: marginX, right: marginX },
            styles: {
                font: "helvetica",
                fontSize: 9.5,
                cellPadding: 2.4,
                valign: "top",
                lineColor: [226, 232, 240],
                lineWidth: 0.2,
            },
            headStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontStyle: "bold",
                valign: "middle",
            },
            columnStyles: {
                0: { cellWidth: 48 },
                1: { cellWidth: 150, overflow: "linebreak" },
                2: { halign: "right", cellWidth: 16 },
                3: { halign: "right", cellWidth: 32 },
                4: { halign: "right", cellWidth: 34 },
            },
            didParseCell: (data) => {
                if (data.section === "body" && data.column.index === 2) data.cell.styles.halign = "right";
                if (data.section === "body" && data.column.index >= 3) data.cell.styles.halign = "right";
            },
        });

        const afterY = (doc as any).lastAutoTable?.finalY ?? y;

        // Total box no canto direito
        const boxW = 54;
        const boxH = 12;
        const boxX = pageW - marginX - boxW;
        const boxY = Math.min(afterY + 6, pageH - marginX - boxH);

        doc.setFillColor(2, 156, 222);
        doc.setDrawColor(2, 156, 222);
        doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, "F");

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(formatBRL(total), boxX + boxW - 3, boxY + 8, { align: "right" });

        const safeName = `orcamento_${o.id}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`.replace(/\s+/g, "_");
        doc.save(`${safeName}.pdf`);
    }, []);

    // ---------- screens ----------
    const ScreenHome = (
        <ScreenContainer>
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div className="homeBtns">
                    <button type="button" className="homeBtn" onClick={openFluxoHomenagem}>
                        ELEMENTOS DE HOMENAGEM
                    </button>

                    <button type="button" className="homeBtn" onClick={goBudgets}>
                        LISTA DE ORÇAMENTOS
                    </button>
                </div>
            </div>
        </ScreenContainer>
    );

    const ScreenElementos = (
        <ScreenContainer>
            <TopRightNav
                onBack={back}
                onHome={home}
                onList={list}
                onCheck={openConcluirModal}
                disabledBack={!canBack}
                showCheck={true}
                checkCount={draftItens.length}
            />
            <Title>ELEMENTOS DE HOMENAGEM</Title>

            <div className="gridMenu2">
                {CATEGORIAS_FLUXO.map((it) => (
                    <BigButton
                        key={it.id}
                        label={it.label}
                        onClick={() => {
                            goCategoria(it.id);
                        }}
                    />
                ))}
            </div>
        </ScreenContainer>
    );

    const ScreenLinhas = (
        <ScreenContainer>
            <TopRightNav
                onBack={back}
                onHome={home}
                onList={list}
                onCheck={openConcluirModal}
                disabledBack={!canBack}
                showCheck={true}
                checkCount={draftItens.length}
            />
            <Title>ELEMENTOS DE HOMENAGEM</Title>

            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                <SectionPill>URNAS • LINHAS</SectionPill>
            </div>

            <div className="gridMenu2">
                {LINHAS.map((l) => (
                    <BigButton
                        key={l.id}
                        label={l.title}
                        onClick={() => {
                            setLinha(l.id);
                            setQ("");
                            setPage(1);
                            setStack(["home", "elementos", "urnas_linhas", "listagem"]);
                        }}
                    />
                ))}
            </div>
        </ScreenContainer>
    );

    const ScreenListagem = (
        <ScreenContainer>
            <TopRightNav
                onBack={back}
                onHome={home}
                onList={list}
                onCheck={openConcluirModal}
                disabledBack={!canBack}
                showCheck={true}
                checkCount={draftItens.length}
            />

            <div style={{ padding: "22px 26px 0 26px" }}>
                <div className="listHeader">
                    

                    <div className="listSubTitle">
                        {categoria ? `${labelCategoria(categoria)}` : "CATÁLOGO"}{" "}
                        {categoria === "URNAS" && linha ? `• LINHA ${linha}` : ""}
                    </div>

                    <div className="searchRow">
                        <div className="searchBox">
                            <span className="searchIcon">
                                <IconSearch />
                            </span>
                            <input
                                value={q}
                                onChange={(e) => {
                                    setQ(e.target.value);
                                    setPage(1);
                                }}
                                className="searchInput"
                                placeholder="Buscar produto..."
                                aria-label="Buscar produto"
                            />
                        </div>

                        <div className="chip">
                            Itens: <b style={{ marginLeft: 6 }}>{produtosFiltrados.length}</b>
                        </div>
                    </div>
                </div>

                <div className="gridProdutos">
                    {paged.map((p) => (
                        <ProductCard key={p.id} p={p} onOpen={() => openProduct(p)} />
                    ))}
                    {paged.length === 0 ? <div className="emptyState">Nenhum produto encontrado.</div> : null}
                </div>

                <div className="pagerRow">
                    <div className="pagerBtns">
                        <button
                            type="button"
                            className="pagerBtn"
                            onClick={() => setPage((x) => Math.max(1, x - 1))}
                            disabled={page <= 1}
                            aria-label="Página anterior"
                        >
                            <IconChevron dir="left" />
                        </button>

                        <button
                            type="button"
                            className="pagerBtn"
                            onClick={() => setPage((x) => Math.min(totalPages, x + 1))}
                            disabled={page >= totalPages}
                            aria-label="Próxima página"
                        >
                            <IconChevron dir="right" />
                        </button>
                    </div>

                    {showStepperButtons ? (
                        <button type="button" className="stepBtn" onClick={nextCategoria}>
                            {isLastCategoria ? "Concluir" : "Próximo Passo"}
                        </button>
                    ) : null}
                </div>

                

                
            </div>
        </ScreenContainer>
    );

    

    const ScreenDetalhe = (
        <ScreenContainer>
            <TopRightNav
                onBack={() => {
                    setOpenPrices(false);
                    back();
                }}
                onHome={home}
                onList={() => {
                    setOpenPrices(false);
                    // volta para listagem da categoria atual (ou menu se não tiver)
                    if (categoria === "URNAS") {
                        setStack((s) => {
                            const idx = s.lastIndexOf("listagem");
                            if (idx >= 0) return s.slice(0, idx + 1);
                            return ["home", "elementos", "urnas_linhas", "listagem"];
                        });
                    } else if (categoria) {
                        setStack(["home", "elementos", "listagem"]);
                    } else {
                        setStack(["home", "elementos"]);
                    }
                }}
                onCheck={openConcluirModal}
                showCheck={true}
                checkCount={draftItens.length}
            />

            <div style={{ padding: "22px 26px 0 26px" }}>
                <div className="listTitle" style={{ marginBottom: 10 }}>
                    {selected?.linha ? `Linha: ${selected.linha}` : "Linha: -"}
                </div>

                {!selected ? (
                    <div className="emptyState" style={{ marginTop: 40 }}>
                        Selecione um produto na listagem.
                    </div>
                ) : (
                    <div className="detailLayout">
                        {/* esquerda */}
                        <div className="detailLeft">
                            <div className="detailImgCard">
                                <img src={selected.thumb} alt={selected.nome} className="detailImg" />
                                <button type="button" className="zoomBtn" onClick={() => console.info("Mock: zoom")} title="Zoom" aria-label="Zoom">
                                    🔍
                                </button>
                            </div>

                            <div className="thumbRow" aria-label="Miniaturas (mock)">
                                {detailThumbs.map((t) => (
                                    <button type="button" key={t.key} className="thumb" onClick={() => console.info("Mock: trocar imagem")} title="Miniatura (mock)">
                                        <img src={t.src} alt={t.alt} className="thumbImg" />
                                    </button>
                                ))}
                            </div>

                            {/* ✅ abaixo das fotos: somente Saldo */}
                            <div className="detailMeta">
                                <div className="metaPill">
                                    <b>Saldo:</b> {selected.saldo}
                                </div>
                            </div>
                        </div>

                        {/* direita */}
                        <div className="detailRight">
                            <div className="detailTitle">{selected.nome.toUpperCase()}</div>

                            <div className="bulletBox">
                                <div className="bulletItem">
                                    <span className="bulletDot">•</span>
                                    <div>
                                        <b>DESCRIÇÃO:</b> {selected.descricaoCurta}
                                    </div>
                                </div>

                                <div className="bulletItem">
                                    <span className="bulletDot">•</span>
                                    <div>
                                        <b>INSPIRAÇÃO:</b> {selected.inspiracao}
                                    </div>
                                </div>

                                <div className="bulletItem">
                                    <span className="bulletDot">•</span>
                                    <div>
                                        <b>CONCEITO:</b> {selected.conceito}
                                    </div>
                                </div>

                                <div className="bulletItem">
                                    <span className="bulletDot">•</span>
                                    <div>
                                        <b>ESPECIFICAÇÕES TÉCNICAS:</b> {selected.especificacoes}
                                    </div>
                                </div>

                                <div className="detailActions">
                                    <button type="button" className="iconActionBtn" onClick={() => setOpenPrices(true)} aria-label="Tabela de valores" title="Tabela de valores">
                                        <IconDollar />
                                    </button>

                                        {(() => {
                                            const already = isSelectedInDraft(selected.id);
                                            return (
                                                <button
                                                    type="button"
                                                    className={cn("iconActionBtn", already && "iconActionBtnSelected")}
                                                    onClick={() => toggleDraftItem(selected)} // ✅ toggle
                                                    aria-label={already ? "Remover" : "Adicionar"}
                                                    title={already ? "Remover" : "Adicionar"}
                                                >
                                                    {already ? <IconCheck /> : <IconPlus />}
                                                </button>
                                            );
                                        })()}
                                </div>

                                {showStepperButtons ? (
                                    <div className="stepperRow">
                                        <button type="button" className="stepBtn stepBtnGhost" onClick={prevCategoria}>
                                            Retornar
                                        </button>
                                        <button type="button" className="stepBtn" onClick={nextCategoria}>
                                            {isLastCategoria ? "Concluir" : "Próximo Passo"}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <Modal
                open={openPrices}
                title="Tabela de valores (mock)"
                onClose={() => setOpenPrices(false)}
                footer={
                    <button type="button" className="ctaBtn" onClick={() => setOpenPrices(false)}>
                        FECHAR
                    </button>
                }
            >
                {!selected ? null : (
                    <div style={{ display: "grid", gap: 10 }}>
                        {tabelaValores.map((row) => (
                            <div
                                key={row.label}
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    background: "rgba(255,255,255,0.08)",
                                    border: "1px solid rgba(255,255,255,0.14)",
                                }}
                            >
                                <span style={{ opacity: 0.95 }}>{row.label}</span>
                                <b>{row.value}</b>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>
        </ScreenContainer>
    );

    const ScreenOrcamentos = (
        <ScreenContainer>
            <TopRightNav onBack={back} onHome={home} onList={list} onCheck={openConcluirModal} disabledBack={!canBack} showCheck={false} />
            <Title>LISTA DE ORÇAMENTOS</Title>

            <div className="budgetsWrap">
                {orcamentos.length ? (
                    <div className="budgetGrid">
                        {orcamentos.map((o) => {
                            const total = o.itens.reduce((acc, it) => acc + clampInt(it.qtd) * (Number(it.valorUnit) || 0), 0);
                            const dt = new Date(o.criadoEmISO);
                            const dataBR = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(dt);
                            return (
                                <button key={o.id} type="button" className="budgetCard" onClick={() => openOrcamentoResumo(o.id)} title="Abrir resumo">
                                    <div className="budgetTop">
                                        <div className="budgetTitle">{o.falecido}</div>
                                        <div className="budgetMeta">
                                            Responsável: <b>{o.responsavel}</b>
                                        </div>
                                    </div>

                                    <div className="budgetBottom">
                                        <div className="budgetSmall">
                                            Data: <b>{dataBR}</b>
                                        </div>
                                        <div className="budgetSmall">
                                            Itens: <b>{o.itens.length}</b>
                                        </div>
                                        <div className="budgetTotal">{formatBRL(total)}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="emptyState" style={{ margin: "0 26px" }}>
                        Nenhum orçamento ainda.
                    </div>
                )}
            </div>
        </ScreenContainer>
    );

    const ScreenResumo = (
        <ScreenContainer>
            <div className="resumoTopBar">
                <button type="button" className="iconBtn resumoBtn" onClick={() => setStack(["home", "orcamentos"])} title="Voltar (lista)">
                    <IconBack />
                </button>

                <button type="button" className="iconBtn resumoBtn" onClick={() => console.info("Visto (sem função por enquanto)")} title="Visto">
                    <IconCheck />
                </button>

                <button type="button" className="iconBtn resumoBtn" onClick={() => (orcamentoSelecionado ? exportarResumoPDF(orcamentoSelecionado) : null)} title="Imprimir (PDF)">
                    <IconPrint />
                </button>
            </div>

            <div style={{ padding: "22px 26px 0 26px" }}>
                <div className="resumoTitle">RESUMO DA HOMENAGEM</div>

                {!orcamentoSelecionado ? (
                    <div className="emptyState" style={{ marginTop: 18 }}>
                        Orçamento não encontrado.
                    </div>
                ) : (
                    <div className="resumoCard">
                        <div className="resumoHeader2">
                            <div className="resumoHeaderLeft">
                                <img src={LOGO_URL_UI} alt="PAI" className="resumoLogoTopLeft" />
                                <div className="resumoOrcBlock">
                                    <div className="resumoOrcMain">ORÇAMENTO</div>
                                    <div className="resumoOrcSub">Nº {orcamentoSelecionado.id}</div>
                                </div>
                            </div>

                            <div className="resumoInfo">
                                <div className="resumoLine">
                                    <b>Responsável:</b> {orcamentoSelecionado.responsavel}
                                </div>
                                <div className="resumoLine">
                                    <b>Falecido(a):</b> {orcamentoSelecionado.falecido}
                                </div>
                                <div className="resumoLine">
                                    <b>Telefone:</b> {orcamentoSelecionado.telefone}
                                </div>
                            </div>

                            <div className="resumoDate">
                                <div className="resumoLine">
                                    <b>Data:</b>{" "}
                                    {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(orcamentoSelecionado.criadoEmISO))}
                                </div>
                            </div>
                        </div>

                        <div className="resumoTable">
                            <div className="resumoTableHead2">
                                <div>Categoria</div>
                                <div>Item</div>
                                <div style={{ textAlign: "right" }}>Qtd</div>
                                <div style={{ textAlign: "right" }}>Valor</div>
                            </div>

                            {orcamentoSelecionado.itens.map((it, idx) => (
                                <div key={`${it.produtoId}-${idx}`} className="resumoRow2">
                                    <div className="resumoCat">{labelCategoria(it.categoria)}</div>
                                    <div className="resumoItemName">{it.nome}</div>
                                    <div style={{ textAlign: "right" }}>{clampInt(it.qtd)}</div>
                                    <div style={{ textAlign: "right" }}>{formatBRL((Number(it.valorUnit) || 0) * clampInt(it.qtd))}</div>
                                </div>
                            ))}
                        </div>

                        <div className="resumoBottom">
                            <div className="resumoValidade">
                                Orçamento válido por <b>07</b> dias
                            </div>

                            <div className="resumoTotalBox">
                                <div className="resumoTotalLabel">Total</div>
                                <div className="resumoTotalValue">{formatBRL(totalOrcamentoSelecionado)}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </ScreenContainer>
    );

    // ---------- render switch ----------
    let screen: React.ReactNode = null;
    if (current === "home") screen = ScreenHome;
    if (current === "elementos") screen = ScreenElementos;
    if (current === "urnas_linhas") screen = ScreenLinhas;
    if (current === "listagem") screen = ScreenListagem;
    if (current === "detalhe") screen = ScreenDetalhe;
    if (current === "orcamentos") screen = ScreenOrcamentos;
    if (current === "resumo") screen = ScreenResumo;

    return (
        <div className="root">
            <style>{css}</style>

            {screen}

            {/* MODAL: Selecionar Operador */}
            {/* MODAL: Selecionar Operador */}
            <Modal
                open={openUserPick}
                title="Selecionar Operador"
                onClose={() => setOpenUserPick(false)}
                maxWidth={760}
                footer={
                    <div style={{ display: "flex", gap: 10 }}>
                        <button
                            type="button"
                            className="ctaBtn"
                            onClick={() => setOpenUserPick(false)}
                            style={{ minWidth: 180 }}
                        >
                            CANCELAR
                        </button>

                        <button
                            type="button"
                            className="ctaBtn"
                            onClick={confirmarOperador}
                            style={{ minWidth: 220 }}
                            disabled={!operadorTemp}
                        >
                            CONFIRMAR
                        </button>
                    </div>
                }
            >
                {usersError ? <div className="errorBox">{usersError}</div> : null}

                {/* ✅ Barra de busca 100% */}
                <div className="userPickerSearch">
                    <span className="userPickerIcon">
                        <IconSearch />
                    </span>

                    <input
                        value={userQuery}
                        onChange={(e) => {
                            setUserQuery(e.target.value);
                            setUserHighlight(0);
                        }}
                        onKeyDown={(e) => {
                            if (!filteredUsuarios.length) return;

                            if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setUserHighlight((i) => Math.min(i + 1, filteredUsuarios.length - 1));
                            }
                            if (e.key === "ArrowUp") {
                                e.preventDefault();
                                setUserHighlight((i) => Math.max(i - 1, 0));
                            }
                            if (e.key === "Enter") {
                                e.preventDefault();
                                const pick = filteredUsuarios[userHighlight];
                                if (pick) setOperadorTemp(pick); // ✅ só seleciona
                            }
                        }}
                        className="userPickerInput"
                        placeholder={loadingUsers ? "Carregando usuários..." : "Digite nome ou @usuário..."}
                        aria-label="Buscar operador"
                        autoFocus
                        disabled={loadingUsers}
                    />
                </div>

                {/* ✅ Lista vertical */}
                <div className="userPickerResults">
                    {loadingUsers ? (
                        <div className="emptyState" style={{ marginTop: 0 }}>
                            Carregando usuários...
                        </div>
                    ) : !userQuery.trim() ? (
                        <div className="emptyState" style={{ marginTop: 0 }}>
                            Digite para buscar um usuário.
                        </div>
                    ) : filteredUsuarios.length ? (
                        filteredUsuarios.map((u, idx) => {
                            const active = idx === userHighlight;
                            const selected = operadorTemp?.id === u.id;

                            return (
                                <button
                                    key={u.id}
                                    type="button"
                                    className={cn(
                                        "userRow",
                                        active && "userRowActive",
                                        selected && "userRowSelected"
                                    )}
                                    onMouseEnter={() => setUserHighlight(idx)}
                                    onClick={() => selectOperador(u)} // ✅ só marca
                                    title="Selecionar"
                                >
                                    <div className="userRowLeft">
                                        <div className="userName">{u.nome}</div>
                                        <div className="userUser">@{u.usuario}</div>
                                    </div>

                                    {selected ? <span className="userRowCheck">✓</span> : null}
                                </button>
                            );
                        })
                    ) : (
                        <div className="emptyState" style={{ marginTop: 0 }}>
                            Nenhum usuário encontrado.
                        </div>
                    )}
                </div>
            </Modal>

            {/* MODAL: Início da Homenagem */}
            <Modal
                open={openInicio}
                title="Início da Homenagem"
                onClose={() => setOpenInicio(false)}
                maxWidth={860}
                footer={
                    <div style={{ display: "flex", gap: 10 }}>
                        <button type="button" className="ctaBtn" onClick={() => setOpenInicio(false)} style={{ minWidth: 180 }}>
                            CANCELAR
                        </button>
                        <button type="button" className="ctaBtn" onClick={iniciarHomenagem} style={{ minWidth: 220 }}>
                            COMEÇAR
                        </button>
                    </div>
                }
            >
                <div className="inicioTopHint">
                    <div>
                        <b>Operador:</b> {operadorSel ? `${operadorSel.nome} (@${operadorSel.usuario})` : "-"}
                    </div>
                </div>

                <div className="formGrid">
                    <label className="formField">
                        <span>Responsável</span>
                        <input value={formResp} onChange={(e) => setFormResp(e.target.value)} className="formInput" placeholder="Nome do responsável" />
                    </label>

                    <label className="formField">
                        <span>Falecido(a)</span>
                        <input value={formFalecido} onChange={(e) => setFormFalecido(e.target.value)} className="formInput" placeholder="Nome do falecido(a)" />
                    </label>

                    <label className="formField">
                        <span>Telefone</span>
                        <input
                            value={formTel}
                            onChange={(e) => setFormTel(e.target.value)}
                            className="formInput"
                            placeholder="(xx) xxxxx-xxxx"
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                        />
                    </label>
                </div>
            </Modal>

            {/* MODAL: Concluir (revisão + finalizar) */}
            <Modal
                open={openConcluir}
                title="Revisão da Homenagem"
                onClose={() => setOpenConcluir(false)}
                maxWidth={980}
                footer={
                    <div style={{ display: "flex", gap: 10 }}>
                        <button
                            type="button"
                            className="ctaBtn"
                            onClick={() => setOpenConcluir(false)}
                            style={{ minWidth: 180 }}
                        >
                            VOLTAR
                        </button>
                        <button
                            type="button"
                            className="ctaBtn"
                            onClick={finalizarOrcamento}
                            style={{ minWidth: 220 }}
                        >
                            FINALIZAR
                        </button>
                    </div>
                }
            >
                {/* ✅ Cabeçalho em 2 linhas (Responsável+Telefone / Falecido+Operador) */}
                <div className="reviewHeader">
                    <div className="reviewHeaderRow">
                        <div className="reviewLine">
                            <b>Responsável:</b> {formResp.trim() || "-"}
                        </div>
                        <div className="reviewLine">
                            <b>Telefone:</b> {formTel.trim() || "-"}
                        </div>
                    </div>

                    <div className="reviewHeaderRow">
                        <div className="reviewLine">
                            <b>Falecido(a):</b> {formFalecido.trim() || "-"}
                        </div>
                        <div className="reviewLine">
                            <b>Operador:</b>{" "}
                            {operadorSel ? `${operadorSel.nome} (@${operadorSel.usuario})` : "-"}
                        </div>
                    </div>
                </div>

                {draftItens.length === 0 ? (
                    <div className="emptyState" style={{ marginTop: 12 }}>
                        Nenhum item selecionado. Você pode finalizar mesmo assim.
                    </div>
                ) : (
                    // ✅ Sem categorias: lista “reta” de itens
                    <div className="reviewWrap">
                        <div className="reviewItems">
                            {draftItens.map((it) => (
                                <div key={it.produtoId} className="reviewItemRow">
                                    {/* ✅ Clicar no nome abre a tela de detalhe (apresentação) */}
                                    <button
                                        type="button"
                                        className="reviewItemNameBtn"
                                        onClick={() => openItemFromReview(it.produtoId)}
                                        title="Abrir item"
                                    >
                                        {it.nome}
                                    </button>

                                    

                                    <div className="reviewItemRight">
                                        <div className="reviewItemPrice">
                                            {formatBRL(Number(it.valorUnit) || 0)}
                                        </div>
                                        <button
                                            type="button"
                                            className="reviewRemoveBtn"
                                            onClick={() => removeFromDraft(it.produtoId)}
                                            aria-label="Remover item"
                                            title="Remover"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

// ---------- CSS (self-contained) ----------
const css = `
  :root{
    --bg1:#2ca3d4;
    --bg2:#0e4c86;
    --ink: rgba(255,255,255,0.95);
    --shadow: 0 16px 34px rgba(0,0,0,0.25);
  }

  .root{
    width:100vw;
    height:100vh;
    overflow:hidden;
    background-image:
      linear-gradient(rgba(8,32,70,0.45), rgba(8,32,70,0.65)),
      url("${BG_IMAGE}");
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    display:flex;
    align-items:center;
    justify-content:center;
    font-family: var(--font-nunito), Nunito, sans-serif;
  }

  .screen{
    position: relative;
    width: min(1200px, 98vw);
    height: min(680px, 92vh);
    border-radius: 14px;
    overflow:hidden;
    background: transparent;
  }

  .iconBtn{
    width: 44px;
    height: 44px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.4);
    background: rgba(222,234,246,0.92);
    color: #0b2b4d;
    box-shadow: 0 10px 18px rgba(0,0,0,0.18);
    display:flex;
    align-items:center;
    justify-content:center;
    cursor:pointer;
    transition: transform .12s ease, filter .12s ease;
    position: relative;
  }
  .iconBtn:hover{ transform: translateY(-1px); filter: brightness(1.02); }
  .iconBtn:active{ transform: translateY(0px) scale(0.99); }
  .iconBtnDisabled{ opacity: 0.55; cursor: not-allowed; }

  .iconBtnCheck{
    background: rgba(230, 255, 238, 0.92);
    border-color: rgba(16, 185, 129, 0.35);
    color: #065f46;
  }

  .badgeCount{
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;

  display: flex;
  align-items: center;
  justify-content: center;

  background: #029cde;
  color: #fff;
  font-weight: 1000;
  font-size: 12px;
  line-height: 1;

  border: 2px solid rgba(255,255,255,0.95);
  box-shadow: 0 10px 18px rgba(0,0,0,0.22);
}

  .title{
    color: var(--ink);
    font-weight: 800;
    letter-spacing: 1px;
    font-size: 34px;
    text-shadow: 0 10px 22px rgba(0,0,0,0.25);
  }

  .pill{
    padding: 10px 16px;
    border-radius: 14px;
    background: rgba(255,255,255,0.18);
    border: 1px solid rgba(255,255,255,0.25);
    color: var(--ink);
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .homeBtns{
    width:100%;
    max-width:900px;
    display:flex;
    flex-direction:row;
    gap:28px;
    align-items:center;
    justify-content:center;
  }
  .homeBtn{
    flex:1;
    padding:22px 28px;
    border-radius:20px;
    font-family: var(--font-nunito), Nunito, sans-serif;
    font-weight:800;
    font-size:24px;
    letter-spacing:.8px;
    white-space:nowrap;
    text-align:center;
    color:#fff;
    background:#029cde;
    border:2px solid rgba(255,255,255,.35);
    box-shadow: 0 14px 32px rgba(2,156,222,.35), inset 0 1px 0 rgba(255,255,255,.25);
    cursor:pointer;
    transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
    position:relative;
    overflow:hidden;
  }
  .homeBtn:hover{
    background: #03a7ec;
    transform: translateY(-3px);
    box-shadow: 0 18px 40px rgba(2,156,222,0.45), inset 0 1px 0 rgba(255,255,255,0.35);
  }
  .homeBtn:active{
    transform: translateY(0px) scale(0.97);
    box-shadow: 0 6px 14px rgba(2,156,222,0.35), inset 0 2px 6px rgba(0,0,0,0.25);
  }

  .gridMenu2{
    width:100%;
    max-width:900px;
    margin:0 auto;
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap:28px;
  }

  .bigBtn{
    width:100%;
    height:84px;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:0 24px;
    border-radius:20px;
    font-family: var(--font-nunito), Nunito, sans-serif;
    font-weight:800;
    font-size:22px;
    letter-spacing:.8px;
    white-space:nowrap;
    text-align:center;
    color:#fff;
    background:#029cde;
    border:2px solid rgba(255,255,255,.35);
    box-shadow: 0 14px 32px rgba(2,156,222,.35), inset 0 1px 0 rgba(255,255,255,.25);
    cursor:pointer;
    transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
    position:relative;
    overflow:hidden;
  }
  .bigBtn:hover{ background:#03a7ec; transform:translateY(-3px); }
  .bigBtn:active{ transform:scale(.97); }
  .btnLabel{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  /* listagem */
  .listHeader{ margin-bottom: 14px; }
  .listTitle{
    color: #ffe600;
    font-weight: 900;
    letter-spacing: 1px;
    font-size: 20px;
    text-shadow: 0 10px 20px rgba(0,0,0,0.25);
  }
  .listSubTitle{
    margin-top: 0px;
    color: var(--ink);
    font-weight: 800;
    letter-spacing: 1px;
    font-size: 22px;
  }
  .searchRow{
    margin-top: 12px;
    display:flex;
    gap: 12px;
    align-items:center;
  }
  .searchBox{
    flex: 1;
    display:flex;
    align-items:center;
    gap: 10px;
    border-radius: 14px;
    padding: 10px 12px;
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.22);
    box-shadow: 0 14px 30px rgba(0,0,0,0.18);
  }
  .searchIcon{ color: rgba(255,255,255,0.92); display:flex; }
  .searchInput{
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    color: rgba(255,255,255,0.95);
    font-weight: 700;
    font-size: 15px;
  }
  .searchInput::placeholder{ color: rgba(255,255,255,0.75); }
  .chip{
    border-radius: 999px;
    padding: 10px 14px;
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.22);
    color: rgba(255,255,255,0.92);
    font-weight: 700;
    min-width: 120px;
    text-align:center;
  }

  .gridProdutos{
    display:grid;
    grid-template-columns: repeat(4, minmax(170px, 1fr));
    gap: 18px;
    margin-top: 14px;
    min-height: 420px;
  }

  .prodCard{
    border-radius: 18px;
    padding: 12px;
    background: rgba(0,0,0,0.0);
    border: 2px solid rgba(189, 155, 0, 0.35);
    box-shadow: 0 18px 34px rgba(0,0,0,0.20);
    cursor:pointer;
    transition: transform .12s ease, filter .12s ease;
    color: white;
  }
  .prodCard:hover{ transform: translateY(-2px); filter: brightness(1.03); }
  .prodCard:active{ transform: translateY(0px) scale(0.995); }

  .prodImgWrap{
    border-radius: 14px;
    overflow:hidden;
    background: rgba(255,255,255,0.18);
    border: 1px solid rgba(255,255,255,0.16);
    height: 134px;
    display:flex;
    align-items:center;
    justify-content:center;
  }
  .prodImg{ width: 100%; height: 100%; object-fit: cover; transform: scale(1.02); }

  .prodName{
    margin-top: 10px;
    font-weight: 900;
    letter-spacing: 0.6px;
    color: rgba(255,255,255,0.92);
    text-align:center;
    font-size: 14px;
    line-height: 1.2;
    min-height: 34px;
  }

  .emptyState{
    grid-column: 1 / -1;
    margin-top: 22px;
    padding: 20px;
    border-radius: 16px;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.18);
    color: rgba(255,255,255,0.92);
    font-weight: 800;
    text-align:center;
  }

  .pagerRow{
  display:flex;
  justify-content:flex-end;
  align-items:center;
  gap: 12px;
  margin-top: 12px;
}
  .pagerBtns{
    display:flex;
    align-items:center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 999px;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.18);
  }
  .pagerBtn{
    width: 42px;
    height: 34px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.35);
    background: rgba(220,233,246,0.90);
    color: #0b2b4d;
    cursor:pointer;
    display:flex;
    align-items:center;
    justify-content:center;
  }
  .pagerBtn:disabled{ opacity: 0.55; cursor:not-allowed; }
  .pagerInfo{ color: rgba(255,255,255,0.92); font-weight: 700; padding: 0 10px; }

  /* detalhe */
  .detailLayout{
    display:grid;
    grid-template-columns: 520px 1fr;
    gap: 18px;
    align-items: start;
    margin-top: 12px;
  }
  .detailLeft{ display:flex; flex-direction:column; gap: 12px; }
  .detailImgCard{
    position:relative;
    border-radius: 18px;
    overflow:hidden;
    background: rgba(255,255,255,0.14);
    border: 1px solid rgba(255,255,255,0.18);
    box-shadow: 0 20px 46px rgba(0,0,0,0.26);
    height: 330px;
  }
  .detailImg{ width: 100%; height: 100%; object-fit: cover; }
  .zoomBtn{
    position:absolute;
    right: 12px;
    bottom: 12px;
    width: 44px;
    height: 44px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.35);
    background: rgba(0,0,0,0.18);
    color: rgba(255,255,255,0.92);
    cursor:pointer;
  }

  .thumbRow{ display:flex; gap: 10px; align-items:center; }
  .thumb{
    width: 62px;
    height: 44px;
    border-radius: 10px;
    overflow:hidden;
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.10);
    cursor:pointer;
  }
  .thumbImg{ width:100%; height:100%; object-fit:cover; }

  .detailMeta{ display:flex; gap: 10px; flex-wrap:wrap; }
  .metaPill{
    padding: 9px 12px;
    border-radius: 999px;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.16);
    color: rgba(255,255,255,0.92);
    font-weight: 700;
  }

  .detailRight{
    border-radius: 18px;
    padding: 16px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 20px 46px rgba(0,0,0,0.22);
    min-height: 468px;
  }
  .detailTitle{
    color: rgba(255,255,255,0.95);
    font-weight: 900;
    letter-spacing: 1px;
    font-size: 28px;
    margin-bottom: 10px;
  }
  .bulletBox{ margin-top: 6px; display:flex; flex-direction:column; gap: 10px; }
  .bulletItem{
    display:flex;
    gap: 10px;
    color: rgba(255,255,255,0.92);
    font-weight: 700;
    line-height: 1.35;
    font-size: 14px;
  }
  .bulletDot{ color: rgba(255,255,255,0.92); font-size: 18px; line-height: 1; margin-top: 2px; }

  .detailActions{
    margin-top: 10px;
    display:flex;
    gap: 14px;
    justify-content:flex-start;
    align-items:center;
    flex-wrap: wrap;
  }
  .iconActionBtn{
    width: 54px;
    height: 54px;
    border-radius: 999px;
    background: #029cde;
    border: 2px solid rgba(255,255,255,0.35);
    box-shadow: var(--shadow);
    color: #fff;
    display:flex;
    align-items:center;
    justify-content:center;
    cursor:pointer;
    transition: transform .12s ease, filter .12s ease;
  }
  .iconActionBtn:hover{ filter: brightness(1.02); transform: translateY(-1px); }
  .iconActionBtn:active{ transform: translateY(0px) scale(0.995); }
  .iconActionBtn:disabled{ opacity: 0.70; cursor: not-allowed; }
  .iconActionBtnSelected{
    background: rgba(230, 255, 238, 0.92);
    border-color: rgba(16, 185, 129, 0.35);
    color: #065f46;
  }

  .stepperRow{
  position: absolute;
  right: 26px;   /* mesma distância da borda direita */
  bottom: 22px;  /* distância da borda de baixo */
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  z-index: 5;
}
  .stepBtn{
    border-radius: 14px;
    padding: 12px 14px;
    background: #029cde;
    border: 2px solid rgba(255,255,255,0.35);
    box-shadow: var(--shadow);
    color: #fff;
    font-weight: 1000;
    letter-spacing: 1px;
    cursor:pointer;
    min-width: 170px;
  }
  .stepBtn:hover{ filter: brightness(1.02); transform: translateY(-1px); }
  .stepBtn:active{ transform: translateY(0px) scale(0.995); }
  .stepBtnGhost{
    background: rgba(220,233,246,0.92);
    color: #111;
    border: 2px solid rgba(255,255,255,0.55);
    min-width: 140px;
  }

  .ctaBtn{
    border-radius: 14px;
    padding: 14px 16px;
    background: rgba(220,233,246,0.92);
    border: 2px solid rgba(255,255,255,0.55);
    box-shadow: var(--shadow);
    color: #111;
    font-weight: 900;
    letter-spacing: 1px;
    cursor:pointer;
    min-width: 220px;
  }
  .ctaBtn:hover{ filter: brightness(1.02); transform: translateY(-1px); }
  .ctaBtn:active{ transform: translateY(0px) scale(0.995); }

  /* modal */
  .modalOverlay{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 18px;
  z-index: 999;
}
  .modalCard{
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(20,68,120,0.98), rgba(12,46,92,0.98));
  border: 1px solid rgba(255,255,255,0.18);
  box-shadow: 0 30px 70px rgba(0,0,0,0.5);
  overflow: hidden;

  display: flex;
  flex-direction: column;

  /* NÃO estoura tela */
  max-height: min(88vh, 740px);
}
  .modalHeader{
  display:flex;
  align-items:center;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid rgba(255,255,255,0.14);
}

.modalTitle{
  color: rgba(255,255,255,0.95);
  font-weight: 900;
  letter-spacing: 0.8px;
  font-size: 18px;
  line-height: 1;
}

.modalClose{
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.92);
  cursor:pointer;
  flex: 0 0 auto;
}
  .modalBody{
  padding: 14px;
  color: rgba(255,255,255,0.92);

  /* ✅ área rolável */
  flex: 1 1 auto;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

.modalFooter{
  flex: 0 0 auto;
  padding: 14px;
  border-top: 1px solid rgba(255,255,255,0.14);
  display:flex;
  justify-content:flex-end;
}

  /* forms */
  .formGrid{ display:grid; gap: 12px; }
  .formField{ display:grid; gap: 6px; font-weight: 900; color: rgba(255,255,255,0.95); }
  .formField span{ font-size: 12px; letter-spacing: 0.6px; opacity: 0.95; }
  .formInput{
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.95);
    padding: 12px 12px;
    border-radius: 12px;
    outline: none;
    font-weight: 800;
  }
  .formInput::placeholder{ color: rgba(255,255,255,0.65); }

  /* users */
  .usersGrid{
  display:grid;
  grid-template-columns: 1fr;     /* ✅ sempre 1 coluna */
  gap: 12px;

  max-height: min(56vh, 520px);
  overflow: auto;
  padding-right: 4px;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 1100px){
  .usersGrid{ grid-template-columns: 1fr; }
}
  .userCard{
    text-align:left;
    padding: 12px;
    border-radius: 14px;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.18);
    cursor:pointer;
    color: rgba(255,255,255,0.92);
    font-weight: 900;
  }

    /* ✅ user picker (lista vertical) */
  .userPickerSearch{
    width: 100%;
    display:flex;
    align-items:center;
    gap: 10px;
    border-radius: 14px;
    padding: 12px 12px;
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.22);
    box-shadow: 0 14px 30px rgba(0,0,0,0.18);
    margin-bottom: 12px;
  }

  .userPickerIcon{
    color: rgba(255,255,255,0.92);
    display:flex;
    flex: 0 0 auto;
  }

  .userPickerInput{
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    color: rgba(255,255,255,0.95);
    font-weight: 800;
    font-size: 15px;
  }
  .userPickerInput::placeholder{ color: rgba(255,255,255,0.75); }

  .userPickerResults{
    display: grid;
    gap: 10px;
    max-height: min(56vh, 520px);
    overflow: auto;
    padding-right: 4px;
    -webkit-overflow-scrolling: touch;
  }

  .userRow{
    width: 100%;
    text-align:left;
    padding: 12px 14px;
    border-radius: 14px;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.18);
    cursor:pointer;
    color: rgba(255,255,255,0.92);
    font-weight: 900;

    display:flex;
    align-items:center;
    justify-content: space-between;
    gap: 10px;
  }

  .userRowLeft{
    display:flex;
    flex-direction:column;
    gap: 4px;
    min-width: 0;
  }

  .userRow .userName{
    font-size: 15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .userRow .userUser{
    opacity: 0.9;
    font-size: 12px;
  }

  .userRowActive{
    outline: 2px solid rgba(2,156,222,0.55);
    filter: brightness(1.03);
  }

  .userRowSelected{
    border-color: rgba(16, 185, 129, 0.55);
    background: rgba(16, 185, 129, 0.12);
  }

  .userRowCheck{
    width: 34px;
    height: 34px;
    border-radius: 999px;
    display:flex;
    align-items:center;
    justify-content:center;
    font-weight: 1000;
    color: #065f46;
    background: rgba(230, 255, 238, 0.92);
    border: 1px solid rgba(16, 185, 129, 0.35);
    flex: 0 0 auto;
  }
  .userCard:hover{ filter: brightness(1.03); transform: translateY(-1px); }
  .userName{ font-size: 15px; }
  .userUser{ margin-top: 4px; opacity: 0.9; font-size: 12px; }

  .errorBox{
    margin-bottom: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(239,68,68,0.16);
    border: 1px solid rgba(239,68,68,0.35);
    color: rgba(255,255,255,0.95);
    font-weight: 900;
  }

  .inicioTopHint{
    margin-bottom: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.14);
    font-weight: 900;
  }

  /* orçamentos */
  .budgetsWrap{ padding: 0 26px 24px 26px; }
  .budgetGrid{
    display:grid;
    grid-template-columns: repeat(3, minmax(240px, 1fr));
    gap: 16px;
  }
  .budgetCard{
    text-align:left;
    padding: 14px;
    border-radius: 18px;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.18);
    box-shadow: 0 18px 34px rgba(0,0,0,0.18);
    cursor:pointer;
    color: rgba(255,255,255,0.94);
    transition: transform .12s ease, filter .12s ease;
  }
  .budgetCard:hover{ transform: translateY(-2px); filter: brightness(1.03); }
  .budgetCard:active{ transform: translateY(0px) scale(0.995); }
  .budgetTop{ display:grid; gap: 6px; }
  .budgetTitle{ font-weight: 1000; font-size: 18px; letter-spacing: 0.5px; }
  .budgetMeta{ font-weight: 800; opacity: 0.95; }
  .budgetBottom{
    margin-top: 12px;
    display:flex;
    align-items:center;
    justify-content: space-between;
    gap: 10px;
  }
  .budgetSmall{ font-weight: 800; opacity: 0.95; }
  .budgetTotal{
    font-weight: 1000;
    background: rgba(2,156,222,0.30);
    border: 1px solid rgba(2,156,222,0.40);
    padding: 8px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }

  /* resumo */
  .resumoTopBar{
    position:absolute;
    top: 18px;
    right: 18px;
    display:flex;
    gap: 10px;
    z-index: 5;
  }
  .resumoBtn{ background: rgba(222,234,246,0.92); }
  .resumoTitle{
    text-align:center;
    color: rgba(255,255,255,0.95);
    font-weight: 1000;
    letter-spacing: 1px;
    font-size: 34px;
    text-shadow: 0 10px 22px rgba(0,0,0,0.25);
    margin-top: 10px;
  }
  .resumoCard{
    margin-top: 16px;
    border-radius: 14px;
    background: rgba(255,255,255,0.86);
    border: 1px solid rgba(255,255,255,0.55);
    overflow:hidden;
    box-shadow: 0 20px 46px rgba(0,0,0,0.20);
  }

  .resumoHeader2{
    display:grid;
    grid-template-columns: 360px 1fr 220px;
    gap: 10px;
    padding: 14px 14px 10px 14px;
    background: rgba(255,255,255,0.92);
    border-bottom: 1px solid rgba(2, 156, 222, 0.22);
    align-items: start;
  }
  .resumoHeaderLeft{
    display:flex;
    align-items:flex-start;
    gap: 12px;
  }
  .resumoLogoTopLeft{
    width: 120px;
    height: auto;
    object-fit: contain;
  }
  .resumoOrcBlock{
    display:flex;
    flex-direction:column;
  }
  .resumoOrcMain{
    font-weight: 1000;
    color: #0b2b4d;
    letter-spacing: 1px;
    font-size: 22px;
  }
  .resumoOrcSub{
    margin-top: 2px;
    font-weight: 900;
    color: #0b2b4d;
    opacity: 0.9;
  }

  .resumoLine{
    color: #0b2b4d;
    font-weight: 800;
    font-size: 13px;
    line-height: 1.35;
  }
  .resumoInfo{ display:grid; gap: 2px; }
  .resumoDate{ display:flex; justify-content:flex-end; }

  .resumoTable{
    padding: 0 14px;
    background: rgba(255,255,255,0.92);
  }
  .resumoTableHead2{
    display:grid;
    grid-template-columns: 200px 1fr 90px 140px;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 2px solid rgba(2,156,222,0.35);
    color: #0b2b4d;
    font-weight: 1000;
  }
  .resumoRow2{
    display:grid;
    grid-template-columns: 200px 1fr 90px 140px;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid rgba(15,23,42,0.10);
    color: #0b2b4d;
    font-weight: 800;
  }
  .resumoItemName{ text-transform: uppercase; }
  .resumoCat{ font-weight: 1000; }

  .resumoBottom{
    display:flex;
    align-items:center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    background: rgba(255,255,255,0.92);
  }
  .resumoValidade{
    color: #0b2b4d;
    font-weight: 900;
    font-size: 16px;
  }
  .resumoTotalBox{
    display:flex;
    align-items:center;
    gap: 12px;
  }
  .resumoTotalLabel{
    color: #0b2b4d;
    font-weight: 1000;
  }
  .resumoTotalValue{
    background: #029cde;
    color: #fff;
    font-weight: 1000;
    padding: 8px 12px;
    border-radius: 10px;
    box-shadow: 0 14px 32px rgba(2,156,222,.25);
    min-width: 160px;
    text-align:right;
    letter-spacing: 0.5px;
  }

  /* revisão */
  .reviewHeader{
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.14);
    display:grid;
    gap: 6px;
    font-weight: 900;
    margin-bottom: 12px;
  }
  .reviewLine{ font-weight: 900; }

  .reviewWrap{
    display:grid;
    gap: 12px;
    max-height: min(56vh, 520px);
    overflow: auto;
    padding-right: 4px;
    -webkit-overflow-scrolling: touch;
  }

  .reviewBlock{
    border-radius: 14px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.14);
    overflow:hidden;
  }
  .reviewCat{
    padding: 10px 12px;
    font-weight: 1000;
    background: rgba(255,255,255,0.08);
    border-bottom: 1px solid rgba(255,255,255,0.12);
  }
  .reviewItems{
    padding: 10px 12px;
    display:grid;
    gap: 10px;
  }
  .reviewItemRow{
    display:flex;
    align-items:center;
    justify-content: space-between;
    gap: 12px;
  }
  .reviewItemName{ font-weight: 1000; }
  
  .reviewItemRight{ display:flex; align-items:center; gap: 10px; }
  .reviewItemPrice{ font-weight: 1000; white-space: nowrap; }
  .reviewRemoveBtn{
    width: 34px;
    height: 34px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.10);
    color: rgba(255,255,255,0.92);
    cursor:pointer;
    font-weight: 1000;
    line-height: 1;
  }
  .reviewRemoveBtn:hover{ filter: brightness(1.05); transform: translateY(-1px); }
  .reviewRemoveBtn:active{ transform: translateY(0px) scale(0.99); }

  @media (max-width: 1100px){
    .gridProdutos{ grid-template-columns: repeat(3, minmax(170px, 1fr)); }
    .detailLayout{ grid-template-columns: 1fr; }
    .detailImgCard{ height: 300px; }
    .budgetGrid{ grid-template-columns: repeat(2, minmax(240px, 1fr)); }
    .resumoHeader2{ grid-template-columns: 1fr; }
    .resumoDate{ justify-content:flex-start; }
    .usersGrid{ grid-template-columns: 1fr; }
  }
  @media (max-width: 760px){
    .gridMenu2{ grid-template-columns: 1fr; }
    .gridProdutos{ grid-template-columns: repeat(2, minmax(160px, 1fr)); }
    .budgetGrid{ grid-template-columns: 1fr; }
    .resumoTableHead2, .resumoRow2{ grid-template-columns: 140px 1fr 60px 110px; }
    .stepperRow{ justify-content: space-between; }
    .stepBtn{ min-width: 0; width: 100%; }
  }

    .reviewHeaderRow{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 16px;
    align-items: center;
  }

  @media (max-width: 760px){
    .reviewHeaderRow{
      grid-template-columns: 1fr;
    }
  }

  .reviewItemNameBtn{
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    text-align: left;
    cursor: pointer;
    color: rgba(255,255,255,0.95);
    font-weight: 1000;
    font-size: 14px;
  }

  .reviewItemNameBtn:hover{
    text-decoration: underline;
    filter: brightness(1.05);
  }
`;