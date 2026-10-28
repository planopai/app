// app/config-catalogo/page.tsx — Configuração do Catálogo (menus, produtos de cada menu e fluxo do "Próximo passo")
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    IconArrowDown,
    IconArrowUp,
    IconCheck,
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
    IconFilter,
    IconFolder,
    IconFolderPlus,
    IconLayoutList,
    IconListNumbers,
    IconPencil,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconTrash,
    IconX,
} from "@tabler/icons-react";

const API_URL = "https://api.planoassistencialintegrado.com.br/catalogo_api.php";

/* ================== Tipos ================== */

type No = {
    id: number;
    parent_id: number | null;
    nome: string;
    ordem: number;
    ativo: number | boolean;
};

type Produto = {
    id: number;
    nome: string;
    codigo_barras?: string | null;
    valor?: number | string | null;
    foto_url?: string | null;
    descricao?: string | null;
    categoria_nome?: string | null;
    classificacao_nome?: string | null;
    fabricante_nome?: string | null;
    deposito_nome?: string | null;
};

type Option = { id: number; nome: string };

type FluxoInfo = { fluxo_nome: string; total: number | string };

type FluxoStep = {
    id?: number;
    fluxo_nome: string;
    ordem: number;
    no_id: number | null;
    titulo?: string | null;
    required: number | boolean;
    max_select: number;
    ativo: number | boolean;
};

type NoArvore = No & { children: NoArvore[] };

type Aba = "menus" | "fluxo";

/* ================== Helpers ================== */

function asBool(v: any) {
    return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";
}

function toInt(v: any, fallback = 0) {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : fallback;
}

async function apiGET(params: Record<string, any>) {
    const url = new URL(API_URL);
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        url.searchParams.set(k, String(v));
    });
    url.searchParams.set("_nocache", String(Date.now()));

    const r = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });

    const j = await r.json().catch(() => null);
    if (!j) throw new Error("Resposta inválida do servidor.");
    if (j.need_login) {
        window.location.href = "/login";
        return null;
    }
    if (!r.ok || !j.ok) throw new Error(j.msg || "Erro no servidor.");
    return j;
}

async function apiPOST(body: any) {
    const r = await fetch(API_URL, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });

    const j = await r.json().catch(() => null);
    if (!j) throw new Error("Resposta inválida do servidor.");
    if (j.need_login) {
        window.location.href = "/login";
        return null;
    }
    if (!r.ok || !j.ok) throw new Error(j.msg || "Erro no servidor.");
    return j;
}

/** monta árvore a partir da lista */
function buildTree(nodes: No[]): NoArvore[] {
    const map = new Map<number, NoArvore>();
    nodes.forEach((n) => map.set(n.id, { ...n, children: [] }));

    const roots: NoArvore[] = [];
    map.forEach((n) => {
        if (n.parent_id != null && map.has(n.parent_id)) {
            map.get(n.parent_id)!.children.push(n);
        } else {
            roots.push(n);
        }
    });

    const sortRec = (arr: NoArvore[]) => {
        arr.sort((a, b) => toInt(a.ordem) - toInt(b.ordem) || String(a.nome).localeCompare(String(b.nome)));
        arr.forEach((x) => sortRec(x.children || []));
    };
    sortRec(roots);

    return roots;
}

function mesmoConjunto(a: Set<number>, b: Set<number>) {
    if (a.size !== b.size) return false;
    return Array.from(a).every((x) => b.has(x));
}

/** Snapshot dos passos para saber se há alteração não salva. */
function chavePassos(steps: FluxoStep[]) {
    return JSON.stringify(
        steps.map((s) => [
            s.no_id ?? null,
            String(s.titulo ?? "").trim(),
            asBool(s.required) ? 1 : 0,
            Math.max(1, toInt(s.max_select, 1)),
            asBool(s.ativo) ? 1 : 0,
        ])
    );
}

/* ================== Visual (padrão repaginado) ================== */

const CARD = "rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";
const TXT_SEC = "text-[#5B6478] dark:text-[#AEB9CF]";
const BTN_BASE =
    "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-bold transition outline-none focus-visible:ring-2 focus-visible:ring-[#3D6A99]/30 disabled:cursor-not-allowed disabled:opacity-45";
const BTN_SEC = `${BTN_BASE} border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08] lg:border`;
const BTN_PRI = `${BTN_BASE} border-[1.5px] border-[#313C55] bg-[#313C55] font-extrabold text-white hover:bg-[#232B40] dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30] lg:border`;
const BTN_PERIGO = `${BTN_BASE} border-[1.5px] border-[#B42318] bg-[#B42318] font-extrabold text-white hover:bg-[#9A1D14] dark:border-[#FF9C92] dark:bg-[#FF9C92] dark:text-[#313C55] lg:border`;
const BTN_PERIGO_TXT = `${BTN_BASE} text-[#B42318] hover:bg-[#FDECEA] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15`;
const BTN_ICONE =
    "inline-grid size-11 shrink-0 place-items-center rounded-xl border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-45 dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08] lg:border";
const BTN_ICONE_SUAVE =
    "inline-grid size-10 shrink-0 place-items-center rounded-lg text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-35 dark:text-white dark:hover:bg-white/[0.08]";
const CAMPO =
    "h-12 w-full rounded-xl border border-transparent bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 disabled:opacity-60 dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#8893AA]";
const ROTULO = "mb-2 block text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";
const TITULO_BLOCO = "text-[13px] font-extrabold uppercase tracking-[.12em] text-[#5B6478] dark:text-[#AEB9CF]";

function NoCorpo({ children }: { children: React.ReactNode }) {
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);
    return montado ? createPortal(children, document.body) : null;
}

/** Janela padrão: centralizada no computador, folha que sobe de baixo no celular. Esc fecha. */
function Janela({
    titulo,
    subtitulo,
    icone,
    onClose,
    podeFechar = true,
    rodape,
    children,
}: {
    titulo: string;
    subtitulo?: React.ReactNode;
    icone?: React.ReactNode;
    onClose: () => void;
    podeFechar?: boolean;
    rodape?: React.ReactNode;
    children?: React.ReactNode;
}) {
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.stopImmediatePropagation();
            if (podeFechar) onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey, true);
        };
    }, [onClose, podeFechar]);

    return (
        <NoCorpo>
            <div
                role="dialog"
                data-pai-overlay
                aria-modal="true"
                aria-label={titulo}
                className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6"
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget && podeFechar) onClose();
                }}
            >
                <div className="flex max-h-[92dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white lg:max-w-[460px] lg:rounded-3xl lg:border lg:border-[#E3E8F0] lg:shadow-2xl lg:dark:border-white/[0.12]">
                    <div className="flex items-start gap-3 border-b border-[#E3E8F0] pb-3 pl-5 pr-2 pt-4 dark:border-white/[0.12] lg:px-6 lg:py-5">
                        {icone ? <div className="mt-0.5 shrink-0">{icone}</div> : null}
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[19px] font-extrabold leading-tight lg:text-xl">{titulo}</h2>
                            {subtitulo ? <div className={`mt-0.5 text-[13px] lg:mt-1 lg:text-sm ${TXT_SEC}`}>{subtitulo}</div> : null}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={!podeFechar}
                            className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[#EEF2F7] disabled:opacity-40 dark:hover:bg-white/[0.08]"
                            aria-label="Fechar"
                        >
                            <IconX size={20} stroke={1.8} />
                        </button>
                    </div>

                    {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-6 lg:py-5">{children}</div> : null}

                    {rodape ? (
                        <div className="flex gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:justify-end lg:gap-3 lg:px-6 lg:py-4 [&>*]:flex-1 lg:[&>*]:flex-none">
                            {rodape}
                        </div>
                    ) : null}
                </div>
            </div>
        </NoCorpo>
    );
}

