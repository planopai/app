"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

/**
 * PAGE ÚNICA (page.tsx) — CATÁLOGO (protótipo)
 */

type CatalogGroup = "home" | "elementos" | "urnas_linhas" | "listagem" | "detalhe";

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

const BG_IMAGE = "https://pai.planoassistencialintegrado.com.br/catalogo.png";

// ---------- helpers UI ----------
function cn(...parts: Array<string | false | null | undefined>) {
    return parts.filter(Boolean).join(" ");
}

function formatBRL(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
        inspiracao:
            "O nome Zeus remete a uma presença soberana e única, evocando força e dignidade na despedida.",
        conceito:
            "Pensada para famílias que buscam a máxima homenagem possível, com acabamento premium e estética marcante.",
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
        conceito:
            "Criada para quem deseja uma homenagem com estética clássica e materiais selecionados.",
        especificacoes:
            "Madeira maciça • verniz fosco • cantos arredondados • forração interna • suporte de alças.",
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
        especificacoes:
            "Estrutura resistente • acabamento padrão • forração interna • fecho simples • encaixes firmes.",
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
        especificacoes:
            "Madeira selecionada • detalhes em alto-relevo • forração premium • sistema de fechamento reforçado.",
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

// ---------- small UI blocks ----------
function TopRightNav({
    onBack,
    onHome,
    onList,
    disabledBack,
}: {
    onBack: () => void;
    onHome: () => void;
    onList: () => void;
    disabledBack?: boolean;
}) {
    return (
        <div style={{ position: "absolute", top: 18, right: 18, display: "flex", gap: 10 }}>
            <button type="button" onClick={onBack} disabled={disabledBack} className={cn("iconBtn", disabledBack && "iconBtnDisabled")} aria-label="Voltar" title="Voltar">
                <IconBack />
            </button>
            <button type="button" onClick={onHome} className="iconBtn" aria-label="Home" title="Home">
                <IconHome />
            </button>
            <button type="button" onClick={onList} className="iconBtn" aria-label="Lista" title="Lista">
                <IconList />
            </button>
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
                // clique fora fecha
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

    const list = useCallback(() => {
        // Se tiver contexto (categoria), vai para listagem; senão, para Elementos
        if (categoria) {
            if (categoria === "URNAS") {
                setStack(["home", "elementos", "urnas_linhas", "listagem"]);
            } else {
                setStack(["home", "elementos", "listagem"]);
            }
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

    // sempre manter page dentro do range
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
        if (page < 1) setPage(1);
    }, [totalPages, page]);

    // ao entrar em listagem sem contexto, define defaults de forma controlada
    useEffect(() => {
        if (current !== "listagem") return;

        if (!categoria) setCategoria("URNAS");

        // só define linha default para categorias que exigem linha
        if ((categoria ?? "URNAS") === "URNAS" && !linha) setLinha("SERENIDADE");
    }, [current, categoria, linha]);

    // abrir detalhe “navegando”
    const openProduct = useCallback(
        (p: Produto) => {
            setSelected(p);
            if (current !== "detalhe") go("detalhe");
        },
        [current, go]
    );

    // garante selected coerente com os filtros quando em detalhe
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

    // miniaturas memoizadas (evita regenerar SVGs a cada render)
    const detailThumbs = useMemo(() => {
        return Array.from({ length: 6 }).map((_, i) => ({
            key: `thumb-${i + 1}`,
            src: mockImg(`IMG ${i + 1}`, 26 + i * 12),
            alt: `Miniatura ${i + 1}`,
        }));
    }, []);

    // mock “tabela de valores”
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

    // ---------- screens ----------
    const ScreenHome = (
        <ScreenContainer>
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div className="homeBtns">
                    <button type="button" className="homeBtn" onClick={() => go("elementos")}>
                        ELEMENTOS DE HOMENAGEM
                    </button>

                    <button type="button" className="homeBtn" onClick={() => console.info("Mock: lista de orçamentos")}>
                        LISTA DE ORÇAMENTOS
                    </button>
                </div>
            </div>
        </ScreenContainer>
    );

    const ScreenElementos = (
        <ScreenContainer>
            <TopRightNav onBack={back} onHome={home} onList={list} disabledBack={!canBack} />
            <Title>ELEMENTOS DE HOMENAGEM</Title>

            <div className="gridMenu2">
                {elementosMenu.map((it) => (
                    <BigButton key={it.key} label={it.title} onClick={it.action} />
                ))}
            </div>
        </ScreenContainer>
    );

    const ScreenLinhas = (
        <ScreenContainer>
            <TopRightNav onBack={back} onHome={home} onList={list} disabledBack={!canBack} />
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
            <TopRightNav onBack={back} onHome={home} onList={list} disabledBack={!canBack} />

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
                        <button
                            type="button"
                            className="pagerBtn"
                            onClick={() => setPage((x) => Math.max(1, x - 1))}
                            disabled={page <= 1}
                            aria-label="Página anterior"
                        >
                            <IconChevron dir="left" />
                        </button>
                        <div className="pagerInfo">
                            Página <b>{page}</b> de <b>{totalPages}</b>
                        </div>
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

                                    <div className="detailActions">
                                        <button
                                            type="button"
                                            className="iconActionBtn"
                                            onClick={() => setOpenPrices(true)}
                                            aria-label="Tabela de valores"
                                            title="Tabela de valores"
                                        >
                                            <IconDollar />
                                        </button>
                                        <button
                                            type="button"
                                            className="iconActionBtn"
                                            onClick={() => console.info("Mock: adicionar ao orçamento")}
                                            aria-label="Adicionar a orçamento"
                                            title="Adicionar a orçamento"
                                        >
                                            <IconPlus />
                                        </button>
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

    // ---------- render switch ----------
    let screen: React.ReactNode = null;
    if (current === "home") screen = ScreenHome;
    if (current === "elementos") screen = ScreenElementos;
    if (current === "urnas_linhas") screen = ScreenLinhas;
    if (current === "listagem") screen = ScreenListagem;
    if (current === "detalhe") screen = ScreenDetalhe;

    return (
        <div className="root">
            <style>{css}</style>
            {screen}
        </div>
    );
}

// ---------- CSS (self-contained) ----------
const css = `
  :root{
    --bg1:#2ca3d4;
    --bg2:#0e4c86;
    --pill: rgba(255,255,255,0.78);
    --pillBorder: rgba(255,255,255,0.28);
    --btn: rgba(220,233,246,0.92);
    --btnBorder: rgba(255,255,255,0.55);
    --btnText: #0b2b4d;
    --ink: rgba(255,255,255,0.95);
    --inkSoft: rgba(255,255,255,0.85);
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
  }
  .iconBtn:hover{ transform: translateY(-1px); filter: brightness(1.02); }
  .iconBtn:active{ transform: translateY(0px) scale(0.99); }
  .iconBtnDisabled{ opacity: 0.55; cursor: not-allowed; }

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
  .homeBtn::before{
    content:"";
    position:absolute;
    inset:0;
    border-radius:18px;
    background: linear-gradient(120deg, transparent 20%, rgba(255,255,255,0.25), transparent 80%);
    opacity:0;
    transition:opacity .25s ease;
  }
  .homeBtn:hover::before{ opacity:1; }

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
    width: min(640px, 96vw);
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

  @media (max-width: 1100px){
    .gridProdutos{ grid-template-columns: repeat(3, minmax(170px, 1fr)); }
    .detailLayout{ grid-template-columns: 1fr; }
    .detailImgCard{ height: 300px; }
  }
  @media (max-width: 760px){
    .gridMenu2{ grid-template-columns: 1fr; }
    .gridProdutos{ grid-template-columns: repeat(2, minmax(160px, 1fr)); }
  }
`;