"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

/**
 * PAGE ÚNICA (page.tsx) — CATÁLOGO + ORÇAMENTOS (protótipo)
 * - Home: Elementos / Lista de Orçamentos
 * - Elementos -> Linhas -> Listagem -> Detalhe (adiciona no "carrinho" do orçamento com +)
 * - Botão ✅ (ao lado de Voltar/Home/Lista): pede Responsável/Falecido/Telefone e cria Orçamento
 * - Lista de Orçamentos: mostra Responsável + Falecido; clique abre Resumo da Homenagem
 * - Resumo: botão 🖨️ exporta PDF (jsPDF + autoTable). Botão ✅ fica “sem função” (você altera depois)
 */

type CatalogGroup =
    | "home"
    | "elementos"
    | "urnas_linhas"
    | "listagem"
    | "detalhe"
    | "orcamentos"
    | "resumo";

type Categoria = "URNAS" | "ROUPAS" | "ORNAMENTACAO" | "PREPARACAO" | "AMBIENTACAO";
type Linha = "SERENIDADE" | "HARMONIA" | "ESSENCIA" | "ETERNUM" | "ALVORADA" | "AMPARO";

type Produto = {
    id: number;
    categoria: Categoria;
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
    valorUnit: number;
    qtd: number;
};

type Orcamento = {
    id: string;
    criadoEmISO: string;
    responsavel: string;
    falecido: string;
    telefone: string;
    itens: OrcamentoItem[];
};