/** Janela com um campo de nome (novo menu, submenu, renomear, novo fluxo). */
function JanelaNome({
    titulo,
    subtitulo,
    rotulo,
    inicial,
    placeholder,
    botao,
    onCancelar,
    onSalvar,
}: {
    titulo: string;
    subtitulo?: React.ReactNode;
    rotulo: string;
    inicial: string;
    placeholder?: string;
    botao: string;
    onCancelar: () => void;
    onSalvar: (nome: string) => Promise<boolean>;
}) {
    const [nome, setNome] = useState(inicial);
    const [salvando, setSalvando] = useState(false);
    const ok = nome.trim().length > 0 && nome.trim() !== inicial.trim();

    const enviar = async () => {
        if (!ok || salvando) return;
        setSalvando(true);
        const fechou = await onSalvar(nome.trim());
        if (!fechou) setSalvando(false);
    };

    return (
        <Janela
            titulo={titulo}
            subtitulo={subtitulo}
            onClose={onCancelar}
            podeFechar={!salvando}
            rodape={
                <>
                    <button type="button" onClick={onCancelar} disabled={salvando} className={BTN_SEC}>
                        Voltar
                    </button>
                    <button type="button" onClick={() => void enviar()} disabled={!ok || salvando} className={BTN_PRI}>
                        <IconCheck size={18} stroke={2.2} />
                        {salvando ? "Salvando…" : botao}
                    </button>
                </>
            }
        >
            <label className="block">
                <span className={ROTULO}>{rotulo}</span>
                <input
                    autoFocus
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void enviar();
                    }}
                    placeholder={placeholder}
                    className={CAMPO}
                />
            </label>
        </Janela>
    );
}

function SeloInativo() {
    return (
        <span className="shrink-0 rounded-full border border-[#C9D1DE] bg-[#EEF2F7] px-1.5 py-px text-[10.5px] font-extrabold text-[#5B6478] dark:border-white/25 dark:bg-white/10 dark:text-[#AEB9CF]">
            Inativo
        </span>
    );
}

/** Seletor Sim/Não em pílula (usado nos passos do fluxo). */
function Alternar({
    valor,
    onChange,
    rotuloSim,
    rotuloNao,
}: {
    valor: boolean;
    onChange: (v: boolean) => void;
    rotuloSim: string;
    rotuloNao: string;
}) {
    return (
        <div className="inline-flex rounded-xl border border-[#E3E8F0] bg-white p-0.5 dark:border-white/[0.12] dark:bg-[#1C2334]">
            {[true, false].map((v) => {
                const on = valor === v;
                return (
                    <button
                        key={String(v)}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(v)}
                        className={[
                            "h-9 rounded-lg px-3 text-[13px] font-bold transition",
                            on ? (v ? "bg-[#313C55] text-white dark:bg-[#3D6A99]" : "bg-[#EEF2F7] text-[#313C55] dark:bg-white/10 dark:text-white") : `${TXT_SEC} hover:text-[#313C55] dark:hover:text-white`,
                        ].join(" ")}
                    >
                        {v ? rotuloSim : rotuloNao}
                    </button>
                );
            })}
        </div>
    );
}

/* ================== Árvore ================== */

