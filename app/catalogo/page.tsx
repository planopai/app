"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* =======================
   Types
======================= */

type CatalogGroup = "home" | "menus" | "listagem" | "detalhe" | "orcamentos" | "resumo";

type CatalogoNo = {
    id: number;
    parent_id: number | null;
    nome: string;
    ordem: number;
    ativo: number;
};

type CatalogoInit = {
    ok: boolean;
    nos: CatalogoNo[];
};

type CatalogoNoProdutoRow = {
    id: number;
    nome: string;
    codigo_barras?: string | null;
    valor?: number | string | null;
    foto_url?: string | null;
    descricao?: string | null;
    categoria_nome?: string | null;
    classificacao_nome?: string | null;
    ordem?: number | null;
};

type Produto = {
    id: number;
    noId: number;
    nome: string;
    preco: number;
    saldo: number;
    thumb: string;
    descricaoCurta: string;
};

type OrcamentoItem = {
    produtoId: number;
    nome: string;
    noId: number;
    noPath: string;
    valorUnit: number;
    qtd: number;
};

type Orcamento = {
    id: string;
    codigo: string;
    criadoEmISO: string;

    operadorId: number;
    operadorNome: string;
    operadorUsuario: string;

    responsavel: string;
    falecido: string;
    telefone: string;

    status?: string;
    valorTotal?: number;
    observacoes?: string;

    itens: OrcamentoItem[];
};

type Usuario = { id: number; nome: string; usuario: string };

type FluxoStep = {
    id: number;
    fluxo_nome: string;
    ordem: number;
    no_id: number | null;
    titulo: string | null;
    required: number;
    max_select: number;
    ativo: number;
};

/* =======================
   Consts
======================= */

const API_URL = "https://api.planoassistencialintegrado.com.br/pai_api.php";
const CATALOGO_API_URL = "https://api.planoassistencialintegrado.com.br/catalogo_api.php";

const BG_IMAGE = "https://pai.planoassistencialintegrado.com.br/catalogo.png";
const LOGO_URL_UI = "https://pai.planoassistencialintegrado.com.br/logo.png";
const LOGO_URL_PDF = "https://pai.planoassistencialintegrado.com.br/logo.png";

/* =======================
   Helpers
======================= */

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