const BG_IMAGE = "https://pai.planoassistencialintegrado.com.br/catalogo.png";
const LOGO_URL_UI = "https://pai.planoassistencialintegrado.com.br/logo.png"; // canto inferior direito (tela)
const LOGO_URL_PDF = "https://pai.planoassistencialintegrado.com.br/logo.png"; // pdf

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
function escapeCsvCell(v: any, sep: string) {
    const s = String(v ?? "");
    const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(sep);
    const x = s.replace(/"/g, '""');
    return mustQuote ? `"${x}"` : x;
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

// ---------- mock data ----------
const LINHAS: Array<{ id: Linha; title: string }> = [
    { id: "SERENIDADE", title: "LINHA\nSERENIDADE" },
    { id: "HARMONIA", title: "LINHA\nHARMONIA" },
    { id: "ESSENCIA", title: "LINHA\nESSENCIA" },
    { id: "ETERNUM", title: "LINHA\nETERNUM" },
    { id: "ALVORADA", title: "LINHA\nALVORADA" },
    { id: "AMPARO", title: "LINHA\nAMPARO" },
];

const mockProdutos: Produto[] = [
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
        especificacoes: "Madeira nobre • acabamento acetinado • detalhes em textura • alças discretas • forração interna premium.",
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
        especificacoes: "MDF premium • pintura especial • detalhes em frisos • forração interna • fecho reforçado.",
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
        especificacoes: "Madeira maciça • verniz fosco • cantos arredondados • forração interna • suporte de alças.",
    },
    {
        id: 301,
        categoria: "URNAS",
        linha: "ESSENCIA",
        nome: "Urna Essencia Clássica",
        preco: 1290,
        saldo: 11,
        thumb: mockImg("URNA CLÁSSICA", 110),
        descricaoCurta: "Clássico atemporal com ótimo custo-benefício.",
        inspiracao: "Essência é o que permanece: simplicidade com significado e presença.",
        conceito: "Linha pensada para atender com dignidade, sem abrir mão da estética e da qualidade.",
        especificacoes: "Estrutura resistente • acabamento padrão • forração interna • fecho simples • encaixes firmes.",
    },
    {
        id: 401,
        categoria: "URNAS",
        linha: "ETERNUM",
        nome: "Urna Eternum Lux",
        preco: 2590,
        saldo: 1,
        thumb: mockImg("URNA LUX", 190),
        descricaoCurta: "Luxo e detalhes marcantes para uma homenagem inesquecível.",
        inspiracao: "Eternum simboliza memória duradoura e respeito, com um design mais sofisticado.",
        conceito: "Produto premium com foco em acabamento e elegância para cerimônias especiais.",
        especificacoes: "Madeira selecionada • detalhes em alto-relevo • forração premium • sistema de fechamento reforçado.",
    },
    {
        id: 501,
        categoria: "URNAS",
        linha: "ALVORADA",
        nome: "Urna Alvorada Brisa",
        preco: 1390,
        saldo: 5,
        thumb: mockImg("URNA BRISA", 220),
        descricaoCurta: "Leveza visual com acabamento delicado e moderno.",
        inspiracao: "Alvorada remete a luz suave e esperança — um tributo com serenidade.",
        conceito: "Uma linha de estética clean e aconchegante para despedidas com delicadeza.",
        especificacoes: "Acabamento clean • bordas suaves • forração interna • detalhes minimalistas.",
    },
    {
        id: 601,
        categoria: "URNAS",
        linha: "AMPARO",
        nome: "Urna Amparo Confort",
        preco: 1190,
        saldo: 7,
        thumb: mockImg("URNA CONFORT", 260),
        descricaoCurta: "Conforto e acolhimento em cada detalhe.",
        inspiracao: "Amparo é cuidado — uma proposta de acolhimento e presença gentil.",
        conceito: "Ideal para famílias que preferem um design simples, bem construído e respeitoso.",
        especificacoes: "Estrutura robusta • acabamento padrão • forração interna • fecho reforçado.",
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
    checkBadge,
}: {
    onBack: () => void;
    onHome: () => void;
    onList: () => void;
    onCheck?: () => void;
    disabledBack?: boolean;
    showCheck?: boolean;
    checkBadge?: string | number;
}) {
    return (
        <div style={{ position: "absolute", top: 18, right: 18, display: "flex", gap: 10, zIndex: 5 }}>
            <button type="button" onClick={onBack} disabled={disabledBack} className={cn("iconBtn", disabledBack && "iconBtnDisabled")} aria-label="Voltar" title="Voltar">
                <IconBack />
            </button>

            <button type="button" onClick={onHome} className="iconBtn" aria-label="Home" title="Home">
                <IconHome />
            </button>

            <button type="button" onClick={onList} className="iconBtn" aria-label="Lista" title="Lista">
                <IconList />
            </button>

            {showCheck ? (
                <button type="button" onClick={onCheck} className="iconBtn iconBtnCheck" aria-label="Finalizar orçamento" title="Finalizar orçamento">
                    <IconCheck />
                    {checkBadge ? <span className="badge">{checkBadge}</span> : null}
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
}: {
    open: boolean;
    title: string;
    children: React.ReactNode;
    onClose: () => void;
    footer?: React.ReactNode;
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
            <div className="modalCard">
                <div className="modalHeader">
                    <div className="modalTitle">{title}</div>
                    <button type="button" className="modalClose" onClick={onClose} aria-label="Fechar modal" title="Fechar">
                        ✕
                    </button>
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

// ---------- main page ----------
export default function Page() {
    const [stack, setStack] = useState<CatalogGroup[]>(["home"]);
    const current = stack[stack.length - 1];

    const [categoria, setCategoria] = useState<Categoria | null>(null);
    const [linha, setLinha] = useState<Linha | null>(null);
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const pageSize = 8;

    const [selected, setSelected] = useState<Produto | null>(null);
    const [openPrices, setOpenPrices] = useState(false);

    // “Carrinho” do orçamento em construção
    const [draftItens, setDraftItens] = useState<OrcamentoItem[]>([]);
    const draftCount = useMemo(() => draftItens.reduce((a, b) => a + clampInt(b.qtd), 0), [draftItens]);

    // Orçamentos salvos (lista)
    const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
    const [orcamentoSelecionadoId, setOrcamentoSelecionadoId] = useState<string | null>(null);

    // Modal de finalizar orçamento
    const [openFinalize, setOpenFinalize] = useState(false);
    const [formResp, setFormResp] = useState("");
    const [formFalecido, setFormFalecido] = useState("");
    const [formTel, setFormTel] = useState("");

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
    }, []);

    const goBudgets = useCallback(() => {
        setStack(["home", "orcamentos"]);
    }, []);

    const list = useCallback(() => {
        // “Lista” (ícone) continua indo para Elementos/Listagem dependendo do contexto
        if (categoria) {
            if (categoria === "URNAS") setStack(["home", "elementos", "urnas_linhas", "listagem"]);
            else setStack(["home", "elementos", "listagem"]);
            return;
        }
        setStack(["home", "elementos"]);
    }, [categoria]);

    const elementosMenu = useMemo(() => {
        return [
            {
                key: "urnas",
                title: "URNAS",
                action: () => {
                    setCategoria("URNAS");
                    setLinha(null);
                    setQ("");
                    setPage(1);
                    go("urnas_linhas");
                },
            },
            { key: "apresentacao", title: "APRESENTAÇÃO", action: () => console.info("Mock: submenu") },
            { key: "espaco", title: "ESPAÇO DE\nDESPEDIDA", action: () => console.info("Mock: submenu") },
            { key: "prep", title: "PREPARAÇÃO E\nCUIDADO", action: () => console.info("Mock: submenu") },
            { key: "amb", title: "AMBIENTAÇÃO", action: () => console.info("Mock: submenu") },
            { key: "cuidados", title: "CUIDADOS\nADICIONAIS", action: () => console.info("Mock: submenu") },
        ] as Array<{ key: string; title: string; action: () => void }>;
    }, [go]);

    // Se categoria não suporta linha, zera linha
    useEffect(() => {
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

    useEffect(() => {
        if (current !== "listagem") return;
        if (!categoria) setCategoria("URNAS");
        if ((categoria ?? "URNAS") === "URNAS" && !linha) setLinha("SERENIDADE");
    }, [current, categoria, linha]);

    const openProduct = useCallback(
        (p: Produto) => {
            setSelected(p);
            if (current !== "detalhe") go("detalhe");
        },
        [current, go]
    );

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

    // ---------- draft orçamento: add / remove ----------
    const addToDraft = useCallback((p: Produto) => {
        setDraftItens((prev) => {
            const idx = prev.findIndex((x) => x.produtoId === p.id);
            if (idx >= 0) {
                const copy = prev.slice();
                copy[idx] = { ...copy[idx], qtd: clampInt(copy[idx].qtd) + 1 };
                return copy;
            }
            return [...prev, { produtoId: p.id, nome: p.nome, valorUnit: Number(p.preco) || 0, qtd: 1 }];
        });
    }, []);

    const draftTotal = useMemo(() => {
        let t = 0;
        for (const it of draftItens) t += clampInt(it.qtd) * (Number(it.valorUnit) || 0);
        return t;
    }, [draftItens]);

    const openFinalizeModal = useCallback(() => {
        if (!draftItens.length) {
            alert("Nenhum item no orçamento. Adicione itens com o botão +.");
            return;
        }
        setFormResp("");
        setFormFalecido("");
        setFormTel("");
        setOpenFinalize(true);
    }, [draftItens.length]);

    const createOrcamento = useCallback(() => {
        const responsavel = formResp.trim();
        const falecido = formFalecido.trim();
        const telefone = formTel.trim();

        if (!responsavel || !falecido || !telefone) {
            alert("Preencha Responsável, Falecido(a) e Telefone.");
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
            responsavel,
            falecido,
            telefone,
            itens: draftItens.map((x) => ({ ...x, qtd: clampInt(x.qtd) })),
        };

        setOrcamentos((prev) => [novo, ...prev]);
        setDraftItens([]);
        setOpenFinalize(false);

        // vai para Lista de Orçamentos
        setOrcamentoSelecionadoId(null);
        setStack(["home", "orcamentos"]);
    }, [draftItens, formResp, formFalecido, formTel]);

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

    // ---------- EXPORT CSV/PDF (Resumo) ----------
    const exportarResumoCSV = useCallback((o: Orcamento) => {
        const sep = ";";
        const header = ["Item", "Quantidade", "Valor (un)", "Subtotal"];

        const lines: string[] = [];
        lines.push("\uFEFF" + header.map((h) => escapeCsvCell(h, sep)).join(sep));

        for (const it of o.itens) {
            const sub = clampInt(it.qtd) * (Number(it.valorUnit) || 0);
            lines.push([it.nome, clampInt(it.qtd), formatBRL(Number(it.valorUnit) || 0), formatBRL(sub)].map((x) => escapeCsvCell(x, sep)).join(sep));
        }

        lines.push(["TOTAL", "", "", formatBRL(totalOrcamentoSelecionado)].map((x) => escapeCsvCell(x, sep)).join(sep));

        const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const safeName = `orcamento_${o.id}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }, [totalOrcamentoSelecionado]);

    const exportarResumoPDF = useCallback(async (o: Orcamento) => {
        if (!o.itens.length) {
            alert("Nenhum item para exportar.");
            return;
        }

        const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

        const logoDataUrl = await toDataUrl(LOGO_URL_PDF);
        const logoFormat = logoDataUrl?.startsWith("data:image/jpeg") ? "JPEG" : "PNG";

        const dt = new Date(o.criadoEmISO);
        const dataBR = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(dt);
        const geradoEm = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());

        // A4 landscape (fica parecido com o “relatório” que você mostrou)
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

        const pageW = doc.internal.pageSize.getWidth();
        const marginX = 12;
        let y = 12;

        // Header
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("Resumo da Homenagem", marginX, y + 6);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        doc.text(`Gerado em: ${geradoEm}`, pageW - marginX, y + 6, { align: "right" });

        y += 12;

        // “Faixa” com dados
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(marginX, y, pageW - marginX * 2, 20, 2, 2, "FD");

        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.text(`ORÇAMENTO Nº ${o.id}`, marginX + 3, y + 6);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 41, 59);
        doc.text(`Responsável: ${o.responsavel}`, marginX + 55, y + 6);
        doc.text(`Falecido(a): ${o.falecido}`, marginX + 55, y + 12);
        doc.text(`Telefone: ${o.telefone}`, marginX + 55, y + 18);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(`Data: ${dataBR}`, pageW - marginX - 3, y + 6, { align: "right" });

        y += 26;

        // Tabela
        const head = ["Item", "Qtd", "Valor (un)", "Subtotal"];
        const body = o.itens.map((it) => {
            const qtd = clampInt(it.qtd);
            const v = Number(it.valorUnit) || 0;
            const sub = qtd * v;
            return [it.nome, String(qtd), formatBRL(v), formatBRL(sub)];
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
                0: { cellWidth: 180, overflow: "linebreak" },
                1: { halign: "right", cellWidth: 18 },
                2: { halign: "right", cellWidth: 32 },
                3: { halign: "right", cellWidth: 34 },
            },
            didParseCell: (data) => {
                if (data.section === "body" && data.column.index === 1) data.cell.styles.halign = "right";
                if (data.section === "body" && data.column.index >= 2) data.cell.styles.halign = "right";
            },
        });

        const afterY = (doc as any).lastAutoTable?.finalY ?? y;

        // Total “box” no canto direito
        const boxW = 54;
        const boxH = 12;
        const boxX = pageW - marginX - boxW;
        const boxY = afterY + 6;

        doc.setFillColor(2, 156, 222);
        doc.setDrawColor(2, 156, 222);
        doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, "F");

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(formatBRL(total), boxX + boxW - 3, boxY + 8, { align: "right" });

        // Rodapé com logo no canto inferior direito
        if (logoDataUrl) {
            const imgW = 40;
            const imgH = 12;
            const yLogo = doc.internal.pageSize.getHeight() - 14 - imgH;
            doc.addImage(logoDataUrl, logoFormat as any, pageW - marginX - imgW, yLogo, imgW, imgH);
        }

        const safeName = `orcamento_${o.id}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`.replace(/\s+/g, "_");
        doc.save(`${safeName}.pdf`);
    }, []);

    // ---------- screens ----------
    const ScreenHome = (
        <ScreenContainer>
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div className="homeBtns">
                    <button type="button" className="homeBtn" onClick={() => go("elementos")}>
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
            <TopRightNav onBack={back} onHome={home} onList={list} onCheck={openFinalizeModal} disabledBack={!canBack} checkBadge={draftCount || ""} />
            <Title>ELEMENTOS DE HOMENAGEM</Title>

            <div className="gridMenu2">
                {elementosMenu.map((it) => (
                    <BigButton key={it.key} label={it.title} onClick={it.action} />
                ))}
            </div>

            <div className="draftHint">
                <div className="draftHintBox">
                    <b>Itens no orçamento:</b> {draftCount} • <b>Total:</b> {formatBRL(draftTotal)}
                </div>
            </div>
        </ScreenContainer>
    );

    const ScreenLinhas = (
        <ScreenContainer>
            <TopRightNav onBack={back} onHome={home} onList={list} onCheck={openFinalizeModal} disabledBack={!canBack} checkBadge={draftCount || ""} />
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
                            go("listagem");
                        }}
                    />
                ))}
            </div>
        </ScreenContainer>
    );

    const ScreenListagem = (
        <ScreenContainer>
            <TopRightNav onBack={back} onHome={home} onList={list} onCheck={openFinalizeModal} disabledBack={!canBack} checkBadge={draftCount || ""} />

            <div style={{ padding: "22px 26px 0 26px" }}>
                <div className="listHeader">
                    <div className="listTitle">PÁGINA DE LISTAGEM DE PRODUTOS</div>

                    <div className="listSubTitle">
                        {categoria ? `${categoria}` : "CATÁLOGO"} {linha ? `• LINHA ${linha}` : ""}
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
                        <button type="button" className="pagerBtn" onClick={() => setPage((x) => Math.max(1, x - 1))} disabled={page <= 1} aria-label="Página anterior">
                            <IconChevron dir="left" />
                        </button>
                        <div className="pagerInfo">
                            Página <b>{page}</b> de <b>{totalPages}</b>
                        </div>
                        <button type="button" className="pagerBtn" onClick={() => setPage((x) => Math.min(totalPages, x + 1))} disabled={page >= totalPages} aria-label="Próxima página">
                            <IconChevron dir="right" />
                        </button>
                    </div>
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
                    setStack((s) => {
                        const idx = s.lastIndexOf("listagem");
                        if (idx >= 0) return s.slice(0, idx + 1);
                        return ["home", "elementos"];
                    });
                }}
                onCheck={openFinalizeModal}
                checkBadge={draftCount || ""}
            />

            <div style={{ padding: "22px 26px 0 26px" }}>
                <div className="listTitle" style={{ marginBottom: 10 }}>
                    PÁGINA DE APRESENTAÇÃO DO PRODUTO
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

                            <div className="detailMeta">
                                <div className="metaPill">
                                    <b>Saldo:</b> {selected.saldo}
                                </div>
                                {selected.linha ? (
                                    <div className="metaPill">
                                        <b>Linha:</b> {selected.linha}
                                    </div>
                                ) : null}
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

                                    <button
                                        type="button"
                                        className="iconActionBtn"
                                        onClick={() => addToDraft(selected)}
                                        aria-label="Adicionar a orçamento"
                                        title="Adicionar a orçamento"
                                    >
                                        <IconPlus />
                                    </button>

                                    <div className="draftMini">
                                        <div>
                                            <b>Itens:</b> {draftCount}
                                        </div>
                                        <div>
                                            <b>Total:</b> {formatBRL(draftTotal)}
                                        </div>
                                    </div>
                                </div>
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
            <TopRightNav onBack={back} onHome={home} onList={list} onCheck={openFinalizeModal} disabledBack={!canBack} checkBadge={draftCount || ""} />
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
                                        <div className="budgetMeta">Responsável: <b>{o.responsavel}</b></div>
                                    </div>

                                    <div className="budgetBottom">
                                        <div className="budgetSmall">Data: <b>{dataBR}</b></div>
                                        <div className="budgetSmall">Itens: <b>{o.itens.reduce((a, b) => a + clampInt(b.qtd), 0)}</b></div>
                                        <div className="budgetTotal">{formatBRL(total)}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="emptyState" style={{ margin: "0 26px" }}>
                        Nenhum orçamento ainda. Adicione itens com <b>+</b> e finalize com <b>✅</b>.
                    </div>
                )}
            </div>
        </ScreenContainer>
    );

    const ScreenResumo = (
        <ScreenContainer>
            <div className="resumoTopBar">
                {/* ✅ deixa o visto aí (sem função por enquanto) */}
                <button type="button" className="iconBtn resumoBtn" onClick={() => console.info("Visto (sem função por enquanto)")} title="Visto">
                    <IconCheck />
                </button>

                <button
                    type="button"
                    className="iconBtn resumoBtn"
                    onClick={() => (orcamentoSelecionado ? exportarResumoPDF(orcamentoSelecionado) : null)}
                    title="Imprimir (PDF)"
                >
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
                        <div className="resumoHeader">
                            <div className="resumoOrc">
                                <div className="resumoOrcMain">ORÇAMENTO</div>
                                <div className="resumoOrcSub">Nº {orcamentoSelecionado.id}</div>
                            </div>

                            <div className="resumoInfo">
                                <div className="resumoLine">
                                    <b>Responsável:</b> {orcamentoSelecionado.responsavel}
                                </div>
                                <div className="resumoLine">
                                    <b>Falecido:</b> {orcamentoSelecionado.falecido}
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
                            <div className="resumoTableHead">
                                <div>Item</div>
                                <div style={{ textAlign: "right" }}>Qtd</div>
                                <div style={{ textAlign: "right" }}>Valor</div>
                            </div>

                            {orcamentoSelecionado.itens.map((it, idx) => (
                                <div key={`${it.produtoId}-${idx}`} className="resumoRow">
                                    <div className="resumoItemName">{it.nome}</div>
                                    <div style={{ textAlign: "right" }}>{clampInt(it.qtd)}</div>
                                    <div style={{ textAlign: "right" }}>{formatBRL((Number(it.valorUnit) || 0) * clampInt(it.qtd))}</div>
                                </div>
                            ))}
                        </div>

                        <div className="resumoBottom">
                            <div className="resumoValidade">Orçamento válido por <b>07</b> dias</div>

                            <div className="resumoTotalBox">
                                <div className="resumoTotalLabel">Total</div>
                                <div className="resumoTotalValue">{formatBRL(totalOrcamentoSelecionado)}</div>
                            </div>
                        </div>

                        <div className="resumoFooter">
                            <div className="resumoPay">
                                <div className="resumoPayTitle">Condições de pagamento</div>
                                <div className="resumoPayRow">
                                    <div>À vista</div>
                                    <div className="resumoPayVal">{formatBRL(Math.max(0, totalOrcamentoSelecionado - 381))}</div>
                                </div>
                                <div className="resumoPayRow">
                                    <div>À prazo</div>
                                    <div className="resumoPayVal">até 6 vezes</div>
                                </div>

                                <div className="resumoExportRow">
                                    <button type="button" className="smallBtn" onClick={() => exportarResumoCSV(orcamentoSelecionado)}>
                                        Exportar CSV
                                    </button>
                                </div>
                            </div>

                            <img src={LOGO_URL_UI} alt="PAI" className="resumoLogo" />
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

            <Modal
                open={openFinalize}
                title="Finalizar orçamento"
                onClose={() => setOpenFinalize(false)}
                footer={
                    <div style={{ display: "flex", gap: 10 }}>
                        <button type="button" className="ctaBtn" onClick={() => setOpenFinalize(false)} style={{ minWidth: 160 }}>
                            CANCELAR
                        </button>
                        <button type="button" className="ctaBtn" onClick={createOrcamento} style={{ minWidth: 220 }}>
                            OK • ENVIAR PARA LISTA
                        </button>
                    </div>
                }
            >
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
                        <input value={formTel} onChange={(e) => setFormTel(e.target.value)} className="formInput" placeholder="(xx) xxxxx-xxxx" />
                    </label>

                    <div className="formResumo">
                        <div>
                            <b>Itens:</b> {draftCount}
                        </div>
                        <div>
                            <b>Total:</b> {formatBRL(draftTotal)}
                        </div>
                    </div>
                </div>
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

  .badge{
    position:absolute;
    top: -8px;
    right: -8px;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: #0ea5e9;
    color: #fff;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size: 12px;
    font-weight: 900;
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
    margin-top: 6px;
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

  .pagerRow{ display:flex; justify-content:flex-end; margin-top: 12px; }
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

  .draftMini{
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.16);
    color: rgba(255,255,255,0.92);
    font-weight: 800;
    display:flex;
    gap: 16px;
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
    width: min(680px, 96vw);
    border-radius: 16px;
    background: linear-gradient(180deg, rgba(20,68,120,0.98), rgba(12,46,92,0.98));
    border: 1px solid rgba(255,255,255,0.18);
    box-shadow: 0 30px 70px rgba(0,0,0,0.5);
    overflow:hidden;
  }
  .modalHeader{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding: 14px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.14);
  }
  .modalTitle{ color: rgba(255,255,255,0.95); font-weight: 900; letter-spacing: 0.8px; }
  .modalClose{
    width: 38px;
    height: 38px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.92);
    cursor:pointer;
  }
  .modalBody{ padding: 14px; color: rgba(255,255,255,0.92); }
  .modalFooter{
    padding: 14px;
    border-top: 1px solid rgba(255,255,255,0.14);
    display:flex;
    justify-content:flex-end;
  }

  /* finalize form */
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
  .formResumo{
    margin-top: 8px;
    padding: 12px;
    border-radius: 14px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.14);
    display:flex;
    gap: 18px;
    justify-content: space-between;
    font-weight: 900;
  }

  .draftHint{
    margin-top: 18px;
    display:flex;
    justify-content:center;
  }
  .draftHintBox{
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.18);
    color: rgba(255,255,255,0.92);
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
  .resumoHeader{
    display:grid;
    grid-template-columns: 240px 1fr 220px;
    gap: 10px;
    padding: 14px 14px 10px 14px;
    background: rgba(255,255,255,0.92);
    border-bottom: 1px solid rgba(2, 156, 222, 0.22);
    align-items: start;
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
  .resumoTableHead{
    display:grid;
    grid-template-columns: 1fr 90px 140px;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 2px solid rgba(2,156,222,0.35);
    color: #0b2b4d;
    font-weight: 1000;
  }
  .resumoRow{
    display:grid;
    grid-template-columns: 1fr 90px 140px;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid rgba(15,23,42,0.10);
    color: #0b2b4d;
    font-weight: 800;
  }
  .resumoItemName{ text-transform: uppercase; }

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

  .resumoFooter{
    padding: 14px;
    display:flex;
    align-items:flex-end;
    justify-content: space-between;
    gap: 16px;
    background: rgba(255,255,255,0.92);
  }
  .resumoPay{
    display:grid;
    gap: 6px;
    color: #0b2b4d;
    font-weight: 900;
  }
  .resumoPayTitle{ font-size: 13px; opacity: 0.9; }
  .resumoPayRow{
    display:flex;
    align-items:center;
    justify-content: space-between;
    gap: 14px;
    min-width: 300px;
    font-size: 13px;
  }
  .resumoPayVal{ font-weight: 1000; }
  .resumoLogo{
    width: 180px;
    height: auto;
    object-fit: contain;
  }

  .resumoExportRow{ margin-top: 8px; }
  .smallBtn{
    border: 1px solid rgba(2,156,222,0.35);
    background: rgba(2,156,222,0.10);
    color: #0b2b4d;
    font-weight: 1000;
    border-radius: 12px;
    padding: 10px 12px;
    cursor:pointer;
  }

  @media (max-width: 1100px){
    .gridProdutos{ grid-template-columns: repeat(3, minmax(170px, 1fr)); }
    .detailLayout{ grid-template-columns: 1fr; }
    .detailImgCard{ height: 300px; }
    .budgetGrid{ grid-template-columns: repeat(2, minmax(240px, 1fr)); }
    .resumoHeader{ grid-template-columns: 1fr; }
    .resumoDate{ justify-content:flex-start; }
  }
  @media (max-width: 760px){
    .gridMenu2{ grid-template-columns: 1fr; }
    .gridProdutos{ grid-template-columns: repeat(2, minmax(160px, 1fr)); }
    .budgetGrid{ grid-template-columns: 1fr; }
    .resumoTableHead, .resumoRow{ grid-template-columns: 1fr 70px 120px; }
  }
`;