function NodeItem({
    node,
    depth,
    selectedId,
    onSelect,
    expanded,
    toggleExpand,
    filtro,
}: {
    node: NoArvore;
    depth: number;
    selectedId: number | null;
    onSelect: (id: number) => void;
    expanded: Set<number>;
    toggleExpand: (id: number) => void;
    filtro: Set<number> | null;
}) {
    if (filtro && !filtro.has(node.id)) return null;

    const isSel = selectedId === node.id;
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isOpen = filtro ? true : expanded.has(node.id);
    const ativo = asBool(node.ativo);

    return (
        <div>
            <div
                className={[
                    "group relative flex items-center rounded-xl pr-1.5 transition",
                    isSel ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/25" : "hover:bg-[#F6F8FB] dark:hover:bg-white/[0.05]",
                ].join(" ")}
                style={{ paddingLeft: 4 + depth * 18 }}
            >
                {isSel ? <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-[#313C55] dark:bg-[#F2CB3F]" aria-hidden /> : null}

                <button
                    type="button"
                    className={`grid size-9 shrink-0 place-items-center rounded-lg ${hasChildren ? "text-[#5B6478] hover:bg-black/5 dark:text-[#AEB9CF] dark:hover:bg-white/10" : "text-transparent"}`}
                    disabled={!hasChildren}
                    title={hasChildren ? (isOpen ? "Recolher" : "Expandir") : undefined}
                    aria-label={hasChildren ? (isOpen ? `Recolher ${node.nome}` : `Expandir ${node.nome}`) : undefined}
                    onClick={() => hasChildren && toggleExpand(node.id)}
                >
                    {hasChildren ? <IconChevronDown size={16} stroke={2} className={`transition-transform ${isOpen ? "" : "-rotate-90"}`} /> : <span className="size-1 rounded-full bg-[#C9D1DE]" />}
                </button>

                <button
                    type="button"
                    className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 text-left text-[14.5px] ${isSel ? "font-extrabold" : "font-semibold"} ${ativo ? "" : "opacity-60"}`}
                    onClick={() => onSelect(node.id)}
                    title={`#${node.id}`}
                >
                    <IconFolder size={17} stroke={1.8} className={`shrink-0 ${isSel ? "text-[#313C55] dark:text-white" : "text-[#7A8396]"}`} />
                    <span className="min-w-0 flex-1 truncate">{node.nome}</span>
                    {hasChildren ? <span className={`shrink-0 text-[11.5px] font-bold ${TXT_SEC}`}>{node.children.length}</span> : null}
                    {!ativo ? <SeloInativo /> : null}
                </button>
            </div>

            {hasChildren && isOpen ? (
                <div>
                    {node.children.map((ch) => (
                        <NodeItem
                            key={ch.id}
                            node={ch}
                            depth={depth + 1}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            expanded={expanded}
                            toggleExpand={toggleExpand}
                            filtro={filtro}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/* ================== Página ================== */

export default function CatalogoConfigPage() {
    const [aba, setAba] = useState<Aba>("menus");

    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const msgTimer = useRef<number | null>(null);

    const [nodes, setNodes] = useState<No[]>([]);
    const tree = useMemo(() => buildTree(nodes), [nodes]);
    const [selectedNoId, setSelectedNoId] = useState<number | null>(null);

    // controle de expandir/encolher
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const expandAll = useCallback(() => {
        const all = new Set<number>();
        nodes.forEach((n) => all.add(n.id));
        setExpanded(all);
    }, [nodes]);
    const collapseAll = useCallback(() => setExpanded(new Set()), []);
    const toggleExpand = useCallback((id: number) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // busca dentro da árvore (só na tela)
    const [buscaArvore, setBuscaArvore] = useState("");

    // produtos já vinculados ao nó (como estão salvos) e seleção atual
    const [noProdutos, setNoProdutos] = useState<Produto[]>([]);
    const [carregandoNo, setCarregandoNo] = useState(false);
    const [originalIds, setOriginalIds] = useState<Set<number>>(new Set());
    const [selectedProdutoIds, setSelectedProdutoIds] = useState<Set<number>>(new Set());
    // dados dos produtos vistos (vinculados ou da busca), para mostrar o nome na lista "Neste menu"
    const [conhecidos, setConhecidos] = useState<Map<number, Produto>>(new Map());
    const [salvandoProdutos, setSalvandoProdutos] = useState(false);

    // busca no estoque + filtros
    const [q, setQ] = useState("");
    const [estoqueLoading, setEstoqueLoading] = useState(false);
    const [estoqueRows, setEstoqueRows] = useState<Produto[]>([]);
    const [buscou, setBuscou] = useState(false);
    const [filtrosAbertos, setFiltrosAbertos] = useState(false);

    // combos
    const [depositos, setDepositos] = useState<Option[]>([]);
    const [categorias, setCategorias] = useState<Option[]>([]);
    const [fabricantes, setFabricantes] = useState<Option[]>([]);
    const [classificacoes, setClassificacoes] = useState<Option[]>([]);

    const [fDeposito, setFDeposito] = useState<number>(0);
    const [fCategoria, setFCategoria] = useState<number>(0);
    const [fFabricante, setFFabricante] = useState<number>(0);
    const [fClassificacao, setFClassificacao] = useState<number>(0);
    const qtdFiltros = [fDeposito, fCategoria, fFabricante, fClassificacao].filter((x) => x > 0).length;

    // Fluxos / passos
    const [fluxos, setFluxos] = useState<FluxoInfo[]>([]);
    const [fluxoNome, setFluxoNome] = useState<string>(""); // fluxo selecionado/ativo
    const [fluxoSteps, setFluxoSteps] = useState<FluxoStep[]>([]);
    const [fluxoOriginal, setFluxoOriginal] = useState<string>(chavePassos([]));
    const [fluxoLoading, setFluxoLoading] = useState(false);
    const [fluxoSalvando, setFluxoSalvando] = useState(false);

    // Janelas
    const [janelaNome, setJanelaNome] = useState<null | "raiz" | "filho" | "renomear" | "fluxo">(null);
    const [confirmarExcluir, setConfirmarExcluir] = useState(false);
    const [excluindo, setExcluindo] = useState(false);
    /** Ação que espera o usuário decidir sobre alterações não salvas. */
    const [pendente, setPendente] = useState<null | { texto: string; acao: () => void }>(null);

    const mostrar = useCallback((m: { ok: boolean; text: string } | null) => {
        if (msgTimer.current) window.clearTimeout(msgTimer.current);
        setMsg(m);
        if (m?.ok) msgTimer.current = window.setTimeout(() => setMsg(null), 4000);
    }, []);

    useEffect(
        () => () => {
            if (msgTimer.current) window.clearTimeout(msgTimer.current);
        },
        []
    );

    const produtosAlterados = useMemo(() => !mesmoConjunto(originalIds, selectedProdutoIds), [originalIds, selectedProdutoIds]);
    const qtdAlteracoesProdutos = useMemo(() => {
        let n = 0;
        selectedProdutoIds.forEach((id) => {
            if (!originalIds.has(id)) n++;
        });
        originalIds.forEach((id) => {
            if (!selectedProdutoIds.has(id)) n++;
        });
        return n;
    }, [originalIds, selectedProdutoIds]);
    const fluxoAlterado = useMemo(() => !!fluxoNome && chavePassos(fluxoSteps) !== fluxoOriginal, [fluxoNome, fluxoSteps, fluxoOriginal]);

    // Aviso do navegador ao sair da página com alterações não salvas.
    useEffect(() => {
        if (!produtosAlterados && !fluxoAlterado) return;
        const onBefore = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", onBefore);
        return () => window.removeEventListener("beforeunload", onBefore);
    }, [produtosAlterados, fluxoAlterado]);

    const lembrar = useCallback((rows: Produto[]) => {
        if (!rows.length) return;
        setConhecidos((prev) => {
            const next = new Map(prev);
            rows.forEach((p) => next.set(toInt(p.id), p));
            return next;
        });
    }, []);

    const loadInit = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiGET({ init: 1 });
            if (!res) return;

            const raw = Array.isArray(res.nos) ? res.nos : [];
            setNodes(raw);

            const optMap = (arr: any): Option[] =>
                Array.isArray(arr) ? arr.map((x) => ({ id: toInt(x.id), nome: String(x.nome ?? x.descricao ?? "") })) : [];

            setDepositos(optMap(res.depositos));
            setCategorias(optMap(res.categorias));
            setFabricantes(optMap(res.fabricantes));
            setClassificacoes(optMap(res.classificacoes));

            // fluxos listados pelo PHP
            const fl: FluxoInfo[] = Array.isArray(res.fluxos)
                ? res.fluxos
                    .map((x: any) => ({
                        fluxo_nome: String(x.fluxo_nome ?? ""),
                        total: x.total ?? 0,
                    }))
                    .filter((x: FluxoInfo) => x.fluxo_nome)
                : [];
            setFluxos(fl);

            // se não tiver fluxo selecionado ainda, pega o primeiro existente
            setFluxoNome((prev) => {
                if (prev) return prev;
                if (fl.length > 0) return fl[0].fluxo_nome;
                return "";
            });

            setExpanded((prev) => {
                if (prev.size > 0) return prev;
                const roots = new Set<number>();
                raw.forEach((n: any) => {
                    if (n.parent_id == null) roots.add(toInt(n.id));
                });
                return roots;
            });
        } catch (e: any) {
            setNodes([]);
            setFluxos([]);
            mostrar({ ok: false, text: e?.message || "Falha ao carregar." });
        } finally {
            setLoading(false);
        }
    }, [mostrar]);

    useEffect(() => {
        loadInit();
    }, [loadInit]);

    const loadNoProdutos = useCallback(
        async (no_id: number) => {
            setCarregandoNo(true);
            try {
                const res = await apiGET({ no_produtos: 1, no_id });
                if (!res) return;
                const rows: Produto[] = Array.isArray(res.rows) ? res.rows : [];
                setNoProdutos(rows);
                lembrar(rows);
                const ids = new Set<number>();
                rows.forEach((p: any) => ids.add(toInt(p.id)));
                setSelectedProdutoIds(ids);
                setOriginalIds(new Set(ids));
            } catch (e: any) {
                setNoProdutos([]);
                setSelectedProdutoIds(new Set());
                setOriginalIds(new Set());
                mostrar({ ok: false, text: e?.message || "Falha ao carregar produtos do menu." });
            } finally {
                setCarregandoNo(false);
            }
        },
        [lembrar, mostrar]
    );

    /** Executa a ação; se houver produtos não salvos, pergunta antes. */
    const comProdutosSalvos = useCallback(
        (acao: () => void) => {
            if (produtosAlterados) {
                setPendente({
                    texto: "Os produtos deste menu têm alterações que ainda não foram salvas.",
                    acao: () => {
                        setSelectedProdutoIds(new Set(originalIds));
                        acao();
                    },
                });
                return;
            }
            acao();
        },
        [produtosAlterados, originalIds]
    );

    const abrirNo = useCallback(
        (id: number) => {
            setSelectedNoId(id);
            setEstoqueRows([]);
            setBuscou(false);
            setQ("");
            loadNoProdutos(id);
            setExpanded((prev) => {
                const next = new Set(prev);
                next.add(id);
                return next;
            });
        },
        [loadNoProdutos]
    );

    const onSelectNo = useCallback(
        (id: number) => {
            if (id === selectedNoId) return;
            comProdutosSalvos(() => abrirNo(id));
        },
        [abrirNo, comProdutosSalvos, selectedNoId]
    );

    const voltarParaArvore = () => {
        comProdutosSalvos(() => {
            setSelectedNoId(null);
            setNoProdutos([]);
            setSelectedProdutoIds(new Set());
            setOriginalIds(new Set());
        });
    };

    /* -------- menus (nós) -------- */

    const criarNoRaiz = async (nome: string) => {
        try {
            const r = await apiPOST({ action: "no_criar", parent_id: null, nome: nome.trim(), ordem: 0, ativo: 1 });
            await loadInit();
            if (r?.id) {
                abrirNo(toInt(r.id));
                setExpanded((prev) => new Set(prev).add(toInt(r.id)));
            }
            mostrar({ ok: true, text: "Menu criado." });
            return true;
        } catch (e: any) {
            mostrar({ ok: false, text: e?.message || "Erro ao criar." });
            return false;
        }
    };

    const criarNoFilho = async (nome: string) => {
        if (!selectedNoId) return false;
        const pai = selectedNoId;
        try {
            const r = await apiPOST({ action: "no_criar", parent_id: pai, nome: nome.trim(), ordem: 0, ativo: 1 });
            await loadInit();
            if (r?.id) {
                abrirNo(toInt(r.id));
                setExpanded((prev) => {
                    const next = new Set(prev);
                    next.add(pai);
                    next.add(toInt(r.id));
                    return next;
                });
            }
            mostrar({ ok: true, text: "Submenu criado." });
            return true;
        } catch (e: any) {
            mostrar({ ok: false, text: e?.message || "Erro ao criar." });
            return false;
        }
    };

    const renomearNo = async (nome: string) => {
        if (!selectedNoId) return false;
        try {
            await apiPOST({ action: "no_atualizar", id: selectedNoId, nome: nome.trim() });
            await loadInit();
            mostrar({ ok: true, text: "Menu renomeado." });
            return true;
        } catch (e: any) {
            mostrar({ ok: false, text: e?.message || "Erro ao renomear." });
            return false;
        }
    };

    const excluirNo = async () => {
        if (!selectedNoId) return;
        try {
            setExcluindo(true);
            await apiPOST({ action: "no_excluir", id: selectedNoId });
            setSelectedNoId(null);
            setNoProdutos([]);
            setSelectedProdutoIds(new Set());
            setOriginalIds(new Set());
            setConfirmarExcluir(false);
            await loadInit();
            mostrar({ ok: true, text: "Menu excluído." });
        } catch (e: any) {
            setConfirmarExcluir(false);
            mostrar({ ok: false, text: e?.message || "Erro ao excluir." });
        } finally {
            setExcluindo(false);
        }
    };

    /* -------- produtos -------- */

    const buscarEstoque = useCallback(async () => {
        if (!selectedNoId) return;
        setEstoqueLoading(true);
        try {
            const res = await apiGET({
                estoque_buscar: 1,
                q: q.trim(),
                limit: 80,
                deposito_id: fDeposito > 0 ? fDeposito : undefined,
                categoria_id: fCategoria > 0 ? fCategoria : undefined,
                fabricante_id: fFabricante > 0 ? fFabricante : undefined,
                classificacao_id: fClassificacao > 0 ? fClassificacao : undefined,
            });
            if (!res) return;
            const rows: Produto[] = Array.isArray(res.rows) ? res.rows : [];
            setEstoqueRows(rows);
            lembrar(rows);
            setBuscou(true);
        } catch (e: any) {
            setEstoqueRows([]);
            mostrar({ ok: false, text: e?.message || "Falha ao buscar estoque." });
        } finally {
            setEstoqueLoading(false);
        }
    }, [selectedNoId, q, fDeposito, fCategoria, fFabricante, fClassificacao, lembrar, mostrar]);

    // Ao trocar um filtro depois de já ter buscado, refaz a busca sozinho.
    const filtrosChave = `${fDeposito}|${fCategoria}|${fFabricante}|${fClassificacao}`;
    const ultimaChaveFiltros = useRef(filtrosChave);
    useEffect(() => {
        if (ultimaChaveFiltros.current === filtrosChave) return;
        ultimaChaveFiltros.current = filtrosChave;
        if (buscou) void buscarEstoque();
    }, [filtrosChave, buscou, buscarEstoque]);

    const toggleProduto = (pid: number) => {
        setSelectedProdutoIds((prev) => {
            const next = new Set(prev);
            if (next.has(pid)) next.delete(pid);
            else next.add(pid);
            return next;
        });
    };

    const descartarProdutos = () => setSelectedProdutoIds(new Set(originalIds));

    const salvarProdutosNo = async () => {
        if (!selectedNoId) return;
        try {
            setSalvandoProdutos(true);
            await apiPOST({
                action: "no_produtos_set",
                no_id: selectedNoId,
                produto_ids: Array.from(selectedProdutoIds),
            });
            mostrar({ ok: true, text: "Produtos do menu salvos." });
            await loadNoProdutos(selectedNoId);
        } catch (e: any) {
            mostrar({ ok: false, text: e?.message || "Erro ao salvar produtos." });
        } finally {
            setSalvandoProdutos(false);
        }
    };

    const clearFilters = () => {
        setFDeposito(0);
        setFCategoria(0);
        setFFabricante(0);
        setFClassificacao(0);
    };

    /* -------- nomes e caminhos dos menus -------- */

    const porId = useMemo(() => {
        const m = new Map<number, No>();
        nodes.forEach((n) => m.set(toInt(n.id), n));
        return m;
    }, [nodes]);

    const caminho = useCallback(
        (id: number | null | undefined): No[] => {
            const out: No[] = [];
            let atual = id != null ? porId.get(toInt(id)) : undefined;
            const vistos = new Set<number>();
            while (atual && !vistos.has(atual.id)) {
                vistos.add(atual.id);
                out.unshift(atual);
                atual = atual.parent_id != null ? porId.get(toInt(atual.parent_id)) : undefined;
            }
            return out;
        },
        [porId]
    );

    const rotuloCaminho = useCallback((id: number | null | undefined) => caminho(id).map((n) => n.nome).join(" › "), [caminho]);

    const selectedNode = selectedNoId ? porId.get(selectedNoId) : undefined;
    const selectedNodeName = String(selectedNode?.nome ?? "");

    const descendentes = useMemo(() => {
        if (!selectedNoId) return 0;
        let n = 0;
        const fila = [selectedNoId];
        while (fila.length) {
            const pai = fila.shift()!;
            nodes.forEach((x) => {
                if (x.parent_id != null && toInt(x.parent_id) === pai) {
                    n++;
                    fila.push(toInt(x.id));
                }
            });
        }
        return n;
    }, [nodes, selectedNoId]);

    // Opções de menu para o fluxo: em ordem de árvore, com o caminho completo.
    const opcoesMenu = useMemo(() => {
        const out: { id: number; rotulo: string }[] = [];
        const rec = (arr: NoArvore[]) =>
            arr.forEach((n) => {
                out.push({ id: n.id, rotulo: rotuloCaminho(n.id) });
                rec(n.children || []);
            });
        rec(tree);
        return out;
    }, [tree, rotuloCaminho]);

    // Filtro da árvore: o item que bate e todos os seus "pais" ficam visíveis.
    const filtroArvore = useMemo(() => {
        const t = buscaArvore.trim().toLocaleLowerCase("pt-BR");
        if (!t) return null;
        const vis = new Set<number>();
        nodes.forEach((n) => {
            if (String(n.nome).toLocaleLowerCase("pt-BR").includes(t)) caminho(n.id).forEach((c) => vis.add(c.id));
        });
        return vis;
    }, [buscaArvore, nodes, caminho]);

    // Lista "Neste menu": selecionados agora, com os dados conhecidos.
    const produtosDoMenu = useMemo(() => {
        const arr = Array.from(selectedProdutoIds).map((id) => conhecidos.get(id) ?? ({ id, nome: `Produto #${id}` } as Produto));
        return arr.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    }, [selectedProdutoIds, conhecidos]);

    /* -------- fluxo -------- */

    const loadFluxoSteps = useCallback(
        async (nome: string) => {
            if (!nome) {
                setFluxoSteps([]);
                setFluxoOriginal(chavePassos([]));
                return;
            }
            setFluxoLoading(true);
            try {
                const res = await apiGET({ fluxo_steps: 1, fluxo_nome: nome });
                if (!res) return;
                const rows: FluxoStep[] = Array.isArray(res.rows)
                    ? res.rows.map((x: any) => ({
                        id: toInt(x.id),
                        fluxo_nome: String(x.fluxo_nome ?? nome),
                        ordem: toInt(x.ordem, 0),
                        no_id: x.no_id === null || x.no_id === undefined ? null : toInt(x.no_id, 0),
                        titulo: x.titulo ?? null,
                        required: asBool(x.required) ? 1 : 0,
                        max_select: Math.max(1, toInt(x.max_select, 1)),
                        ativo: asBool(x.ativo) ? 1 : 0,
                    }))
                    : [];
                rows.sort((a, b) => toInt(a.ordem) - toInt(b.ordem));
                setFluxoSteps(rows);
                setFluxoOriginal(chavePassos(rows));
            } catch (e: any) {
                setFluxoSteps([]);
                setFluxoOriginal(chavePassos([]));
                mostrar({ ok: false, text: e?.message || "Falha ao carregar os passos do fluxo." });
            } finally {
                setFluxoLoading(false);
            }
        },
        [mostrar]
    );

    useEffect(() => {
        if (fluxoNome) loadFluxoSteps(fluxoNome);
        else {
            setFluxoSteps([]);
            setFluxoOriginal(chavePassos([]));
        }
    }, [fluxoNome, loadFluxoSteps]);

    const trocarFluxo = (nome: string) => {
        if (nome === fluxoNome) return;
        if (fluxoAlterado) {
            setPendente({ texto: `O fluxo "${fluxoNome}" tem alterações que ainda não foram salvas.`, acao: () => setFluxoNome(nome) });
            return;
        }
        setFluxoNome(nome);
    };

    const criarFluxo = async (nome: string) => {
        const clean = nome.trim();
        if (!clean) return false;

        // cria “virtualmente” (não tem tabela de fluxos, então criamos o 1º passo)
        try {
            await apiPOST({
                action: "fluxo_step_criar",
                fluxo_nome: clean,
                ordem: 1,
                no_id: null,
                titulo: "Passo 1",
                required: 1,
                max_select: 1,
                ativo: 1,
            });
            await loadInit();
            setFluxoNome(clean);
            mostrar({ ok: true, text: `Fluxo "${clean}" criado com o Passo 1.` });
            return true;
        } catch (e: any) {
            mostrar({ ok: false, text: e?.message || "Erro ao criar fluxo." });
            return false;
        }
    };

    const addStep = () => {
        if (!fluxoNome) return;
        const n = fluxoSteps.length + 1;
        setFluxoSteps((prev) => [
            ...prev,
            {
                fluxo_nome: fluxoNome,
                ordem: n,
                no_id: null,
                titulo: `Passo ${n}`,
                required: 1,
                max_select: 1,
                ativo: 1,
            },
        ]);
    };

    const removeStepLocal = (idx: number) => {
        setFluxoSteps((prev) => prev.filter((_, i) => i !== idx));
    };

    // A ordem da lista é a ordem do fluxo (as setas mudam a posição e o salvar grava 1..N nessa ordem).
    const moveStep = (idx: number, dir: -1 | 1) => {
        setFluxoSteps((prev) => {
            const arr = [...prev];
            const j = idx + dir;
            if (j < 0 || j >= arr.length) return prev;
            const tmp = arr[idx];
            arr[idx] = arr[j];
            arr[j] = tmp;
            return arr;
        });
    };

    const updateStep = (idx: number, patch: Partial<FluxoStep>) => {
        setFluxoSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    };

    const descartarFluxo = () => void loadFluxoSteps(fluxoNome);

    const saveFluxo = async () => {
        if (!fluxoNome) return;

        // ordem = posição na lista (1..N, sem buracos)
        const finalSteps = fluxoSteps.map((s, i) => ({
            ordem: i + 1,
            no_id: s.no_id ?? null,
            titulo: (s.titulo ?? "").trim() || null,
            required: asBool(s.required) ? 1 : 0,
            max_select: Math.max(1, toInt(s.max_select, 1)),
            ativo: asBool(s.ativo) ? 1 : 0,
        }));

        try {
            setFluxoSalvando(true);
            await apiPOST({
                action: "fluxo_steps_set",
                fluxo_nome: fluxoNome,
                steps: finalSteps,
            });
            await loadInit();
            await loadFluxoSteps(fluxoNome);
            mostrar({ ok: true, text: "Fluxo salvo." });
        } catch (e: any) {
            mostrar({ ok: false, text: e?.message || "Erro ao salvar fluxo." });
        } finally {
            setFluxoSalvando(false);
        }
    };

    const passosSemMenu = fluxoSteps.filter((s) => !s.no_id).length;

    /* ================== UI ================== */

    const barraAlteracoes = (texto: string, onDescartar: () => void, onSalvar: () => void, salvando: boolean, botao: string) => (
        <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 mt-4 lg:bottom-4">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#F2CB3F] bg-[#FCF3CC] px-4 py-3 shadow-lg dark:border-[#F2CB3F]/60 dark:bg-[#2E2A18]">
                <span className="min-w-0 basis-full text-sm font-extrabold text-[#313C55] dark:text-[#F2CB3F] sm:basis-0 sm:flex-1">{texto}</span>
                <button type="button" onClick={onDescartar} disabled={salvando} className={`${BTN_SEC} min-h-10 flex-1 sm:flex-none`}>
                    Descartar
                </button>
                <button type="button" onClick={onSalvar} disabled={salvando} className={`${BTN_PRI} min-h-10 flex-1 sm:flex-none`}>
                    <IconCheck size={18} stroke={2.2} />
                    {salvando ? "Salvando…" : botao}
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-[calc(100dvh-1px)] bg-[#F6F8FB] text-[#313C55] dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 lg:px-10 lg:pb-12 lg:pt-8">
                {/* TOPO */}
                <header className="mb-4 flex flex-wrap items-start justify-between gap-3 lg:mb-5">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-extrabold leading-tight lg:text-[28px]">Configuração do Catálogo</h1>
                        <p className={`mt-1 text-sm ${TXT_SEC}`}>Monte os menus do catálogo, escolha os produtos de cada um e defina a ordem do “Próximo passo”.</p>
                    </div>
                    <button type="button" onClick={() => void loadInit()} disabled={loading} className={BTN_ICONE} title="Recarregar" aria-label="Recarregar">
                        <IconRefresh size={20} stroke={1.8} className={loading ? "animate-spin" : ""} />
                    </button>
                </header>

                {/* ABAS */}
                <div className="mb-4 inline-flex w-full rounded-2xl border border-[#E3E8F0] bg-white p-1 dark:border-white/[0.12] dark:bg-[#232B3F] sm:w-auto" role="tablist">
                    {(
                        [
                            { id: "menus", nome: "Menus e produtos", curto: "Menus", icone: <IconLayoutList size={18} stroke={1.8} /> },
                            { id: "fluxo", nome: "Fluxo (Próximo passo)", curto: "Fluxo", icone: <IconListNumbers size={18} stroke={1.8} /> },
                        ] as const
                    ).map((t) => {
                        const on = aba === t.id;
                        const alterado = t.id === "menus" ? produtosAlterados : fluxoAlterado;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                aria-selected={on}
                                onClick={() => setAba(t.id)}
                                className={[
                                    "relative inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-bold transition sm:flex-none",
                                    on ? "bg-[#313C55] text-white dark:bg-[#3D6A99]" : `${TXT_SEC} hover:text-[#313C55] dark:hover:text-white`,
                                ].join(" ")}
                            >
                                {t.icone}
                                <span className="sm:hidden">{t.curto}</span>
                                <span className="hidden sm:inline">{t.nome}</span>
                                {alterado ? <span className="size-2 rounded-full bg-[#F2CB3F]" title="Alterações não salvas" /> : null}
                            </button>
                        );
                    })}
                </div>

                {/* AVISO */}
                {msg ? (
                    <div
                        role={msg.ok ? "status" : "alert"}
                        className={[
                            "mb-4 flex items-start gap-2 rounded-[14px] border px-4 py-3 text-sm font-bold",
                            msg.ok
                                ? "border-[#B3CE52] bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/[0.18] dark:text-white"
                                : "border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]",
                        ].join(" ")}
                    >
                        <span className="min-w-0 flex-1">{msg.text}</span>
                        <button type="button" onClick={() => setMsg(null)} className="-my-1 grid size-8 shrink-0 place-items-center rounded-lg hover:bg-black/5" aria-label="Fechar aviso">
                            <IconX size={16} stroke={2} />
                        </button>
                    </div>
                ) : null}

                {/* ===================== ABA: MENUS E PRODUTOS ===================== */}
                {aba === "menus" ? (
                    <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-5">
                        {/* ÁRVORE */}
                        <aside className={`${CARD} ${selectedNoId ? "hidden lg:block" : ""} lg:sticky lg:top-4`}>
                            <div className="flex items-center gap-2 border-b border-[#E3E8F0] px-4 py-3 dark:border-white/[0.12]">
                                <h2 className={`${TITULO_BLOCO} flex-1`}>Menus</h2>
                                <button type="button" onClick={expandAll} className={BTN_ICONE_SUAVE} title="Expandir tudo" aria-label="Expandir tudo">
                                    <IconChevronDown size={18} stroke={1.8} />
                                </button>
                                <button type="button" onClick={collapseAll} className={BTN_ICONE_SUAVE} title="Recolher tudo" aria-label="Recolher tudo">
                                    <IconChevronRight size={18} stroke={1.8} />
                                </button>
                                <button type="button" onClick={() => setJanelaNome("raiz")} className={`${BTN_PRI} min-h-10 px-3`}>
                                    <IconPlus size={17} stroke={2.2} />
                                    Novo menu
                                </button>
                            </div>

                            <div className="p-3">
                                {nodes.length > 8 ? (
                                    <span className="mb-2 flex h-11 items-center gap-2 rounded-xl bg-[#F1F4F8] px-3 text-[#5B6478] focus-within:ring-2 focus-within:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                        <IconSearch size={18} stroke={1.8} className="shrink-0" />
                                        <input
                                            value={buscaArvore}
                                            onChange={(e) => setBuscaArvore(e.target.value)}
                                            placeholder="Procurar menu"
                                            aria-label="Procurar menu"
                                            className="min-w-0 flex-1 bg-transparent text-[16px] text-[#313C55] outline-none dark:text-white"
                                        />
                                    </span>
                                ) : null}

                                {loading && nodes.length === 0 ? (
                                    <p className={`p-4 text-center text-sm font-bold ${TXT_SEC}`}>Carregando…</p>
                                ) : tree.length === 0 ? (
                                    <div className="px-4 py-8 text-center">
                                        <p className="font-extrabold">Nenhum menu ainda</p>
                                        <p className={`mt-1 text-sm ${TXT_SEC}`}>Comece criando o primeiro menu do catálogo.</p>
                                    </div>
                                ) : filtroArvore && filtroArvore.size === 0 ? (
                                    <p className={`p-4 text-center text-sm ${TXT_SEC}`}>Nenhum menu com esse nome.</p>
                                ) : (
                                    <div className="max-h-[calc(100dvh-280px)] overflow-y-auto lg:max-h-[calc(100vh-300px)]">
                                        {tree.map((n) => (
                                            <NodeItem
                                                key={n.id}
                                                node={n}
                                                depth={0}
                                                selectedId={selectedNoId}
                                                onSelect={onSelectNo}
                                                expanded={expanded}
                                                toggleExpand={toggleExpand}
                                                filtro={filtroArvore}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </aside>

                        {/* MENU SELECIONADO */}
                        <section className={`min-w-0 ${selectedNoId ? "" : "hidden lg:block"}`}>
                            {!selectedNoId || !selectedNode ? (
                                <div className={`${CARD} px-6 py-14 text-center`}>
                                    <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white">
                                        <IconFolder size={28} stroke={1.8} />
                                    </span>
                                    <p className="font-extrabold">Escolha um menu na lista</p>
                                    <p className={`mx-auto mt-1 max-w-md text-sm ${TXT_SEC}`}>Ao escolher, aparecem os produtos dele e as opções de criar submenu, renomear e excluir.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Cabeçalho do menu */}
                                    <div className={`${CARD} mb-4 p-4 lg:px-5`}>
                                        <button type="button" onClick={voltarParaArvore} className={`mb-2 inline-flex min-h-10 items-center gap-1 rounded-lg pr-2 text-sm font-bold text-[#3D6A99] dark:text-[#9DBBE0] lg:hidden`}>
                                            <IconChevronLeft size={18} stroke={2} />
                                            Menus
                                        </button>

                                        {caminho(selectedNoId).length > 1 ? (
                                            <p className={`mb-0.5 truncate text-[12.5px] font-bold ${TXT_SEC}`}>
                                                {caminho(selectedNoId)
                                                    .slice(0, -1)
                                                    .map((n) => n.nome)
                                                    .join(" › ")}{" "}
                                                ›
                                            </p>
                                        ) : null}

                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                            <h2 className="min-w-0 flex-1 break-words text-[22px] font-extrabold leading-tight">
                                                {selectedNodeName}
                                                {!asBool(selectedNode.ativo) ? (
                                                    <span className="ml-2 align-middle">
                                                        <SeloInativo />
                                                    </span>
                                                ) : null}
                                            </h2>
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" onClick={() => setJanelaNome("filho")} className={BTN_SEC}>
                                                    <IconFolderPlus size={18} stroke={1.8} />
                                                    Submenu
                                                </button>
                                                <button type="button" onClick={() => setJanelaNome("renomear")} className={BTN_SEC}>
                                                    <IconPencil size={18} stroke={1.8} />
                                                    Renomear
                                                </button>
                                                <button type="button" onClick={() => setConfirmarExcluir(true)} className={BTN_PERIGO_TXT}>
                                                    <IconTrash size={18} stroke={1.8} />
                                                    Excluir
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Neste menu */}
                                    <div className={`${CARD} mb-4`}>
                                        <div className="flex items-center gap-2 border-b border-[#E3E8F0] px-4 py-3 dark:border-white/[0.12] lg:px-5">
                                            <h3 className={`${TITULO_BLOCO} flex-1`}>
                                                Neste menu <span className="text-[#313C55] dark:text-white">({selectedProdutoIds.size})</span>
                                            </h3>
                                        </div>
                                        <div className="p-3 lg:px-4">
                                            {carregandoNo ? (
                                                <p className={`p-3 text-sm font-bold ${TXT_SEC}`}>Carregando produtos…</p>
                                            ) : produtosDoMenu.length === 0 ? (
                                                <p className={`p-3 text-sm ${TXT_SEC}`}>Nenhum produto neste menu. Use a busca abaixo para adicionar.</p>
                                            ) : (
                                                <ul className="flex flex-wrap gap-2">
                                                    {produtosDoMenu.map((p) => {
                                                        const pid = toInt(p.id);
                                                        const novo = !originalIds.has(pid);
                                                        return (
                                                            <li
                                                                key={pid}
                                                                className={[
                                                                    "inline-flex max-w-full items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-[13px] font-bold",
                                                                    novo
                                                                        ? "border-[#B3CE52] bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/15 dark:text-white"
                                                                        : "border-[#A9BED6] bg-[#E9EFF6] text-[#313C55] dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-white",
                                                                ].join(" ")}
                                                                title={novo ? "Adicionado agora (falta salvar)" : p.nome}
                                                            >
                                                                <span className="truncate">{p.nome}</span>
                                                                {novo ? <span className="shrink-0 text-[10.5px] font-extrabold text-[#4A6310] dark:text-[#CFE38A]">novo</span> : null}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleProduto(pid)}
                                                                    className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                                                                    aria-label={`Tirar ${p.nome} do menu`}
                                                                    title="Tirar do menu"
                                                                >
                                                                    <IconX size={14} stroke={2} />
                                                                </button>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                            {noProdutos.some((p) => !selectedProdutoIds.has(toInt(p.id))) ? (
                                                <p className={`mt-2 px-1 text-[12.5px] ${TXT_SEC}`}>
                                                    Saindo do menu ao salvar:{" "}
                                                    {noProdutos
                                                        .filter((p) => !selectedProdutoIds.has(toInt(p.id)))
                                                        .map((p) => p.nome)
                                                        .join(", ")}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>

                                    {/* Adicionar do estoque */}
                                    <div className={CARD}>
                                        <div className="border-b border-[#E3E8F0] px-4 py-3 dark:border-white/[0.12] lg:px-5">
                                            <h3 className={TITULO_BLOCO}>Adicionar do estoque</h3>
                                        </div>

                                        <div className="p-3 lg:px-4">
                                            <div className="flex gap-2">
                                                <span className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-transparent bg-[#F1F4F8] px-3 text-[#5B6478] focus-within:border-[#3D6A99] focus-within:ring-2 focus-within:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                                    <IconSearch size={20} stroke={1.8} className="shrink-0" />
                                                    <input
                                                        type="search"
                                                        placeholder="Nome, código de barras, categoria…"
                                                        value={q}
                                                        onChange={(e) => setQ(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") void buscarEstoque();
                                                        }}
                                                        aria-label="Buscar produto no estoque"
                                                        className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] dark:text-white dark:placeholder:text-[#8893AA]"
                                                    />
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setFiltrosAbertos((v) => !v)}
                                                    aria-expanded={filtrosAbertos}
                                                    className={`${BTN_SEC} relative shrink-0 px-3`}
                                                    title="Filtros"
                                                >
                                                    <IconFilter size={18} stroke={1.8} />
                                                    <span className="hidden sm:inline">Filtros</span>
                                                    {qtdFiltros ? (
                                                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#F2CB3F] px-1 text-[11px] font-extrabold text-[#313C55]">{qtdFiltros}</span>
                                                    ) : null}
                                                </button>
                                                <button type="button" onClick={() => void buscarEstoque()} disabled={estoqueLoading} className={`${BTN_PRI} shrink-0`}>
                                                    {estoqueLoading ? "Buscando…" : "Buscar"}
                                                </button>
                                            </div>

                                            {filtrosAbertos ? (
                                                <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl bg-[#F6F8FB] p-3 dark:bg-[#1C2334] sm:grid-cols-2 xl:grid-cols-4">
                                                    {(
                                                        [
                                                            { r: "Depósito", v: fDeposito, set: setFDeposito, ops: depositos, todos: "Todos" },
                                                            { r: "Categoria", v: fCategoria, set: setFCategoria, ops: categorias, todos: "Todas" },
                                                            { r: "Fabricante", v: fFabricante, set: setFFabricante, ops: fabricantes, todos: "Todos" },
                                                            { r: "Classificação", v: fClassificacao, set: setFClassificacao, ops: classificacoes, todos: "Todas" },
                                                        ] as const
                                                    ).map((f) => (
                                                        <label key={f.r} className="block">
                                                            <span className={ROTULO}>{f.r}</span>
                                                            <select value={f.v} onChange={(e) => f.set(toInt(e.target.value))} className={`${CAMPO} bg-white dark:bg-[#232B3F]`}>
                                                                <option value={0}>{f.todos}</option>
                                                                {f.ops.map((o) => (
                                                                    <option key={o.id} value={o.id}>
                                                                        {o.nome}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </label>
                                                    ))}
                                                    {qtdFiltros ? (
                                                        <div className="sm:col-span-2 xl:col-span-4">
                                                            <button type="button" onClick={clearFilters} className={`${BTN_BASE} min-h-10 px-2 text-[#3D6A99] hover:bg-[#E9EFF6] dark:text-[#9DBBE0] dark:hover:bg-[#3D6A99]/20`}>
                                                                Limpar filtros
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : null}

                                            <div className="mt-3">
                                                {!buscou ? (
                                                    <p className={`rounded-xl border border-dashed border-[#C9D1DE] px-4 py-6 text-center text-sm dark:border-white/20 ${TXT_SEC}`}>
                                                        Busque pelo nome ou código, ou só toque em <b>Buscar</b> para ver os produtos com os filtros escolhidos.
                                                    </p>
                                                ) : estoqueRows.length === 0 ? (
                                                    <p className={`px-4 py-6 text-center text-sm ${TXT_SEC}`}>Nenhum produto encontrado.</p>
                                                ) : (
                                                    <>
                                                        <p className={`mb-2 px-1 text-[12.5px] font-bold ${TXT_SEC}`}>
                                                            {estoqueRows.length === 1 ? "1 produto encontrado" : `${estoqueRows.length} produtos encontrados`}
                                                            {estoqueRows.length >= 80 ? " · refine a busca para ver outros" : ""}
                                                        </p>
                                                        <ul className="max-h-[520px] divide-y divide-[#E3E8F0] overflow-y-auto rounded-xl border border-[#E3E8F0] dark:divide-white/[0.12] dark:border-white/[0.12]">
                                                            {estoqueRows.map((p) => {
                                                                const pid = toInt(p.id);
                                                                const noMenu = selectedProdutoIds.has(pid);
                                                                const chips = [
                                                                    p.codigo_barras ? `CB ${p.codigo_barras}` : "",
                                                                    p.categoria_nome || "",
                                                                    p.deposito_nome || "",
                                                                    p.fabricante_nome || "",
                                                                    p.classificacao_nome || "",
                                                                ].filter(Boolean);
                                                                return (
                                                                    <li key={pid} className={`flex items-center gap-3 px-3 py-2.5 ${noMenu ? "bg-[#F6F8FB] dark:bg-white/[0.03]" : ""}`}>
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="break-words text-[14.5px] font-bold leading-snug">{p.nome}</p>
                                                                            {chips.length ? (
                                                                                <div className="mt-1 flex flex-wrap gap-1">
                                                                                    {chips.map((c, i) => (
                                                                                        <span key={i} className={`rounded-md bg-[#EEF2F7] px-1.5 py-0.5 text-[11.5px] font-semibold dark:bg-white/10 ${TXT_SEC}`}>
                                                                                            {c}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            ) : null}
                                                                            {p.descricao ? <p className={`mt-1 line-clamp-1 text-[12.5px] ${TXT_SEC}`}>{p.descricao}</p> : null}
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleProduto(pid)}
                                                                            className={[
                                                                                `${BTN_BASE} min-h-10 shrink-0 px-3`,
                                                                                noMenu
                                                                                    ? "bg-[#EEF5D6] text-[#4A6310] hover:bg-[#FDECEA] hover:text-[#B42318] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]"
                                                                                    : "border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white",
                                                                            ].join(" ")}
                                                                            title={noMenu ? "Tirar do menu" : "Adicionar ao menu"}
                                                                        >
                                                                            {noMenu ? <IconCheck size={16} stroke={2.4} /> : <IconPlus size={16} stroke={2.2} />}
                                                                            {noMenu ? "No menu" : "Adicionar"}
                                                                        </button>
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {produtosAlterados
                                        ? barraAlteracoes(
                                            `${qtdAlteracoesProdutos} ${qtdAlteracoesProdutos === 1 ? "alteração não salva" : "alterações não salvas"} em “${selectedNodeName}”`,
                                            descartarProdutos,
                                            () => void salvarProdutosNo(),
                                            salvandoProdutos,
                                            "Salvar produtos"
                                        )
                                        : null}
                                </>
                            )}
                        </section>
                    </div>
                ) : null}

                {/* ===================== ABA: FLUXO ===================== */}
                {aba === "fluxo" ? (
                    <div className="mx-auto max-w-4xl">
                        <div className={`${CARD} mb-4 p-4 lg:px-5`}>
                            <p className={`mb-3 text-sm ${TXT_SEC}`}>
                                O fluxo é a sequência de menus que o catálogo percorre quando a pessoa toca em <b className="text-[#313C55] dark:text-white">“Próximo passo”</b>.
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                <label className="relative block min-w-0 flex-1">
                                    <span className={ROTULO}>Fluxo</span>
                                    <select value={fluxoNome} onChange={(e) => trocarFluxo(e.target.value)} disabled={loading} className={`${CAMPO} appearance-none pr-10 font-bold`}>
                                        <option value="">— Escolha um fluxo —</option>
                                        {fluxos.map((f) => (
                                            <option key={f.fluxo_nome} value={f.fluxo_nome}>
                                                {f.fluxo_nome} ({toInt(f.total)} {toInt(f.total) === 1 ? "passo" : "passos"})
                                            </option>
                                        ))}
                                    </select>
                                    <IconChevronDown size={18} stroke={1.8} className={`pointer-events-none absolute bottom-3.5 right-3 ${TXT_SEC}`} />
                                </label>
                                <button type="button" onClick={() => setJanelaNome("fluxo")} className={BTN_SEC}>
                                    <IconPlus size={18} stroke={2.2} />
                                    Novo fluxo
                                </button>
                            </div>
                        </div>

                        {!fluxoNome ? (
                            <div className={`${CARD} px-6 py-12 text-center`}>
                                <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white">
                                    <IconListNumbers size={28} stroke={1.8} />
                                </span>
                                <p className="font-extrabold">Escolha um fluxo ou crie um novo</p>
                            </div>
                        ) : fluxoLoading ? (
                            <div className={`${CARD} p-6 text-center text-sm font-bold ${TXT_SEC}`}>Carregando passos…</div>
                        ) : (
                            <>
                                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                                    <p className={`text-[13px] font-bold ${TXT_SEC}`}>
                                        {fluxoSteps.length === 1 ? "1 passo" : `${fluxoSteps.length} passos`}
                                        {passosSemMenu ? <span className="text-[#B42318] dark:text-[#FF9C92]"> · {passosSemMenu} sem menu</span> : null}
                                    </p>
                                </div>

                                {fluxoSteps.length === 0 ? (
                                    <div className={`${CARD} px-6 py-8 text-center text-sm ${TXT_SEC}`}>Nenhum passo. Toque em “Adicionar passo”.</div>
                                ) : (
                                    <ol className="space-y-3">
                                        {fluxoSteps.map((s, idx) => {
                                            const ativo = asBool(s.ativo);
                                            const semMenu = !s.no_id;
                                            return (
                                                <li key={`${s.id ?? "novo"}-${idx}`} className={`${CARD} p-3 lg:p-4 ${ativo ? "" : "opacity-70"}`}>
                                                    <div className="flex items-start gap-3">
                                                        <span className="mt-1.5 grid size-9 shrink-0 place-items-center rounded-full bg-[#313C55] text-sm font-extrabold text-white dark:bg-[#3D6A99]">
                                                            {idx + 1}
                                                        </span>

                                                        <div className="min-w-0 flex-1 space-y-3">
                                                            <div className="grid gap-3 md:grid-cols-2">
                                                                <label className="block">
                                                                    <span className={ROTULO}>Título do passo</span>
                                                                    <input
                                                                        value={String(s.titulo ?? "")}
                                                                        onChange={(e) => updateStep(idx, { titulo: e.target.value })}
                                                                        placeholder={`Passo ${idx + 1}`}
                                                                        className={CAMPO}
                                                                    />
                                                                </label>
                                                                <label className="relative block">
                                                                    <span className={ROTULO}>Menu mostrado</span>
                                                                    <select
                                                                        value={s.no_id ?? ""}
                                                                        onChange={(e) => updateStep(idx, { no_id: e.target.value ? toInt(e.target.value) : null })}
                                                                        className={`${CAMPO} appearance-none truncate pr-10 ${semMenu ? "border-[#B42318] dark:border-[#FF9C92]" : ""}`}
                                                                    >
                                                                        <option value="">— Escolha o menu —</option>
                                                                        {s.no_id && !porId.has(toInt(s.no_id)) ? <option value={s.no_id}>Menu #{s.no_id} (não encontrado)</option> : null}
                                                                        {opcoesMenu.map((o) => (
                                                                            <option key={o.id} value={o.id}>
                                                                                {o.rotulo}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                    <IconChevronDown size={18} stroke={1.8} className={`pointer-events-none absolute bottom-3.5 right-3 ${TXT_SEC}`} />
                                                                </label>
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`text-[12.5px] font-bold ${TXT_SEC}`}>Obrigatório</span>
                                                                    <Alternar valor={asBool(s.required)} onChange={(v) => updateStep(idx, { required: v ? 1 : 0 })} rotuloSim="Sim" rotuloNao="Não" />
                                                                </div>
                                                                <label className="flex items-center gap-2">
                                                                    <span className={`text-[12.5px] font-bold ${TXT_SEC}`}>Escolher até</span>
                                                                    <input
                                                                        type="number"
                                                                        min={1}
                                                                        inputMode="numeric"
                                                                        value={toInt(s.max_select, 1)}
                                                                        onChange={(e) => updateStep(idx, { max_select: Math.max(1, toInt(e.target.value, 1)) })}
                                                                        className={`${CAMPO} !h-10 !w-[72px] shrink-0 px-2 text-center font-bold`}
                                                                    />
                                                                    <span className={`text-[12.5px] font-bold ${TXT_SEC}`}>{toInt(s.max_select, 1) === 1 ? "item" : "itens"}</span>
                                                                </label>
                                                                <Alternar valor={ativo} onChange={(v) => updateStep(idx, { ativo: v ? 1 : 0 })} rotuloSim="Ativo" rotuloNao="Inativo" />
                                                            </div>
                                                        </div>

                                                        <div className="flex shrink-0 flex-col items-center gap-0.5">
                                                            <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0} className={BTN_ICONE_SUAVE} title="Subir" aria-label="Subir passo">
                                                                <IconArrowUp size={18} stroke={1.8} />
                                                            </button>
                                                            <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx === fluxoSteps.length - 1} className={BTN_ICONE_SUAVE} title="Descer" aria-label="Descer passo">
                                                                <IconArrowDown size={18} stroke={1.8} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeStepLocal(idx)}
                                                                className="inline-grid size-10 place-items-center rounded-lg text-[#B42318] hover:bg-[#FDECEA] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15"
                                                                title="Remover passo"
                                                                aria-label="Remover passo"
                                                            >
                                                                <IconTrash size={18} stroke={1.8} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                )}

                                <button type="button" onClick={addStep} className={`${BTN_SEC} mt-3 w-full border-dashed`}>
                                    <IconPlus size={18} stroke={2.2} />
                                    Adicionar passo
                                </button>

                                {fluxoAlterado
                                    ? barraAlteracoes(`O fluxo “${fluxoNome}” tem alterações não salvas`, descartarFluxo, () => void saveFluxo(), fluxoSalvando, "Salvar fluxo")
                                    : null}
                            </>
                        )}
                    </div>
                ) : null}
            </div>

            {/* ===================== JANELAS ===================== */}

            {janelaNome === "raiz" ? (
                <JanelaNome
                    titulo="Novo menu"
                    subtitulo="Menu principal do catálogo (no primeiro nível)."
                    rotulo="Nome do menu"
                    inicial=""
                    placeholder="Ex.: Urnas"
                    botao="Criar menu"
                    onCancelar={() => setJanelaNome(null)}
                    onSalvar={async (nome) => {
                        const ok = await criarNoRaiz(nome);
                        if (ok) setJanelaNome(null);
                        return ok;
                    }}
                />
            ) : null}

            {janelaNome === "filho" && selectedNoId ? (
                <JanelaNome
                    titulo="Novo submenu"
                    subtitulo={
                        <>
                            Dentro de <b className="text-[#313C55] dark:text-white">{rotuloCaminho(selectedNoId)}</b>.
                        </>
                    }
                    rotulo="Nome do submenu"
                    inicial=""
                    placeholder="Ex.: Luxo"
                    botao="Criar submenu"
                    onCancelar={() => setJanelaNome(null)}
                    onSalvar={async (nome) => {
                        const ok = await criarNoFilho(nome);
                        if (ok) setJanelaNome(null);
                        return ok;
                    }}
                />
            ) : null}

            {janelaNome === "renomear" && selectedNoId ? (
                <JanelaNome
                    titulo="Renomear menu"
                    rotulo="Novo nome"
                    inicial={selectedNodeName}
                    botao="Salvar nome"
                    onCancelar={() => setJanelaNome(null)}
                    onSalvar={async (nome) => {
                        const ok = await renomearNo(nome);
                        if (ok) setJanelaNome(null);
                        return ok;
                    }}
                />
            ) : null}

            {janelaNome === "fluxo" ? (
                <JanelaNome
                    titulo="Novo fluxo"
                    subtitulo="O fluxo já nasce com o Passo 1; depois é só escolher os menus de cada passo."
                    rotulo="Nome do fluxo"
                    inicial=""
                    placeholder="Ex.: FuneralCompleto"
                    botao="Criar fluxo"
                    onCancelar={() => setJanelaNome(null)}
                    onSalvar={async (nome) => {
                        const ok = await criarFluxo(nome);
                        if (ok) setJanelaNome(null);
                        return ok;
                    }}
                />
            ) : null}

            {confirmarExcluir && selectedNoId ? (
                <Janela
                    titulo="Excluir menu?"
                    subtitulo="Esta ação não poderá ser desfeita."
                    onClose={() => setConfirmarExcluir(false)}
                    podeFechar={!excluindo}
                    icone={
                        <span className="grid size-10 place-items-center rounded-xl bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                            <IconTrash size={20} stroke={1.8} />
                        </span>
                    }
                    rodape={
                        <>
                            <button type="button" onClick={() => setConfirmarExcluir(false)} disabled={excluindo} className={BTN_SEC}>
                                Voltar
                            </button>
                            <button type="button" onClick={() => void excluirNo()} disabled={excluindo} className={BTN_PERIGO}>
                                {excluindo ? "Excluindo…" : "Excluir"}
                            </button>
                        </>
                    }
                >
                    <div className="rounded-[14px] border border-[#E3E8F0] bg-[#F6F8FB] p-3 text-sm dark:border-white/[0.12] dark:bg-[#1C2334]">
                        <p className="font-extrabold">{rotuloCaminho(selectedNoId)}</p>
                        <ul className={`mt-1 list-disc pl-5 ${TXT_SEC}`}>
                            <li>{originalIds.size === 1 ? "1 produto vinculado" : `${originalIds.size} produtos vinculados`}</li>
                            {descendentes ? (
                                <li className="font-bold text-[#B42318] dark:text-[#FF9C92]">
                                    {descendentes === 1 ? "1 submenu também pode ser excluído" : `${descendentes} submenus também podem ser excluídos`}
                                </li>
                            ) : null}
                        </ul>
                    </div>
                </Janela>
            ) : null}

            {pendente ? (
                <Janela
                    titulo="Descartar alterações?"
                    subtitulo={pendente.texto}
                    onClose={() => setPendente(null)}
                    rodape={
                        <>
                            <button type="button" onClick={() => setPendente(null)} className={BTN_SEC}>
                                Continuar editando
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const acao = pendente.acao;
                                    setPendente(null);
                                    acao();
                                }}
                                className={BTN_PERIGO}
                            >
                                Descartar
                            </button>
                        </>
                    }
                />
            ) : null}
        </div>
    );
}