function normalizeKey(s: string) {
    return (s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

function onlyDateISO(input: string) {
    if (!input) return "";
    const s = String(input).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatDateBR(input: string) {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d);
}

async function safeJsonFetch(input: RequestInfo, init?: RequestInit & { timeoutMs?: number }) {
    const timeoutMs = init?.timeoutMs ?? 15000;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
        const { timeoutMs: _omit, ...rest } = init || {};
        const r = await fetch(input, {
            cache: "no-store",
            credentials: "include",
            signal: ctrl.signal,
            ...rest,
        });

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

        if (json == null) {
            throw new Error(
                `Resposta não-JSON do backend:\n${cleaned.slice(0, 300)}${cleaned.length > 300 ? "…" : ""}`
            );
        }

        if (!r.ok || json?.erro || json?.ok === false) {
            throw new Error(json?.erro || json?.msg || `HTTP ${r.status}`);
        }

        return json;
    } catch (e: any) {
        if (e?.name === "AbortError") throw new Error("Tempo esgotado ao conectar com o servidor. Tente novamente.");
        throw e;
    } finally {
        clearTimeout(t);
    }
}

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

function buildNoPath(path: CatalogoNo[]) {
    return path.map((n) => n.nome).join(" > ");
}

function mapOrcamentoRowToState(r: any): Orcamento {
    return {
        id: String(r?.id ?? ""),
        codigo: String(r?.codigo ?? r?.id ?? ""),
        criadoEmISO: String(r?.criado_em ?? r?.criadoEmISO ?? ""),
        operadorId: Number(r?.operador_id ?? r?.operadorId) || 0,
        operadorNome: String(r?.operador_nome ?? r?.operadorNome ?? ""),
        operadorUsuario: String(r?.operador_usuario ?? r?.operadorUsuario ?? ""),
        responsavel: String(r?.responsavel ?? ""),
        falecido: String(r?.falecido ?? ""),
        telefone: String(r?.telefone ?? ""),
        status: r?.status ? String(r.status) : undefined,
        valorTotal: Number(r?.valor_total ?? r?.valorTotal) || 0,
        observacoes: r?.observacoes ? String(r.observacoes) : undefined,
        itens: [],
    };
}

function mapOrcamentoItemRowToState(r: any): OrcamentoItem {
    return {
        produtoId: Number(r?.produto_id ?? r?.produtoId) || 0,
        nome: String(r?.produto_nome ?? r?.nome ?? ""),
        noId: r?.no_id == null && r?.noId == null ? 0 : Number(r?.no_id ?? r?.noId) || 0,
        noPath: String(r?.no_path ?? r?.noPath ?? ""),
        valorUnit: Number(r?.valor_unit ?? r?.valorUnit) || 0,
        qtd: clampInt(r?.qtd ?? 1) || 1,
    };
}

/* =======================
   Icons
======================= */

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
            <path
                d="M10.5 18.5C14.6421 18.5 18 15.1421 18 11C18 6.85786 14.6421 3.5 10.5 3.5C6.35786 3.5 3 6.85786 3 11C3 15.1421 6.35786 18.5 10.5 18.5Z"
                stroke="currentColor"
                strokeWidth="2.2"
            />
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

/* =======================
   UI Blocks
======================= */

function TopRightNav({
    onBack,
    onHome,
    onList,
    onCheck,
    disabledBack,
    showCheck = true,
    checkCount = 0,
    checkDisabled = false,
}: {
    onBack: () => void;
    onHome: () => void;
    onList: () => void;
    onCheck?: () => void;
    disabledBack?: boolean;
    showCheck?: boolean;
    checkCount?: number;
    checkDisabled?: boolean;
}) {
    const n = Math.max(0, Math.floor(checkCount || 0));
    const checkIsDisabled = checkDisabled || !onCheck;

    return (
        <div style={{ position: "absolute", top: 6, right: 18, display: "flex", gap: 10, zIndex: 5 }}>
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
                    onClick={checkIsDisabled ? undefined : onCheck}
                    disabled={checkIsDisabled}
                    className={cn("iconBtn", "iconBtnCheck", checkIsDisabled && "iconBtnDisabled")}
                    aria-label="Concluir"
                    title={checkIsDisabled ? "Concluir (bloqueado)" : "Concluir"}
                >
                    <IconCheck />
                    {n > 0 ? (
                        <span className="badgeCount" aria-label={`${n} itens selecionados`}>
                            {n}
                        </span>
                    ) : null}
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
        <div className="pageTitleWrap">
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
                    <button type="button" className="modalClose" onClick={onClose} aria-label="Fechar modal" title="Fechar">
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

/* =======================
   Page
======================= */

export default function Page() {
    useEffect(() => {
        const prevHtml = document.documentElement.style.overflow;
        const prevBody = document.body.style.overflow;
        document.documentElement.style.overflow = "hidden";
        document.body.style.overflow = "hidden";
        return () => {
            document.documentElement.style.overflow = prevHtml;
            document.body.style.overflow = prevBody;
        };
    }, []);

    const [stack, setStack] = useState<CatalogGroup[]>(["home"]);
    const current = stack[stack.length - 1];
    const canBack = stack.length > 1;

    const go = useCallback((to: CatalogGroup) => setStack((s) => [...s, to]), []);
    const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

    // Catálogo
    const [catalogoNos, setCatalogoNos] = useState<CatalogoNo[]>([]);
    const [loadingCatalogo, setLoadingCatalogo] = useState(false);
    const [catalogoError, setCatalogoError] = useState<string | null>(null);

    // Caminho atual
    const [noPath, setNoPath] = useState<CatalogoNo[]>([]);
    const currentParentId = noPath.length ? noPath[noPath.length - 1].id : null;

    // Produtos
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const pageSize = 8;

    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [loadingProdutos, setLoadingProdutos] = useState(false);
    const [produtosError, setProdutosError] = useState<string | null>(null);

    const [selected, setSelected] = useState<Produto | null>(null);
    const [openPrices, setOpenPrices] = useState(false);
    const [openZoom, setOpenZoom] = useState(false);

    const [produtoIndex, setProdutoIndex] = useState<Record<number, Produto>>({});

    // Draft
    const [draftItens, setDraftItens] = useState<OrcamentoItem[]>([]);

    // Orçamentos
    const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
    const [orcamentoSelecionadoId, setOrcamentoSelecionadoId] = useState<string | null>(null);
    const [loadingOrcamentos, setLoadingOrcamentos] = useState(false);
    const [orcamentosError, setOrcamentosError] = useState<string | null>(null);
    const [loadingResumo, setLoadingResumo] = useState(false);

    // Filtros/paginação dos orçamentos
    const [orcamentoBuscaNome, setOrcamentoBuscaNome] = useState("");
    const [orcamentoBuscaData, setOrcamentoBuscaData] = useState("");
    const [orcamentoPage, setOrcamentoPage] = useState(1);
    const orcamentoPageSize = 5;

    // Fluxo homenagem
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [usersError, setUsersError] = useState<string | null>(null);

    const [openUserPick, setOpenUserPick] = useState(false);
    const [operadorSel, setOperadorSel] = useState<Usuario | null>(null);

    const [userQuery, setUserQuery] = useState("");
    const [userHighlight, setUserHighlight] = useState(0);
    const [operadorTemp, setOperadorTemp] = useState<Usuario | null>(null);

    const [openInicio, setOpenInicio] = useState(false);
    const [formResp, setFormResp] = useState("");
    const [formFalecido, setFormFalecido] = useState("");
    const [formTel, setFormTel] = useState("");

    const [openConcluir, setOpenConcluir] = useState(false);
    const [savingOrcamento, setSavingOrcamento] = useState(false);

    const FIXED_FLUXO_NOME = "Próximo Passo";

    const [fluxoSteps, setFluxoSteps] = useState<FluxoStep[]>([]);
    const [stepIndex, setStepIndex] = useState(0);
    const [visitedSteps, setVisitedSteps] = useState<Record<number, 1>>({});
    const [loadingSteps, setLoadingSteps] = useState(false);
    const [stepsError, setStepsError] = useState<string | null>(null);

    const currentStep = fluxoSteps[stepIndex] ?? null;
    const isLastStep = fluxoSteps.length > 0 && stepIndex >= fluxoSteps.length - 1;
    const canConcluir = fluxoSteps.length > 0 && isLastStep && currentStep && visitedSteps[currentStep.ordem] === 1;
    const hasFlow = fluxoSteps.length > 0;

    const restoredRef = useRef(false);
    const pendingGoToSavedRef = useRef(false);
    const userNavRef = useRef(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem("pai_fluxo_state");
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const si = Number(parsed?.stepIndex);
            const vs = parsed?.visitedSteps;
            if (Number.isFinite(si) && si >= 0) {
                setStepIndex(Math.floor(si));
                pendingGoToSavedRef.current = true;
            }
            if (vs && typeof vs === "object") {
                setVisitedSteps(vs);
            }
            restoredRef.current = true;
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem("pai_fluxo_state", JSON.stringify({ stepIndex, visitedSteps }));
        } catch {
            // ignore
        }
    }, [stepIndex, visitedSteps]);

    const resetFluxoState = useCallback(() => {
        setFluxoSteps([]);
        setStepIndex(0);
        setVisitedSteps({});
        setLoadingSteps(false);
        setStepsError(null);
        try {
            localStorage.removeItem("pai_fluxo_state");
        } catch {
            // ignore
        }
        restoredRef.current = false;
        pendingGoToSavedRef.current = false;
        userNavRef.current = false;
    }, []);

    const home = useCallback(() => {
        setStack(["home"]);
        setNoPath([]);
        setQ("");
        setPage(1);
        setSelected(null);
        setOpenPrices(false);
        setOpenZoom(false);

        setDraftItens([]);
        setOperadorSel(null);
        setFormResp("");
        setFormFalecido("");
        setFormTel("");
        setOpenUserPick(false);
        setOpenInicio(false);
        setOpenConcluir(false);

        setProdutos([]);
        setProdutosError(null);
        setProdutoIndex({});
        setCatalogoNos([]);
        setCatalogoError(null);

        setOrcamentoSelecionadoId(null);
        setOrcamentosError(null);

        setOrcamentoBuscaNome("");
        setOrcamentoBuscaData("");
        setOrcamentoPage(1);

        resetFluxoState();
    }, [resetFluxoState]);

    const fetchOrcamentos = useCallback(async () => {
        setLoadingOrcamentos(true);
        setOrcamentosError(null);
        try {
            const j = await safeJsonFetch(`${CATALOGO_API_URL}?orcamentos_list=1&limit=200&_=${Date.now()}`, {
                timeoutMs: 20000,
            });

            const rows = Array.isArray(j?.rows) ? j.rows : [];
            const mapped: Orcamento[] = rows.map((r: any) => ({
                ...mapOrcamentoRowToState(r),
                itens: [],
            }));

            setOrcamentos(mapped);
        } catch (e: any) {
            setOrcamentos([]);
            setOrcamentosError(e?.message || "Erro ao carregar orçamentos.");
        } finally {
            setLoadingOrcamentos(false);
        }
    }, []);

    const fetchOrcamentoById = useCallback(async (id: string): Promise<Orcamento> => {
        const j = await safeJsonFetch(`${CATALOGO_API_URL}?orcamento_get=1&id=${encodeURIComponent(id)}&_=${Date.now()}`, {
            timeoutMs: 20000,
        });

        const orc = mapOrcamentoRowToState(j?.orcamento ?? {});
        const itensRows = Array.isArray(j?.itens) ? j.itens : [];
        const itens = itensRows.map(mapOrcamentoItemRowToState);

        return {
            ...orc,
            itens,
            valorTotal:
                Number(orc.valorTotal) ||
                itens.reduce((acc: number, it: OrcamentoItem) => acc + clampInt(it.qtd) * (Number(it.valorUnit) || 0), 0)
        };
    }, []);

    const goBudgets = useCallback(async () => {
        setOrcamentoBuscaNome("");
        setOrcamentoBuscaData("");
        setOrcamentoPage(1);
        setStack(["home", "orcamentos"]);
        await fetchOrcamentos();
    }, [fetchOrcamentos]);

    const list = useCallback(() => {
        if (operadorSel && formResp.trim() && formFalecido.trim() && formTel.trim()) {
            setNoPath([]);
            setStack(["home", "menus"]);
            return;
        }
        setStack(["home"]);
    }, [operadorSel, formResp, formFalecido, formTel]);

    const fetchCatalogoInit = useCallback(async () => {
        if (loadingCatalogo) return;
        setLoadingCatalogo(true);
        setCatalogoError(null);
        try {
            const j = (await safeJsonFetch(`${CATALOGO_API_URL}?init=1&_=${Date.now()}`, { timeoutMs: 20000 })) as CatalogoInit;
            setCatalogoNos(Array.isArray(j?.nos) ? j.nos : []);
        } catch (e: any) {
            setCatalogoNos([]);
            setCatalogoError(e?.message || "Erro ao carregar catálogo.");
        } finally {
            setLoadingCatalogo(false);
        }
    }, [loadingCatalogo]);

    const fetchProdutosNo = useCallback(async (noId: number) => {
        if (!noId) {
            setProdutos([]);
            return;
        }

        setLoadingProdutos(true);
        setProdutosError(null);

        try {
            const j = await safeJsonFetch(`${CATALOGO_API_URL}?no_produtos=1&no_id=${noId}&_=${Date.now()}`, { timeoutMs: 20000 });
            const rows: CatalogoNoProdutoRow[] = Array.isArray(j?.rows) ? j.rows : [];

            const mapped: Produto[] = rows
                .map((r) => {
                    const id = Number(r.id) || 0;
                    const preco = Number(r.valor) || 0;
                    const thumb = r.foto_url && String(r.foto_url).trim() ? String(r.foto_url) : LOGO_URL_UI;

                    return {
                        id,
                        noId,
                        nome: String(r.nome || ""),
                        preco,
                        saldo: 0,
                        thumb,
                        descricaoCurta: String(r.descricao || ""),
                    } as Produto;
                })
                .filter((p) => p.id > 0 && p.nome.trim() !== "");

            setProdutos(mapped);
            setProdutoIndex((prev) => {
                const next = { ...prev };
                for (const p of mapped) next[p.id] = p;
                return next;
            });
        } catch (e: any) {
            setProdutos([]);
            setProdutosError(e?.message || "Erro ao carregar produtos.");
        } finally {
            setLoadingProdutos(false);
        }
    }, []);

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
        setUserQuery("");
        setUserHighlight(0);
        setOperadorTemp(null);
        if (!usuarios.length) await fetchUsuarios();
    }, [fetchUsuarios, usuarios.length]);

    const confirmarOperador = useCallback(() => {
        if (!operadorTemp) return;

        setOperadorSel(operadorTemp);
        setOpenUserPick(false);

        setUserQuery("");
        setUserHighlight(0);

        setFormResp("");
        setFormFalecido("");
        setFormTel("");
        setOpenInicio(true);
    }, [operadorTemp]);

    const filteredUsuarios = useMemo(() => {
        const qq = userQuery.trim().toLowerCase();
        if (!qq) return [];
        return usuarios
            .filter((u) => `${u.nome} ${u.usuario}`.toLowerCase().includes(qq))
            .slice(0, 12);
    }, [usuarios, userQuery]);

    const fetchFluxoSteps = useCallback(async () => {
        if (loadingSteps) return;
        setLoadingSteps(true);
        setStepsError(null);
        try {
            const url = `${CATALOGO_API_URL}?fluxo_steps=1&fluxo_nome=${encodeURIComponent(FIXED_FLUXO_NOME)}&_=${Date.now()}`;
            const j = await safeJsonFetch(url, { timeoutMs: 20000 });
            const rows = Array.isArray(j?.rows) ? (j.rows as any[]) : [];

            const steps: FluxoStep[] = rows
                .map((x) => ({
                    id: Number(x?.id) || 0,
                    fluxo_nome: String(x?.fluxo_nome ?? FIXED_FLUXO_NOME),
                    ordem: Number(x?.ordem) || 0,
                    no_id: x?.no_id == null || x?.no_id === "" ? null : Number(x.no_id) || null,
                    titulo: x?.titulo == null ? null : String(x.titulo),
                    required: Number(x?.required) === 1 ? 1 : 0,
                    max_select: Math.max(1, Number(x?.max_select) || 1),
                    ativo: Number(x?.ativo) === 1 ? 1 : 0,
                }))
                .filter((s) => s.id > 0 && s.ordem > 0)
                .filter((s) => s.ativo === 1)
                .sort((a, b) => a.ordem - b.ordem || a.id - b.id);

            setFluxoSteps(steps);
        } catch (e: any) {
            setFluxoSteps([]);
            setStepsError(e?.message || "Erro ao carregar steps do fluxo.");
        } finally {
            setLoadingSteps(false);
        }
    }, [FIXED_FLUXO_NOME, loadingSteps]);

    const iniciarHomenagem = useCallback(() => {
        const responsavel = formResp.trim();
        const falecido = formFalecido.trim();
        const telefone = formTel.trim();

        if (!operadorSel) return alert("Selecione o Operador.");
        if (!responsavel || !falecido || !telefone) return alert("Preencha Responsável, Falecido(a) e Telefone.");

        setOpenInicio(false);
        setDraftItens([]);
        setNoPath([]);
        setQ("");
        setPage(1);
        setSelected(null);
        setOpenPrices(false);
        setOpenZoom(false);

        setStack(["home", "menus"]);
        fetchFluxoSteps();
    }, [formResp, formFalecido, formTel, operadorSel, fetchFluxoSteps]);

    useEffect(() => {
        if (!operadorSel || !formResp.trim() || !formFalecido.trim() || !formTel.trim()) return;
        if (!catalogoNos.length && !loadingCatalogo && !catalogoError) fetchCatalogoInit();
    }, [operadorSel, formResp, formFalecido, formTel, catalogoNos.length, loadingCatalogo, catalogoError, fetchCatalogoInit]);

    useEffect(() => {
        if (!operadorSel || !formResp.trim() || !formFalecido.trim() || !formTel.trim()) return;
        if (!catalogoNos.length) return;
        if (fluxoSteps.length > 0) return;
        if (loadingSteps) return;
        fetchFluxoSteps();
    }, [operadorSel, formResp, formFalecido, formTel, catalogoNos.length, fluxoSteps.length, loadingSteps, fetchFluxoSteps]);

    useEffect(() => {
        if (current === "orcamentos") {
            void fetchOrcamentos();
        }
    }, [current, fetchOrcamentos]);

    const childrenNodes = useMemo(() => {
        const arr = catalogoNos
            .filter((n) => (currentParentId == null ? n.parent_id == null : n.parent_id === currentParentId))
            .filter((n) => Number(n.ativo) === 1)
            .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"));
        return arr;
    }, [catalogoNos, currentParentId]);

    const childrenByParent = useMemo(() => {
        const map = new Map<number, number>();
        for (const n of catalogoNos) {
            if (Number(n.ativo) !== 1) continue;
            if (n.parent_id != null) map.set(n.parent_id, (map.get(n.parent_id) || 0) + 1);
        }
        return map;
    }, [catalogoNos]);

    const nodeHasChildren = useCallback((id: number) => (childrenByParent.get(id) || 0) > 0, [childrenByParent]);

    const breadcrumb = useMemo(() => {
        if (!noPath.length) return "RAIZ";
        return buildNoPath(noPath);
    }, [noPath]);

    useEffect(() => {
        if (current !== "listagem") return;
        const node = noPath[noPath.length - 1];
        if (!node) return;
        fetchProdutosNo(node.id);
    }, [current, noPath, fetchProdutosNo]);

    const produtosFiltrados = useMemo(() => {
        let arr = produtos.slice();
        const qq = q.trim().toLowerCase();
        if (qq) arr = arr.filter((p) => `${p.nome} ${p.descricaoCurta}`.toLowerCase().includes(qq));
        return arr;
    }, [produtos, q]);

    const totalPages = Math.max(1, Math.ceil(produtosFiltrados.length / pageSize));
    const paged = useMemo(() => {
        const start = (page - 1) * pageSize;
        return produtosFiltrados.slice(start, start + pageSize);
    }, [produtosFiltrados, page, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
        if (page < 1) setPage(1);
    }, [totalPages, page]);

    const orcamentosFiltrados = useMemo(() => {
        let arr = orcamentos.slice();

        const nomeBusca = normalizeKey(orcamentoBuscaNome);
        const dataBusca = onlyDateISO(orcamentoBuscaData);

        if (nomeBusca) {
            arr = arr.filter((o) => {
                const nomeComposto = normalizeKey(`${o.falecido} ${o.responsavel} ${o.codigo}`);
                return nomeComposto.includes(nomeBusca);
            });
        }

        if (dataBusca) {
            arr = arr.filter((o) => onlyDateISO(o.criadoEmISO) === dataBusca);
        }

        return arr.sort((a, b) => {
            const ta = new Date(a.criadoEmISO).getTime() || 0;
            const tb = new Date(b.criadoEmISO).getTime() || 0;
            return tb - ta;
        });
    }, [orcamentos, orcamentoBuscaNome, orcamentoBuscaData]);

    const totalOrcamentoPages = Math.max(1, Math.ceil(orcamentosFiltrados.length / orcamentoPageSize));

    const orcamentosPaginados = useMemo(() => {
        const start = (orcamentoPage - 1) * orcamentoPageSize;
        return orcamentosFiltrados.slice(start, start + orcamentoPageSize);
    }, [orcamentosFiltrados, orcamentoPage, orcamentoPageSize]);

    useEffect(() => {
        setOrcamentoPage(1);
    }, [orcamentoBuscaNome, orcamentoBuscaData]);

    useEffect(() => {
        if (orcamentoPage > totalOrcamentoPages) setOrcamentoPage(totalOrcamentoPages);
        if (orcamentoPage < 1) setOrcamentoPage(1);
    }, [orcamentoPage, totalOrcamentoPages]);

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
        if (!selected || !produtosFiltrados.some((p) => p.id === selected.id)) setSelected(produtosFiltrados[0]);
    }, [current, selected, produtosFiltrados]);

    const isSelectedInDraft = useCallback((produtoId: number) => draftItens.some((x) => x.produtoId === produtoId), [draftItens]);

    const toggleDraftItem = useCallback(() => {
        if (!selected) return;

        const nodePathText = breadcrumb;

        setDraftItens((prev) => {
            const exists = prev.some((x) => x.produtoId === selected.id);
            if (exists) return prev.filter((x) => x.produtoId !== selected.id);

            return [
                ...prev,
                {
                    produtoId: selected.id,
                    nome: selected.nome,
                    noId: selected.noId,
                    noPath: nodePathText,
                    valorUnit: Number(selected.preco) || 0,
                    qtd: 1,
                },
            ];
        });
    }, [selected, breadcrumb]);

    const removeFromDraft = useCallback((produtoId: number) => setDraftItens((prev) => prev.filter((x) => x.produtoId !== produtoId)), []);

    const openConcluirModal = useCallback(() => {
        if (!operadorSel || !formResp.trim() || !formFalecido.trim() || !formTel.trim()) {
            alert("Para concluir, inicie a homenagem (Operador + dados).");
            return;
        }
        setOpenConcluir(true);
    }, [operadorSel, formResp, formFalecido, formTel]);

    const goToStep = useCallback(
        async (i: number) => {
            if (!fluxoSteps.length) return;

            const clamped = Math.max(0, Math.min(fluxoSteps.length - 1, Math.floor(i)));
            const step = fluxoSteps[clamped];
            if (!step) return;

            setQ("");
            setPage(1);
            setSelected(null);
            setOpenPrices(false);

            if (step.no_id == null) {
                setNoPath([]);
                setStack(["home", "menus"]);
                return;
            }

            const noId = Number(step.no_id) || 0;
            const node = catalogoNos.find((n) => n.id === noId) || null;

            if (!node) {
                setNoPath([]);
                setStack(["home", "menus"]);
                return;
            }

            const byId = new Map<number, CatalogoNo>();
            for (const n of catalogoNos) byId.set(n.id, n);

            const pathRev: CatalogoNo[] = [];
            const seen = new Set<number>();
            let cur: CatalogoNo | null = node;

            while (cur && !seen.has(cur.id)) {
                seen.add(cur.id);
                pathRev.push(cur);
                if (cur.parent_id == null) break;
                cur = byId.get(cur.parent_id) || null;
            }

            const path = pathRev.reverse();
            setNoPath(path);

            const hasChildren = nodeHasChildren(node.id);

            if (hasChildren) {
                setStack(["home", "menus"]);
            } else {
                setStack(["home", "menus", "listagem"]);
                await fetchProdutosNo(node.id);
            }
        },
        [fluxoSteps, catalogoNos, nodeHasChildren, fetchProdutosNo]
    );

    useEffect(() => {
        if (!pendingGoToSavedRef.current) return;
        if (!catalogoNos.length) return;
        if (!fluxoSteps.length) return;

        if (userNavRef.current) {
            pendingGoToSavedRef.current = false;
            return;
        }

        pendingGoToSavedRef.current = false;
        void goToStep(stepIndex);
    }, [catalogoNos.length, fluxoSteps.length, goToStep, stepIndex]);

    const nextStep = useCallback(() => {
        userNavRef.current = false;

        if (!currentStep) return;

        if (currentStep.required === 1 && currentStep.no_id != null) {
            const ok = draftItens.some((it) => it.noId === currentStep.no_id);
            if (!ok) {
                alert("Selecione ao menos 1 item desta etapa para avançar.");
                return;
            }
        }

        setVisitedSteps((prev) => {
            const next = { ...prev };
            next[currentStep.ordem] = 1;
            return next;
        });

        if (isLastStep) {
            openConcluirModal();
            return;
        }

        setStepIndex((prev) => {
            const nextIdx = Math.min((fluxoSteps.length || 1) - 1, prev + 1);
            void goToStep(nextIdx);
            return nextIdx;
        });
    }, [currentStep, draftItens, isLastStep, openConcluirModal, fluxoSteps.length, goToStep]);

    const finalizarOrcamento = useCallback(async () => {
        if (!operadorSel) return alert("Operador não selecionado.");

        const responsavel = formResp.trim();
        const falecido = formFalecido.trim();
        const telefone = formTel.trim();

        if (!responsavel || !falecido || !telefone) {
            return alert("Dados da homenagem incompletos.");
        }

        try {
            setSavingOrcamento(true);

            const payload = {
                action: "orcamento_criar",
                operador_id: operadorSel.id,
                responsavel,
                falecido,
                telefone,
                itens: draftItens.map((x) => ({
                    produto_id: x.produtoId,
                    nome: x.nome,
                    no_id: x.noId,
                    no_path: x.noPath,
                    valor_unit: Number(x.valorUnit) || 0,
                    qtd: clampInt(x.qtd) || 1,
                })),
            };

            const j = await safeJsonFetch(CATALOGO_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                timeoutMs: 20000,
            });

            setDraftItens([]);
            setNoPath([]);
            setQ("");
            setPage(1);
            setSelected(null);
            setOpenPrices(false);
            setOpenZoom(false);
            setOpenConcluir(false);

            resetFluxoState();

            setOrcamentoSelecionadoId(null);
            setStack(["home", "orcamentos"]);

            setOrcamentoBuscaNome("");
            setOrcamentoBuscaData("");
            setOrcamentoPage(1);

            await fetchOrcamentos();

            if (j?.id != null) {
                setOrcamentoSelecionadoId(String(j.id));
            }
        } catch (e: any) {
            alert(e?.message || "Erro ao finalizar orçamento.");
        } finally {
            setSavingOrcamento(false);
        }
    }, [operadorSel, formResp, formFalecido, formTel, draftItens, fetchOrcamentos, resetFluxoState]);

    const openOrcamentoResumo = useCallback(
        async (id: string) => {
            try {
                setLoadingResumo(true);
                const loaded = await fetchOrcamentoById(id);

                setOrcamentos((prev) => {
                    const others = prev.filter((x) => x.id !== loaded.id);
                    return [loaded, ...others];
                });

                setOrcamentoSelecionadoId(loaded.id);
                setStack(["home", "orcamentos", "resumo"]);
            } catch (e: any) {
                alert(e?.message || "Erro ao abrir resumo.");
            } finally {
                setLoadingResumo(false);
            }
        },
        [fetchOrcamentoById]
    );

    const orcamentoSelecionado = useMemo(() => {
        if (!orcamentoSelecionadoId) return null;
        return orcamentos.find((o) => o.id === orcamentoSelecionadoId) ?? null;
    }, [orcamentos, orcamentoSelecionadoId]);

    const totalOrcamentoSelecionado = useMemo(() => {
        if (!orcamentoSelecionado) return 0;
        if (Number(orcamentoSelecionado.valorTotal) > 0) return Number(orcamentoSelecionado.valorTotal) || 0;
        let t = 0;
        for (const it of orcamentoSelecionado.itens) t += clampInt(it.qtd) * (Number(it.valorUnit) || 0);
        return t;
    }, [orcamentoSelecionado]);

    const exportarResumoPDF = useCallback(async (o: Orcamento) => {
        const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

        const logoDataUrl = await toDataUrl(LOGO_URL_PDF);
        const logoFormat = logoDataUrl?.startsWith("data:image/jpeg") ? "JPEG" : "PNG";

        const dt = new Date(o.criadoEmISO);
        const dataBR = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(dt);
        const geradoEm = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());

        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const pageW = doc.internal.pageSize.getWidth();
        const marginX = 12;

        let y = 12;

        if (logoDataUrl) {
            doc.addImage(logoDataUrl, logoFormat as any, marginX, y, 40, 12);
        }

        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("Resumo da Homenagem", marginX + 45, y + 8);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        doc.text(`Gerado em: ${geradoEm}`, pageW - marginX, y + 8, { align: "right" });

        y += 18;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(`Nº ${o.codigo || o.id}`, marginX + 45, y);

        y += 8;

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

        const head = ["Item", "Valor"];
        const body = o.itens.map((it) => {
            const qtd = clampInt(it.qtd);
            const v = Number(it.valorUnit) || 0;
            const totalLinha = qtd * v;
            return [it.nome, formatBRL(totalLinha)];
        });

        const total = Number(o.valorTotal) || o.itens.reduce((acc, it) => acc + clampInt(it.qtd) * (Number(it.valorUnit) || 0), 0);

        autoTable(doc, {
            startY: y,
            head: [head],
            body,
            margin: { left: marginX, right: marginX },
            styles: {
                font: "helvetica",
                fontSize: 10,
                cellPadding: 3,
                valign: "middle",
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
                0: { cellWidth: pageW - marginX * 2 - 50, overflow: "linebreak" },
                1: { cellWidth: 50, halign: "right" },
            },
            didParseCell: (data: any) => {
                if (data.section === "body" && data.column.index === 1) data.cell.styles.halign = "right";
            },
        });

        const afterY = (doc as any).lastAutoTable?.finalY ?? y;

        const boxW = 54;
        const boxH = 12;
        const boxX = pageW - marginX - boxW;
        const boxY = afterY + 8;

        doc.setFillColor(2, 156, 222);
        doc.setDrawColor(2, 156, 222);
        doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, "F");

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(formatBRL(total), boxX + boxW - 3, boxY + 8, { align: "right" });

        const safeName = `orcamento_${o.codigo || o.id}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`.replace(/\s+/g, "_");
        doc.save(`${safeName}.pdf`);
    }, []);

    const openItemFromReview = useCallback(
        (produtoId: number) => {
            const p = produtoIndex[produtoId];
            if (!p) {
                alert("Não foi possível localizar os dados do item. Abra o menu novamente para carregar.");
                return;
            }
            setSelected(p);
            setOpenConcluir(false);
            setStack(["home", "menus", "listagem", "detalhe"]);
        },
        [produtoIndex]
    );

    const enterNode = useCallback(
        (node: CatalogoNo) => {
            const hasChildren = nodeHasChildren(node.id);

            setNoPath((prev) => [...prev, node]);
            setQ("");
            setPage(1);
            setSelected(null);
            setOpenPrices(false);

            if (hasChildren) {
                if (current !== "menus") setStack(["home", "menus"]);
            } else {
                setStack(["home", "menus", "listagem"]);
            }
        },
        [current, nodeHasChildren]
    );

    const menusBack = useCallback(() => {
        userNavRef.current = true;

        setQ("");
        setPage(1);
        setSelected(null);
        setOpenPrices(false);

        setNoPath((prev) => {
            if (!prev.length) {
                setStack(["home"]);
                return prev;
            }
            const next = prev.slice(0, -1);
            setStack(["home", "menus"]);
            return next;
        });
    }, []);

    const ScreenHome = (
        <ScreenContainer>
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div className="homeBtns">
                    <button type="button" className="homeBtn" onClick={openFluxoHomenagem}>
                        ELEMENTOS DE HOMENAGEM
                    </button>

                    <button type="button" className="homeBtn" onClick={() => void goBudgets()}>
                        LISTA DE ORÇAMENTOS
                    </button>
                </div>
            </div>
        </ScreenContainer>
    );

    const ScreenMenus = (
        <ScreenContainer>
            <TopRightNav
                onBack={menusBack}
                onHome={home}
                onList={list}
                onCheck={openConcluirModal}
                disabledBack={!canBack && noPath.length === 0}
                showCheck={true}
                checkCount={draftItens.length}
                checkDisabled={hasFlow ? !canConcluir : false}
            />

            <div className="menusWrap">
                <Title>ELEMENTOS DE HOMENAGEM</Title>

                {catalogoError ? (
                    <div className="emptyState" style={{ margin: "0 26px" }}>
                        {catalogoError}
                    </div>
                ) : null}

                <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                    <SectionPill>{noPath.length ? noPath[noPath.length - 1].nome : "RAIZ"}</SectionPill>
                </div>

                <div className="gridMenu2">
                    {loadingCatalogo ? (
                        <div className="emptyState" style={{ gridColumn: "1 / -1" }}>
                            Carregando menus...
                        </div>
                    ) : childrenNodes.length ? (
                        childrenNodes.map((n) => (
                            <BigButton
                                key={n.id}
                                label={n.nome}
                                onClick={() => {
                                    enterNode(n);
                                }}
                            />
                        ))
                    ) : (
                        <div className="emptyState" style={{ gridColumn: "1 / -1" }}>
                            Nenhum submenu encontrado.
                        </div>
                    )}
                </div>

                {stepsError ? (
                    <div style={{ position: "absolute", left: 18, bottom: 14, opacity: 0, pointerEvents: "none" }}>{stepsError}</div>
                ) : null}
            </div>
        </ScreenContainer>
    );

    const ScreenListagem = (
        <ScreenContainer>
            <TopRightNav
                onBack={() => {
                    setOpenPrices(false);
                    setNoPath((prev) => (prev.length ? prev.slice(0, -1) : prev));
                    setStack(["home", "menus"]);
                }}
                onHome={home}
                onList={list}
                onCheck={openConcluirModal}
                disabledBack={!canBack}
                showCheck={true}
                checkCount={draftItens.length}
                checkDisabled={hasFlow ? !canConcluir : false}
            />

            <div className="listagemWrap">
                <div className="listHeader">
                    <div className="listSubTitle">{noPath.length ? noPath[noPath.length - 1].nome : "RAIZ"}</div>

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

                    {produtosError ? (
                        <div className="errorBox" style={{ marginTop: 12 }}>
                            {produtosError}
                        </div>
                    ) : null}
                </div>

                <div className="gridProdutosWrap">
                    <div className="gridProdutos">
                        {loadingProdutos ? (
                            <div className="emptyState">Carregando produtos...</div>
                        ) : (
                            <>
                                {paged.map((p) => (
                                    <ProductCard key={p.id} p={p} onOpen={() => openProduct(p)} />
                                ))}
                                {paged.length === 0 ? <div className="emptyState">Nenhum produto encontrado.</div> : null}
                            </>
                        )}
                    </div>
                </div>

                <div className="listagemFooter">
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

                        {hasFlow ? (
                            canConcluir ? (
                                <button type="button" className="flowBtn" onClick={openConcluirModal}>
                                    CONCLUIR
                                </button>
                            ) : (
                                <button type="button" className="flowBtn" onClick={nextStep} disabled={loadingSteps}>
                                    PRÓXIMO PASSO
                                </button>
                            )
                        ) : null}
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
                    setStack(["home", "menus", "listagem"]);
                }}
                onCheck={openConcluirModal}
                showCheck={true}
                checkCount={draftItens.length}
                checkDisabled={hasFlow ? !canConcluir : false}
            />

            <div style={{ padding: "22px 26px 0 26px" }}>
                <div className="listTitle detailCrumb" style={{ marginBottom: 10 }}>
                    {noPath.length ? noPath[noPath.length - 1].nome : "RAIZ"}
                </div>

                {!selected ? (
                    <div className="emptyState" style={{ marginTop: 40 }}>
                        Selecione um produto na listagem.
                    </div>
                ) : (
                    <div className="detailLayout">
                        <div className="detailLeft">
                            <div className="detailImgCard">
                                <img src={selected.thumb} alt={selected.nome} className="detailImg" />
                                <button
                                    type="button"
                                    className="zoomBtn"
                                    onClick={() => setOpenZoom(true)}
                                    aria-label="Ampliar imagem"
                                    title="Ampliar"
                                >
                                    🔍
                                </button>
                            </div>

                            <div className="detailMeta">
                                <div className="metaPill">
                                    <b>Saldo:</b> {selected.saldo}
                                </div>
                            </div>
                        </div>

                        <div className="detailRight">
                            <div className="detailTitle">{selected.nome.toUpperCase()}</div>

                            <div className="bulletBox">
                                {selected.descricaoCurta ? <div className="descText">{selected.descricaoCurta}</div> : null}

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

                                    {(() => {
                                        const already = isSelectedInDraft(selected.id);
                                        return (
                                            <button
                                                type="button"
                                                className={cn("iconActionBtn", already && "iconActionBtnSelected")}
                                                onClick={toggleDraftItem}
                                                aria-label={already ? "Remover" : "Adicionar"}
                                                title={already ? "Remover" : "Adicionar"}
                                            >
                                                {already ? <IconCheck /> : <IconPlus />}
                                            </button>
                                        );
                                    })()}
                                </div>
                            </div>

                            <div className="detailFooterRow">
                                <button
                                    type="button"
                                    className="stepBtn stepBtnGhost"
                                    onClick={() => setStack(["home", "menus", "listagem"])}
                                >
                                    Retornar
                                </button>

                                {hasFlow ? (
                                    canConcluir ? (
                                        <button type="button" className="stepBtn" onClick={openConcluirModal}>
                                            Concluir
                                        </button>
                                    ) : (
                                        <button type="button" className="stepBtn" onClick={nextStep} disabled={loadingSteps}>
                                            PRÓXIMO PASSO
                                        </button>
                                    )
                                ) : (
                                    <button type="button" className="stepBtn" onClick={openConcluirModal}>
                                        Concluir
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <Modal
                open={openPrices}
                title="Tabela de valores"
                onClose={() => setOpenPrices(false)}
                footer={
                    <button type="button" className="ctaBtn" onClick={() => setOpenPrices(false)}>
                        FECHAR
                    </button>
                }
            >
                {!selected ? null : (
                    <div style={{ display: "grid", gap: 10 }}>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                padding: "10px 12px",
                                borderRadius: 12,
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.14)",
                            }}
                        >
                            <span style={{ opacity: 0.95 }}>Preço</span>
                            <b>{formatBRL(selected.preco)}</b>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                open={openZoom}
                title="Imagem do produto"
                onClose={() => setOpenZoom(false)}
                maxWidth={1100}
                footer={
                    <button type="button" className="ctaBtn" onClick={() => setOpenZoom(false)}>
                        FECHAR
                    </button>
                }
            >
                {!selected ? null : (
                    <div className="zoomWrap">
                        <img src={selected.thumb} alt={selected.nome} className="zoomImg" />
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
                {orcamentosError ? (
                    <div className="emptyState" style={{ margin: "0 26px 16px" }}>
                        {orcamentosError}
                    </div>
                ) : null}

                <div className="budgetFilters">
                    <div className="searchBox budgetSearchBox">
                        <span className="searchIcon">
                            <IconSearch />
                        </span>
                        <input
                            value={orcamentoBuscaNome}
                            onChange={(e) => setOrcamentoBuscaNome(e.target.value)}
                            className="searchInput"
                            placeholder="Buscar por nome, responsável ou número..."
                            aria-label="Buscar orçamento por nome"
                        />
                    </div>

                    <div className="budgetDateBox">
                        <input
                            type="date"
                            value={orcamentoBuscaData}
                            onChange={(e) => setOrcamentoBuscaData(e.target.value)}
                            className="budgetDateInput"
                            aria-label="Filtrar orçamento por data"
                        />
                    </div>

                    <div className="chip budgetChip">
                        Resultados: <b style={{ marginLeft: 6 }}>{orcamentosFiltrados.length}</b>
                    </div>
                </div>

                {loadingOrcamentos ? (
                    <div className="emptyState" style={{ margin: "0 26px" }}>
                        Carregando orçamentos...
                    </div>
                ) : orcamentosFiltrados.length ? (
                    <>
                        <div className="budgetList">
                            {orcamentosPaginados.map((o) => {
                                const total =
                                    Number(o.valorTotal) ||
                                    o.itens.reduce((acc, it) => acc + clampInt(it.qtd) * (Number(it.valorUnit) || 0), 0);
                                const dataBR = formatDateBR(o.criadoEmISO);
                                const itensCount = o.itens.length;

                                return (
                                    <div key={o.id} className="budgetListItem">
                                        <button
                                            type="button"
                                            className="budgetListNameBtn"
                                            onClick={() => void openOrcamentoResumo(o.id)}
                                            title="Abrir resumo"
                                        >
                                            {o.falecido || `Orçamento ${o.codigo || o.id}`}
                                        </button>

                                        <div className="budgetListMeta">
                                            <span>
                                                Responsável: <b>{o.responsavel || "-"}</b>
                                            </span>
                                            <span>
                                                Nº: <b>{o.codigo || o.id}</b>
                                            </span>
                                            <span>
                                                Data: <b>{dataBR}</b>
                                            </span>
                                            <span>
                                                Itens: <b>{itensCount}</b>
                                            </span>
                                        </div>

                                        <div className="budgetListValue">{formatBRL(total)}</div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="budgetPager">
                            <div className="pagerBtns">
                                <button
                                    type="button"
                                    className="pagerBtn"
                                    onClick={() => setOrcamentoPage((x) => Math.max(1, x - 1))}
                                    disabled={orcamentoPage <= 1}
                                    aria-label="Página anterior dos orçamentos"
                                >
                                    <IconChevron dir="left" />
                                </button>

                                <div className="budgetPagerInfo">
                                    Página <b>{orcamentoPage}</b> de <b>{totalOrcamentoPages}</b>
                                </div>

                                <button
                                    type="button"
                                    className="pagerBtn"
                                    onClick={() => setOrcamentoPage((x) => Math.min(totalOrcamentoPages, x + 1))}
                                    disabled={orcamentoPage >= totalOrcamentoPages}
                                    aria-label="Próxima página dos orçamentos"
                                >
                                    <IconChevron dir="right" />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="emptyState" style={{ margin: "0 26px" }}>
                        Nenhum orçamento encontrado.
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

                {loadingResumo ? (
                    <div className="emptyState" style={{ marginTop: 18 }}>
                        Carregando orçamento...
                    </div>
                ) : !orcamentoSelecionado ? (
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
                                    <div className="resumoOrcSub">Nº {orcamentoSelecionado.codigo || orcamentoSelecionado.id}</div>
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
                            <div className="resumoTableHead2 resumoTableHead2Cols">
                                <div>Item</div>
                                <div style={{ textAlign: "right" }}>Valor</div>
                            </div>

                            {orcamentoSelecionado.itens.map((it, idx) => (
                                <div key={`${it.produtoId}-${idx}`} className="resumoRow2 resumoRow2Cols">
                                    <div className="resumoItemName">{it.nome}</div>
                                    <div style={{ textAlign: "right" }}>{formatBRL((Number(it.valorUnit) || 0) * clampInt(it.qtd))}</div>
                                </div>
                            ))}
                        </div>

                        <div className="resumoBottom resumoBottomOnlyTotal">
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

    let screen: React.ReactNode = null;
    if (current === "home") screen = ScreenHome;
    if (current === "menus") screen = ScreenMenus;
    if (current === "listagem") screen = ScreenListagem;
    if (current === "detalhe") screen = ScreenDetalhe;
    if (current === "orcamentos") screen = ScreenOrcamentos;
    if (current === "resumo") screen = ScreenResumo;

    return (
        <div className="root">
            <style>{css}</style>

            {screen}

            <Modal
                open={openUserPick}
                title="Selecionar Operador"
                onClose={() => setOpenUserPick(false)}
                maxWidth={760}
                footer={
                    <div style={{ display: "flex", gap: 10 }}>
                        <button type="button" className="ctaBtn" onClick={() => setOpenUserPick(false)} style={{ minWidth: 180 }}>
                            CANCELAR
                        </button>

                        <button type="button" className="ctaBtn" onClick={confirmarOperador} style={{ minWidth: 220 }} disabled={!operadorTemp}>
                            CONFIRMAR
                        </button>
                    </div>
                }
            >
                {usersError ? <div className="errorBox">{usersError}</div> : null}

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
                                if (pick) setOperadorTemp(pick);
                            }
                        }}
                        className="userPickerInput"
                        placeholder={loadingUsers ? "Carregando usuários..." : "Digite nome ou @usuário..."}
                        aria-label="Buscar operador"
                        autoFocus
                        disabled={loadingUsers}
                    />
                </div>

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
                            const selectedU = operadorTemp?.id === u.id;

                            return (
                                <button
                                    key={u.id}
                                    type="button"
                                    className={cn("userRow", active && "userRowActive", selectedU && "userRowSelected")}
                                    onMouseEnter={() => setUserHighlight(idx)}
                                    onClick={() => setOperadorTemp(u)}
                                    title="Selecionar"
                                >
                                    <div className="userRowLeft">
                                        <div className="userName">{u.nome}</div>
                                        <div className="userUser">@{u.usuario}</div>
                                    </div>

                                    {selectedU ? <span className="userRowCheck">✓</span> : null}
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

            <Modal
                open={openConcluir}
                title="Revisão da Homenagem"
                onClose={() => setOpenConcluir(false)}
                maxWidth={980}
                footer={
                    <div style={{ display: "flex", gap: 10 }}>
                        <button type="button" className="ctaBtn" onClick={() => setOpenConcluir(false)} style={{ minWidth: 180 }}>
                            VOLTAR
                        </button>
                        <button
                            type="button"
                            className="ctaBtn"
                            onClick={() => void finalizarOrcamento()}
                            style={{ minWidth: 220 }}
                            disabled={savingOrcamento}
                        >
                            {savingOrcamento ? "SALVANDO..." : "FINALIZAR"}
                        </button>
                    </div>
                }
            >
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
                            <b>Operador:</b> {operadorSel ? `${operadorSel.nome} (@${operadorSel.usuario})` : "-"}
                        </div>
                    </div>
                </div>

                {draftItens.length === 0 ? (
                    <div className="emptyState" style={{ marginTop: 12 }}>
                        Nenhum item selecionado. Você pode finalizar mesmo assim.
                    </div>
                ) : (
                    <div className="reviewWrap">
                        <div className="reviewItems">
                            {draftItens.map((it) => (
                                <div key={it.produtoId} className="reviewItemRow">
                                    <button type="button" className="reviewItemNameBtn" onClick={() => openItemFromReview(it.produtoId)} title="Abrir item">
                                        {it.nome}
                                    </button>

                                    <div className="reviewItemRight">
                                        <div className="reviewItemPrice">{formatBRL(Number(it.valorUnit) || 0)}</div>
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

/* =======================
   CSS
======================= */

const css = `
  :root{
    --bg1:#2ca3d4;
    --bg2:#0e4c86;
    --ink: rgba(255,255,255,0.95);
    --shadow: 0 16px 34px rgba(0,0,0,0.25);
  }

  html, body{
    height: 100%;
  }

  .root{
    width: 100%;
    height: 100dvh;
    min-height: 100dvh;
    overflow: hidden;
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
    width: min(1200px, 100%);
    max-height: calc(100dvh - 24px);
    height: min(680px, calc(100dvh - 24px));
    max-width: calc(100% - 24px);
    border-radius: 14px;
    overflow: hidden;
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

  .pageTitleWrap{
    text-align:center;
    margin-top: clamp(14px, 3vh, 38px);
    margin-bottom: clamp(10px, 2.5vh, 26px);
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
    max-width: 980px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .menusWrap{
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0 18px 18px 18px;
    box-sizing: border-box;
  }

  .gridMenu2{
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(240px, 1fr));
    gap: clamp(10px, 2vh, 28px);
    flex: 1 1 auto;
    min-height: 0;
    align-content: start;
  }

  .bigBtn{
    width: 100%;
    height: clamp(56px, 8vh, 84px);
    display:flex;
    align-items:center;
    justify-content:center;
    padding: 0 clamp(14px, 2vw, 24px);
    border-radius: clamp(14px, 2.2vh, 20px);
    font-family: var(--font-nunito), Nunito, sans-serif;
    font-weight: 800;
    font-size: clamp(16px, 2.2vh, 22px);
    letter-spacing: .8px;
    white-space: nowrap;
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

  .listHeader{ margin-bottom: 14px; }

  .listTitle{
    color: #ffe600;
    font-weight: 900;
    letter-spacing: 1px;
    font-size: 20px;
    text-shadow: 0 10px 20px rgba(0,0,0,0.25);
  }

  .detailCrumb{
    color: rgba(255,255,255,0.95) !important;
  }

  .listSubTitle{
    margin-top: 0px;
    color: var(--ink);
    font-weight: 800;
    letter-spacing: 1px;
    font-size: 18px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

  .listagemWrap{
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 22px 26px 0 26px;
    box-sizing: border-box;
  }

  .gridProdutosWrap{
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding-bottom: 5px;
    -webkit-overflow-scrolling: touch;
  }

  .gridProdutos{
    display:grid;
    grid-template-columns: repeat(4, minmax(170px, 1fr));
    gap: 18px;
    margin-top: 14px;
  }

  .listagemFooter{
    flex: 0 0 auto;
    padding: 6px 18px 6px;
    transform: translateY(-30px);
  }

  .pagerRow{
    display:flex;
    justify-content:flex-end;
    align-items:center;
    gap: 8px;
    flex-wrap: nowrap;
    margin: 0;
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

  .flowBtn{
    border-radius: 999px;
    padding: 12px 16px;
    background: #029cde;
    border: 2px solid rgba(255,255,255,0.35);
    box-shadow: var(--shadow);
    color: #fff;
    font-weight: 1000;
    letter-spacing: 1px;
    cursor:pointer;
    min-width: 190px;
    height: 46px;
    display:flex;
    align-items:center;
    justify-content:center;
  }
  .flowBtn:hover{ filter: brightness(1.02); transform: translateY(-1px); }
  .flowBtn:active{ transform: translateY(0px) scale(0.995); }
  .flowBtn:disabled{ opacity: 0.55; cursor:not-allowed; transform: none; }

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

  .detailLayout{
    position: relative;
    display:grid;
    grid-template-columns: 520px 1fr;
    gap: 18px;
    align-items: start;
    margin-top: 12px;
    padding-bottom: 74px;
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
    background: rgba(255,255,255,0.92);
    border: 2px solid rgba(2,156,222,0.55);
    color: #0b2b4d;
    font-size: 18px;
    display:flex;
    align-items:center;
    justify-content:center;
    cursor:pointer;
    box-shadow: 0 14px 30px rgba(0,0,0,0.22);
  }
  .zoomBtn:hover{ filter: brightness(1.03); transform: translateY(-1px); }
  .zoomBtn:active{ transform: translateY(0px) scale(0.98); }

  .zoomWrap{
    width: 100%;
    overflow: hidden;
    border-radius: 14px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.14);
    padding: 10px;
  }

  .zoomImg{
    width: 100%;
    height: min(72vh, 680px);
    object-fit: contain;
    display: block;
    border-radius: 12px;
  }

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
    position: relative;
  }

  .detailTitle{
    color: rgba(255,255,255,0.95);
    font-weight: 900;
    letter-spacing: 1px;
    font-size: 28px;
    margin-bottom: 10px;
  }

  .bulletBox{ margin-top: 6px; display:flex; flex-direction:column; gap: 10px; }

  .descText{
    color: rgba(255,255,255,0.92);
    font-weight: 700;
    line-height: 1.45;
    font-size: 14px;
    white-space: pre-wrap;
  }

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

  .iconActionBtnSelected{
    background: rgba(230, 255, 238, 0.92);
    border-color: rgba(16, 185, 129, 0.35);
    color: #065f46;
  }

  .detailFooterRow{
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 12px;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    z-index: 6;
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
  .stepBtn:disabled{ opacity: 0.55; cursor:not-allowed; transform: none; }

  .stepBtnGhost{
    background: rgba(220,233,246,0.92);
    color: #111;
    border: 2px solid rgba(255,255,255,0.55);
    min-width: 140px;
  }

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
  .ctaBtn:disabled{ opacity: .65; cursor: not-allowed; transform: none; }

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

  .userPickerIcon{ color: rgba(255,255,255,0.92); display:flex; flex: 0 0 auto; }

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

  .budgetsWrap{
    padding: 0 26px 24px 26px;
    height: calc(100% - 110px);
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
  }

  .budgetFilters{
    display: grid;
    grid-template-columns: minmax(300px, 1fr) 180px 170px;
    gap: 12px;
    align-items: center;
    flex: 0 0 auto;
  }

  .budgetSearchBox{
    min-width: 0;
  }

  .budgetDateBox{
    display:flex;
    align-items:center;
  }

  .budgetDateInput{
    width: 100%;
    height: 48px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.22);
    background: rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.95);
    font-weight: 800;
    padding: 0 12px;
    outline: none;
    box-shadow: 0 14px 30px rgba(0,0,0,0.18);
  }

  .budgetDateInput::-webkit-calendar-picker-indicator{
    filter: invert(1);
    cursor: pointer;
  }

  .budgetChip{
    min-width: 0;
  }

  .budgetList{
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-right: 4px;
    -webkit-overflow-scrolling: touch;
  }

  .budgetListItem{
    display: grid;
    grid-template-columns: minmax(260px, 1fr) minmax(320px, 1.2fr) 160px;
    gap: 14px;
    align-items: center;
    padding: 14px 16px;
    border-radius: 18px;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.18);
    box-shadow: 0 18px 34px rgba(0,0,0,0.18);
    color: rgba(255,255,255,0.94);
  }

  .budgetListNameBtn{
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    text-align: left;
    color: rgba(255,255,255,0.96);
    font-weight: 1000;
    font-size: 18px;
    letter-spacing: 0.3px;
    cursor: pointer;
  }
  .budgetListNameBtn:hover{
    text-decoration: underline;
    filter: brightness(1.05);
  }

  .budgetListMeta{
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    font-weight: 800;
    opacity: 0.95;
    font-size: 14px;
  }

  .budgetListValue{
    justify-self: end;
    font-weight: 1000;
    background: rgba(2,156,222,0.30);
    border: 1px solid rgba(2,156,222,0.40);
    padding: 8px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .budgetPager{
    flex: 0 0 auto;
    display: flex;
    justify-content: center;
    padding-top: 4px;
  }

  .budgetPagerInfo{
    color: rgba(255,255,255,0.95);
    font-weight: 800;
    min-width: 130px;
    text-align: center;
  }

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

  .resumoOrcBlock{ display:flex; flex-direction:column; }

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
    grid-template-columns: 260px 1fr 90px 140px;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 2px solid rgba(2,156,222,0.35);
    color: #0b2b4d;
    font-weight: 1000;
  }

  .resumoRow2{
    display:grid;
    grid-template-columns: 260px 1fr 90px 140px;
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

  .resumoTotalBox{
    display:flex;
    align-items:center;
    gap: 12px;
  }

  .resumoTotalLabel{ color: #0b2b4d; font-weight: 1000; }

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

  .resumoTableHead2Cols{ grid-template-columns: 1fr 180px; }
  .resumoRow2Cols{ grid-template-columns: 1fr 180px; }
  .resumoBottomOnlyTotal{ justify-content: flex-end; }

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

  .reviewHeaderRow{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 16px;
    align-items: center;
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
  .reviewItemNameBtn:hover{ text-decoration: underline; filter: brightness(1.05); }

  @media (pointer: coarse) and (hover: none) and (min-width: 768px) and (max-width: 1366px){
  .listagemWrap{
    padding: 20px 18px 0 18px;
  }

  .listHeader{
    margin-bottom: 14px;
  }

  .searchRow{
    margin-top: 12px;
    gap: 10px;
  }

  .searchBox{
    padding: 8px 10px;
    border-radius: 12px;
  }

  .chip{
    padding: 8px 10px;
    min-width: 96px;
    font-size: 13px;
  }

  .gridProdutos{
    grid-template-columns: repeat(4, minmax(146px, 1fr)); margin-top: 8px;
    margin-top: 18px;
  }

  .prodCard{
    padding: 8px;
    border-radius: 14px;
  }

  .prodImgWrap{
    height: 98px;
    border-radius: 12px;
  }

  .prodName{
    margin-top: 8px;
    font-size: 12px;
    min-height: 28px;
    line-height: 1.15;
  }

  .pagerBtns{
    padding: 8px 10px;
    gap: 8px;
  }

  .pagerBtn{
    width: 40px;
    height: 32px;
  }

  .flowBtn{
    min-width: 150px;
    height: 40px;
    padding: 10px 12px;
    font-size: 13px;
  }
}

  @media (max-height: 720px){
    .listagemFooter{
      padding-top: 6px;
      padding-bottom: calc(60px + env(safe-area-inset-bottom));
    }
    .flowBtn{
      height: 42px;
      padding: 10px 14px;
    }
  }

  @media (max-width: 1100px){
    .detailLayout{ grid-template-columns: 1fr; }
    .detailImgCard{ height: 300px; }
    .resumoHeader2{ grid-template-columns: 1fr; }
    .resumoDate{ justify-content:flex-start; }
    .budgetListItem{
      grid-template-columns: 1fr;
      align-items: start;
    }
    .budgetListValue{
      justify-self: start;
    }
  }

  @media (max-width: 900px){
    .gridMenu2{
      grid-template-columns: 1fr;
      max-width: 520px;
    }

    .budgetFilters{
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px){
    .gridProdutos{ grid-template-columns: repeat(2, minmax(160px, 1fr)); }

    .resumoTableHead2Cols, .resumoRow2Cols{ grid-template-columns: 1fr 140px; }

    .detailFooterRow{ justify-content: space-between; padding-right: 0; }
    .stepBtn{ min-width: 0; width: 100%; }

    .reviewHeaderRow{ grid-template-columns: 1fr; }

    .pagerRow{ justify-content: space-between; }
    .flowBtn{ min-width: 0; width: 100%; }

    .budgetPager .pagerBtns{
      width: 100%;
      justify-content: space-between;
    }

    .budgetPagerInfo{
      min-width: 0;
      flex: 1;
    }
  }

  @media (max-height: 740px){
    .title{ font-size: 28px; }
    .gridMenu2{ gap: 16px; }
    .bigBtn{ height: 70px; font-size: 20px; border-radius: 18px; }
    .pill{ padding: 8px 12px; }
  }

  @media (max-height: 660px){
    .title{ font-size: 24px; }
    .gridMenu2{ gap: 12px; }
    .bigBtn{ height: 62px; font-size: 18px; }
  }

  @media (max-height: 720px){
    .screen{
      max-height: calc(100% - 12px);
    }
  }
`;