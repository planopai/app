"use client";

/**
 * /permissoes — grupos e permissões por usuário.
 *
 * 27/10/2026: grupos de usuários (grupos.php). Cada usuário tem UM grupo; as páginas
 * marcadas no usuário são extras e só acrescentam. Só quem tem Gestão altera.
 *
 * 29/10/2026 (repaginação, mesmas chamadas ao grupos.php e ao pai_api.php):
 * - páginas organizadas pelos módulos do menu (components/shell/modulos.tsx), com busca;
 * - contadores contam só páginas que existem (antes: "65 de 61"); páginas antigas gravadas
 *   no grupo/usuário aparecem num aviso, com opção de limpar;
 * - troca de grupo só dentro do usuário e com confirmação (mostra o que ganha e o que perde);
 * - barra de "alterações não salvas" e aviso antes de descartar;
 * - páginas sensíveis destacadas; membros do grupo abrem o usuário.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    IconAlertTriangle,
    IconArrowLeft,
    IconCheck,
    IconChevronDown,
    IconPlus,
    IconSearch,
    IconShieldLock,
    IconUsersGroup,
    IconX,
} from "@tabler/icons-react";

import { MODULOS } from "@/components/shell/modulos";

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

type Usuario = {
    id: number;
    nome: string;
    usuario: string;
};

type Pagina = {
    key: string;
    label: string;
};

type DepartamentoIA = {
    id: number;
    nome: string;
    slug?: string | null;
    descricao?: string | null;
    ordem?: number;
    ativo?: number;
};

type FerramentaIA = {
    key: string;
    label: string;
    grupo?: string | null;
    tipo?: "consulta" | "acao" | string;
};

type Aba = "paginas" | "conhecimento" | "ferramentas";

type Grupo = {
    id: number;
    nome: string;
    slug: string;
    descricao: string;
    ativo: boolean;
    paginas: string[];
    membros: number[];
};

type UsuarioGrupo = {
    id: number;
    nome: string;
    usuario: string;
    cargo: string;
    grupo_id: number | null;
    extras: string[];
};

type Modo = "usuarios" | "grupos";

type FiltroGrupo = "todos" | "sem" | number;

/** Estado de uma página na lista: do grupo (travada), marcada ou livre. */
type EstadoPagina = "grupo" | "marcada" | "livre";

const API_URL =
    "https://api.planoassistencialintegrado.com.br/pai_api.php";
const GRUPOS_URL =
    "https://api.planoassistencialintegrado.com.br/grupos.php";

/* -------------------------------------------------------------------------- */
/* Organização das páginas                                                     */
/* -------------------------------------------------------------------------- */

/** Páginas que dão poder sobre acessos, pessoas ou dinheiro. */
const PAGINAS_SENSIVEIS = new Set<string>([
    "permissoes",
    "gestao",
    "usuarios",
    "auditoria",
    "financeiro",
    "os-financeiro",
    "balanco",
    "telemetria",
    "messenger-config",
]);

type Secao = { id: string; titulo: string };

const SECAO_OUTRAS: Secao = { id: "outras", titulo: "Outras telas" };

/**
 * Módulo de cada chave de página, pelo mesmo cadastro do menu.
 * Preferência: entrada do módulo > tela com uma só chave > primeira chave > qualquer chave.
 */
const SECAO_DA_PAGINA: Map<string, Secao> = (() => {
    const mapa = new Map<string, Secao>();
    const por = (k: string | undefined, s: Secao) => {
        if (k && k !== "*" && !mapa.has(k)) mapa.set(k, s);
    };
    for (const m of MODULOS) por(m.hub.slug, { id: m.id, titulo: m.titulo });
    for (const m of MODULOS) {
        for (const it of m.itens) {
            if (it.slugs.length === 1) por(it.slugs[0], { id: m.id, titulo: m.titulo });
        }
    }
    for (const m of MODULOS) {
        for (const it of m.itens) por(it.slugs[0], { id: m.id, titulo: m.titulo });
    }
    for (const m of MODULOS) {
        for (const it of m.itens) it.slugs.forEach((s) => por(s, { id: m.id, titulo: m.titulo }));
    }
    return mapa;
})();

const ORDEM_SECOES: Secao[] = [
    ...MODULOS.map((m) => ({ id: m.id, titulo: m.titulo })),
    SECAO_OUTRAS,
];

const ENTRADAS_DE_MODULO = new Set<string>(
    MODULOS.map((m) => m.hub.slug).filter(Boolean),
);

function agruparPaginas(pages: Pagina[]): Array<{ secao: Secao; paginas: Pagina[] }> {
    const porSecao = new Map<string, Pagina[]>();
    for (const p of pages) {
        const s = SECAO_DA_PAGINA.get(p.key) ?? SECAO_OUTRAS;
        if (!porSecao.has(s.id)) porSecao.set(s.id, []);
        porSecao.get(s.id)!.push(p);
    }
    return ORDEM_SECOES.filter((s) => porSecao.has(s.id)).map((s) => ({
        secao: s,
        // a entrada do módulo vem primeiro; o resto na ordem do pai_api.php
        paginas: [...porSecao.get(s.id)!].sort(
            (a, b) =>
                Number(ENTRADAS_DE_MODULO.has(b.key)) -
                Number(ENTRADAS_DE_MODULO.has(a.key)),
        ),
    }));
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

async function safeJsonFetch(input: RequestInfo, init?: RequestInit) {
    const r = await fetch(input, {
        cache: "no-store",
        credentials: "include",
        ...init,
    });

    const txt = await r.text();
    const cleaned = txt.replace(/^﻿/, "").trim();

    let json: any = null;

    if (!cleaned.startsWith("<")) {
        try {
            json = JSON.parse(cleaned);
        } catch {
            const objectMatch = cleaned.match(/\{[\s\S]*\}$/m);
            const arrayMatch = cleaned.match(/\[[\s\S]*\]$/m);

            if (objectMatch) {
                json = JSON.parse(objectMatch[0]);
            } else if (arrayMatch) {
                json = JSON.parse(arrayMatch[0]);
            }
        }
    }

    if (json == null) {
        throw new Error(
            `Resposta não-JSON do backend:\n${cleaned.slice(0, 300)}${cleaned.length > 300 ? "…" : ""
            }`,
        );
    }

    if (!r.ok || json?.erro) {
        if (r.status === 401 || json?.need_login) {
            window.location.href = "/login";
        }

        throw new Error(
            (typeof json?.erro === "string" ? json.erro : "") ||
            json?.msg ||
            `HTTP ${r.status}`,
        );
    }

    return json;
}

function semAcento(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();
}

function iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return "?";
    const a = partes[0][0] ?? "";
    const b = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "";
    return (a + b).toUpperCase();
}

/** Chaves marcadas (true) de um mapa. */
function marcadas(r: Record<string | number, boolean>): string[] {
    return Object.keys(r).filter((k) => r[k]);
}

/** Retrato comparável de um conjunto (para saber se houve alteração). */
function retrato(chaves: Array<string | number>): string {
    return chaves.map(String).sort().join("|");
}

function deRetrato(s: string): Record<string, boolean> {
    return Object.fromEntries((s ? s.split("|") : []).map((k) => [k, true]));
}

function diferencas(a: string, b: string): number {
    const sa = new Set(a ? a.split("|") : []);
    const sb = new Set(b ? b.split("|") : []);
    let n = 0;
    sa.forEach((k) => {
        if (!sb.has(k)) n++;
    });
    sb.forEach((k) => {
        if (!sa.has(k)) n++;
    });
    return n;
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/* -------------------------------------------------------------------------- */
/* Estilos                                                                     */
/* -------------------------------------------------------------------------- */

const TXT_SEC = "text-[#5B6782] dark:text-[#AEB9CF]";
const CARD =
    "rounded-2xl border border-[#E3E8F0] bg-white shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F]";
const CAMPO =
    "min-h-[48px] w-full rounded-xl border border-[#D5DCE6] bg-white px-3 text-[16px] text-[#313C55] outline-none transition placeholder:text-[#8A94A8] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 disabled:opacity-60 dark:border-white/25 dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#7F8AA3]";
const BTN_PRIMARIO =
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#313C55] px-5 text-sm font-bold text-white transition hover:bg-[#3D6A99] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
const BTN_SECUNDARIO =
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#D5DCE6] bg-white px-4 text-sm font-semibold text-[#313C55] transition hover:bg-[#F6F8FB] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-[#232B3F] dark:text-white dark:hover:bg-[#1C2334]";
const BTN_PERIGO =
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#FF9C92]/40 dark:bg-transparent dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/10";

/* -------------------------------------------------------------------------- */
/* Componentes de apoio                                                        */
/* -------------------------------------------------------------------------- */

function NoCorpo({ children }: { children: React.ReactNode }) {
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);
    return montado ? createPortal(children, document.body) : null;
}

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
    subtitulo?: string;
    icone?: React.ReactNode;
    onClose: () => void;
    podeFechar?: boolean;
    rodape?: React.ReactNode;
    children: React.ReactNode;
}) {
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && podeFechar) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
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
                <div className="flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white lg:max-h-[88vh] lg:rounded-3xl lg:border lg:border-[#E3E8F0] lg:shadow-2xl lg:dark:border-white/[0.12]">
                    <div className="flex items-start gap-3 border-b border-[#E3E8F0] pb-3 pl-5 pr-2 pt-4 dark:border-white/[0.12] lg:px-6 lg:py-5">
                        {icone ? <div className="mt-0.5 shrink-0">{icone}</div> : null}
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[19px] font-extrabold leading-tight lg:text-xl">{titulo}</h2>
                            {subtitulo ? (
                                <p className={`mt-0.5 text-[13px] lg:mt-1 lg:text-sm ${TXT_SEC}`}>{subtitulo}</p>
                            ) : null}
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

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-6 lg:py-5">{children}</div>

                    {rodape ? (
                        <div className="flex flex-wrap justify-end gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:gap-3 lg:px-6 lg:py-4">
                            {rodape}
                        </div>
                    ) : null}
                </div>
            </div>
        </NoCorpo>
    );
}

function Avatar({ nome, ativo }: { nome: string; ativo?: boolean }) {
    return (
        <span
            aria-hidden
            className={[
                "grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-extrabold",
                ativo
                    ? "bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]"
                    : "bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/35 dark:text-white",
            ].join(" ")}
        >
            {iniciais(nome)}
        </span>
    );
}

function EtiquetaGrupo({ nome, vazio }: { nome: string; vazio?: boolean }) {
    return (
        <span
            className={[
                "inline-block max-w-[130px] shrink-0 truncate rounded-full px-2.5 py-1 text-[11px] font-bold",
                vazio
                    ? "bg-amber-100 text-amber-800 dark:bg-[#F2CB3F]/20 dark:text-[#F2CB3F]"
                    : "bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/30 dark:text-white",
            ].join(" ")}
            title={nome}
        >
            {nome}
        </span>
    );
}

function Contador({ n, total }: { n: number; total: number }) {
    return (
        <span className="rounded-full bg-[#E9EFF6] px-2.5 py-1 text-xs font-bold text-[#313C55] dark:bg-white/10 dark:text-[#D6DCE8]">
            {n} de {total}
        </span>
    );
}

function Aviso({
    tom,
    children,
}: {
    tom: "ok" | "erro" | "atencao";
    children: React.ReactNode;
}) {
    const cls =
        tom === "ok"
            ? "border-[#B3CE52]/60 bg-[#B3CE52]/15 text-[#3F5410] dark:text-[#B3CE52]"
            : tom === "erro"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"
                : "border-[#F2CB3F]/70 bg-[#FFF7DB] text-[#6B5208] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]";
    return (
        <div role={tom === "erro" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm font-medium ${cls}`}>
            {children}
        </div>
    );
}

/** Uma linha de permissão (página, departamento ou função). */
function ItemPermissao({
    id,
    titulo,
    descricao,
    estado,
    onToggle,
    bloqueado,
    sensivel,
    selo,
}: {
    id: string;
    titulo: string;
    descricao?: string | null;
    estado: EstadoPagina;
    onToggle: () => void;
    bloqueado?: boolean;
    sensivel?: boolean;
    selo?: string | null;
}) {
    const marcado = estado !== "livre";
    const travado = bloqueado || estado === "grupo";

    return (
        <label
            htmlFor={id}
            className={[
                "flex min-h-[48px] items-start gap-3 rounded-xl border px-3 py-2.5 transition",
                travado ? "cursor-default" : "cursor-pointer",
                estado === "grupo"
                    ? "border-[#B3CE52]/50 bg-[#B3CE52]/10 dark:border-[#B3CE52]/30"
                    : marcado
                        ? "border-[#3D6A99] bg-[#E9EFF6] dark:bg-[#3D6A99]/25"
                        : "border-[#E3E8F0] bg-white hover:border-[#C9D3E0] hover:bg-[#F6F8FB] dark:border-white/[0.12] dark:bg-transparent dark:hover:bg-white/[0.04]",
            ].join(" ")}
        >
            <input
                id={id}
                type="checkbox"
                checked={marcado}
                onChange={onToggle}
                disabled={travado}
                className="peer sr-only"
            />
            <span
                aria-hidden
                className={[
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition peer-focus-visible:ring-2 peer-focus-visible:ring-[#3D6A99]/40",
                    estado === "grupo"
                        ? "border-[#7F9A23] bg-[#7F9A23] text-white"
                        : marcado
                            ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]"
                            : "border-[#B8C2D1] bg-white dark:border-white/30 dark:bg-transparent",
                ].join(" ")}
            >
                {marcado ? <IconCheck size={14} stroke={3} /> : null}
            </span>

            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold leading-5 text-[#313C55] dark:text-white">
                        {titulo}
                    </span>
                    {sensivel ? (
                        <span
                            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"
                            title="Dá poder sobre acessos, pessoas, dinheiro ou altera dados"
                        >
                            <IconShieldLock size={12} stroke={2} />
                            sensível
                        </span>
                    ) : null}
                    {selo ? (
                        <span
                            className={[
                                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                estado === "grupo"
                                    ? "bg-[#B3CE52]/30 text-[#3F5410] dark:text-[#B3CE52]"
                                    : estado === "marcada"
                                        ? "bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]"
                                        : "bg-[#EEF2F7] text-[#5B6782] dark:bg-white/10 dark:text-[#AEB9CF]",
                            ].join(" ")}
                        >
                            {selo}
                        </span>
                    ) : null}
                </span>
                {descricao ? (
                    <span className={`mt-0.5 block text-xs leading-5 ${TXT_SEC}`}>{descricao}</span>
                ) : null}
            </span>
        </label>
    );
}

/** Páginas do sistema agrupadas por módulo, com busca, contador por seção e "marcar seção". */
function ListaPaginas({
    prefixo,
    pages,
    estadoDe,
    onToggle,
    onDefinirSecao,
    bloqueado,
    seloDe,
}: {
    prefixo: string;
    pages: Pagina[];
    estadoDe: (key: string) => EstadoPagina;
    onToggle: (key: string) => void;
    /** Marca ou desmarca as chaves da seção (as do grupo, travadas, não entram). */
    onDefinirSecao: (keys: string[], marcar: boolean) => void;
    bloqueado?: boolean;
    seloDe?: (key: string) => string | null;
}) {
    const [busca, setBusca] = useState("");
    const [fechadas, setFechadas] = useState<Record<string, boolean>>({});

    const q = semAcento(busca);
    const visiveis = useMemo(
        () => (q ? pages.filter((p) => semAcento(`${p.label} ${p.key}`).includes(q)) : pages),
        [pages, q],
    );
    const secoes = useMemo(() => agruparPaginas(visiveis), [visiveis]);

    return (
        <div>
            <div className="relative">
                <IconSearch
                    size={18}
                    stroke={1.8}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A94A8]"
                />
                <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Filtrar páginas…"
                    aria-label="Filtrar páginas"
                    className={`${CAMPO} pl-10`}
                />
            </div>

            <div className="mt-4 space-y-3">
                {secoes.map(({ secao, paginas }) => {
                    const total = paginas.length;
                    const marcadasSecao = paginas.filter((p) => estadoDe(p.key) !== "livre").length;
                    const editaveis = paginas.filter((p) => estadoDe(p.key) !== "grupo").map((p) => p.key);
                    const todasMarcadas = marcadasSecao === total;
                    // com busca, as seções ficam sempre abertas
                    const aberta = q ? true : !fechadas[secao.id];

                    return (
                        <section
                            key={secao.id}
                            className="overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12]"
                        >
                            <div className="flex items-center gap-2 bg-[#F6F8FB] px-3 py-1.5 dark:bg-[#1C2334]">
                                <button
                                    type="button"
                                    onClick={() => setFechadas((p) => ({ ...p, [secao.id]: !p[secao.id] }))}
                                    aria-expanded={aberta}
                                    className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left"
                                >
                                    <IconChevronDown
                                        size={18}
                                        stroke={2}
                                        className={`shrink-0 text-[#5B6782] transition dark:text-[#AEB9CF] ${aberta ? "" : "-rotate-90"}`}
                                    />
                                    <span className="truncate text-sm font-extrabold text-[#313C55] dark:text-white">
                                        {secao.titulo}
                                    </span>
                                    <span
                                        className={[
                                            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                                            marcadasSecao === 0
                                                ? "bg-white text-[#5B6782] dark:bg-white/10 dark:text-[#AEB9CF]"
                                                : "bg-[#313C55] text-white dark:bg-[#3D6A99]",
                                        ].join(" ")}
                                    >
                                        {marcadasSecao}/{total}
                                    </span>
                                </button>
                                {!bloqueado && editaveis.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => onDefinirSecao(editaveis, !todasMarcadas)}
                                        className="min-h-[36px] shrink-0 rounded-lg px-2.5 text-xs font-bold text-[#3D6A99] hover:bg-white dark:text-[#9CC0E6] dark:hover:bg-white/10"
                                    >
                                        {todasMarcadas ? "Desmarcar seção" : "Marcar seção"}
                                    </button>
                                ) : null}
                            </div>

                            {aberta ? (
                                <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
                                    {paginas.map((p) => (
                                        <ItemPermissao
                                            key={p.key}
                                            id={`${prefixo}-${p.key}`}
                                            titulo={p.label}
                                            estado={estadoDe(p.key)}
                                            onToggle={() => onToggle(p.key)}
                                            bloqueado={bloqueado}
                                            sensivel={PAGINAS_SENSIVEIS.has(p.key)}
                                            selo={seloDe ? seloDe(p.key) : null}
                                        />
                                    ))}
                                </div>
                            ) : null}
                        </section>
                    );
                })}

                {secoes.length === 0 ? (
                    <p className={`px-1 py-6 text-center text-sm ${TXT_SEC}`}>
                        {pages.length === 0 ? "Carregando páginas…" : `Nenhuma página encontrada para “${busca}”.`}
                    </p>
                ) : null}
            </div>
        </div>
    );
}

/** Barra fixa no rodapé: aparece só quando há alteração. */
function BarraAlteracoes({
    alteracoes,
    salvando,
    rotuloSalvar,
    onDescartar,
    onSalvar,
}: {
    alteracoes: number;
    salvando: boolean;
    rotuloSalvar: string;
    onDescartar: () => void;
    onSalvar: () => void;
}) {
    if (alteracoes <= 0) return null;
    return (
        <div className="sticky bottom-0 z-20 mt-5 pb-[env(safe-area-inset-bottom)] pt-3">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#F2CB3F] bg-[#FFF7DB] p-3 shadow-lg dark:border-[#F2CB3F]/60 dark:bg-[#3A3420]">
                <div className="flex min-w-0 basis-full items-center gap-2 text-sm font-bold text-[#6B5208] sm:flex-1 sm:basis-auto dark:text-[#F2CB3F]">
                    <IconAlertTriangle size={18} stroke={2} className="shrink-0" />
                    {salvando
                        ? "Salvando…"
                        : `${alteracoes} ${plural(alteracoes, "alteração não salva", "alterações não salvas")}`}
                </div>
                <button type="button" onClick={onDescartar} disabled={salvando} className={`${BTN_SECUNDARIO} flex-1 sm:flex-none`}>
                    Descartar
                </button>
                <button type="button" onClick={onSalvar} disabled={salvando} className={`${BTN_PRIMARIO} flex-1 sm:flex-none`}>
                    {salvando ? "Salvando…" : rotuloSalvar}
                </button>
            </div>
        </div>
    );
}

/** Aviso de páginas gravadas que não existem mais na lista do sistema. */
function AvisoPaginasAntigas({
    chaves,
    podeLimpar,
    onLimpar,
}: {
    chaves: string[];
    podeLimpar: boolean;
    onLimpar: () => void;
}) {
    if (chaves.length === 0) return null;
    const um = chaves.length === 1;
    return (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#F2CB3F]/70 bg-[#FFF7DB] px-4 py-3 text-sm text-[#6B5208] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]">
            <IconAlertTriangle size={18} stroke={2} className="shrink-0" />
            <div className="min-w-0 flex-1">
                <span className="font-bold">
                    {chaves.length} {um ? "página antiga" : "páginas antigas"}
                </span>{" "}
                {um ? "gravada, que não existe" : "gravadas, que não existem"} mais no sistema (não contam no total):{" "}
                <span className="break-all font-mono text-xs">{chaves.join(", ")}</span>
            </div>
            {podeLimpar ? (
                <button
                    type="button"
                    onClick={onLimpar}
                    className="min-h-[40px] shrink-0 rounded-lg border border-[#E4BC30] bg-white px-3 text-xs font-bold text-[#6B5208] hover:bg-[#FFFBEA] dark:bg-transparent dark:text-[#F2CB3F]"
                >
                    Limpar da lista
                </button>
            ) : null}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

export default function PermissoesPage() {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [pages, setPages] = useState<Pagina[]>([]);
    const [departamentos, setDepartamentos] = useState<DepartamentoIA[]>([]);
    const [ferramentas, setFerramentas] = useState<FerramentaIA[]>([]);

    const [userId, setUserId] = useState<number | null>(null);
    const [aba, setAba] = useState<Aba>("paginas");

    const [allowed, setAllowed] = useState<Record<string, boolean>>({});
    const [allowedDepartamentos, setAllowedDepartamentos] = useState<Record<string, boolean>>({});
    const [allowedFerramentas, setAllowedFerramentas] = useState<Record<string, boolean>>({});
    /** Retrato do que veio do servidor para o usuário aberto (extras | departamentos | funções). */
    const [snapUsuario, setSnapUsuario] = useState({ pags: "", deps: "", tools: "" });
    const reqUsuario = useRef(0);

    const [loading, setLoading] = useState(false);
    const [carregandoUsuario, setCarregandoUsuario] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    /* Grupos */
    const [modo, setModo] = useState<Modo>("usuarios");
    const [grupos, setGrupos] = useState<Grupo[]>([]);
    const [usuariosGrupo, setUsuariosGrupo] = useState<Record<number, UsuarioGrupo>>({});
    const [podeEditar, setPodeEditar] = useState(false);
    const [grupoSel, setGrupoSel] = useState<number | "novo" | null>(null);
    const [grupoNome, setGrupoNome] = useState("");
    const [grupoDesc, setGrupoDesc] = useState("");
    const [grupoPags, setGrupoPags] = useState<Record<string, boolean>>({});
    const [snapGrupo, setSnapGrupo] = useState({ nome: "", desc: "", pags: "" });

    const [buscaUsuario, setBuscaUsuario] = useState("");
    const [filtroGrupo, setFiltroGrupo] = useState<FiltroGrupo>("todos");

    /* Janelas */
    const [descartar, setDescartar] = useState<null | { acao: () => void }>(null);
    const [trocaGrupo, setTrocaGrupo] = useState<null | { uid: number; para: number }>(null);
    const [confirmarDesativar, setConfirmarDesativar] = useState<Grupo | null>(null);

    // a mensagem de sucesso some sozinha
    useEffect(() => {
        if (!msg) return;
        const t = window.setTimeout(() => setMsg(null), 4000);
        return () => window.clearTimeout(t);
    }, [msg]);

    /* ---------------------------------------------------------------------- */
    /* Carregamento                                                           */
    /* ---------------------------------------------------------------------- */

    const fetchUsuarios = async () => {
        const j = await safeJsonFetch(`${API_URL}?action=list_users&_=${Date.now()}`);
        setUsuarios(Array.isArray(j) ? (j as Usuario[]) : []);
    };

    const fetchPages = async () => {
        const j = await safeJsonFetch(`${API_URL}?action=list_pages&_=${Date.now()}`);
        setPages(Array.isArray(j) ? (j as Pagina[]) : []);
    };

    const fetchPainel = async () => {
        const j = await safeJsonFetch(`${GRUPOS_URL}?action=painel&_=${Date.now()}`);
        const d = j?.dados || {};
        setGrupos(Array.isArray(d.grupos) ? (d.grupos as Grupo[]) : []);
        const mapa: Record<number, UsuarioGrupo> = {};
        if (Array.isArray(d.usuarios)) {
            (d.usuarios as UsuarioGrupo[]).forEach((u) => {
                mapa[u.id] = u;
            });
        }
        setUsuariosGrupo(mapa);
        setPodeEditar(!!d.eu?.pode_editar);
    };

    const fetchDepartamentos = async () => {
        const j = await safeJsonFetch(`${API_URL}?action=list_ia_departamentos&_=${Date.now()}`);
        setDepartamentos(Array.isArray(j) ? (j as DepartamentoIA[]) : []);
    };

    const fetchFerramentas = async () => {
        const j = await safeJsonFetch(`${API_URL}?action=list_ia_ferramentas&_=${Date.now()}`);
        setFerramentas(Array.isArray(j) ? (j as FerramentaIA[]) : []);
    };

    const fetchPermsUsuario = async (uid: number) => {
        // só a resposta do último usuário aberto vale (troca rápida de usuário)
        const pedido = ++reqUsuario.current;
        setCarregandoUsuario(true);
        setError(null);

        try {
            const [paginasJson, departamentosJson, ferramentasJson] = await Promise.all([
                safeJsonFetch(`${API_URL}?action=list_permissions&user_id=${uid}&somente_extras=1&_=${Date.now()}`),
                safeJsonFetch(`${API_URL}?action=list_user_ia_departamentos&user_id=${uid}&_=${Date.now()}`),
                safeJsonFetch(`${API_URL}?action=list_user_ia_ferramentas&user_id=${uid}&_=${Date.now()}`),
            ]);
            if (pedido !== reqUsuario.current) return;

            const paginasSet: Record<string, boolean> = {};
            if (Array.isArray(paginasJson)) {
                paginasJson.forEach((key: unknown) => {
                    if (typeof key === "string") paginasSet[key] = true;
                });
            }

            const departamentosSet: Record<string, boolean> = {};
            if (Array.isArray(departamentosJson)) {
                departamentosJson.forEach((id: unknown) => {
                    const n = Number(id);
                    if (Number.isFinite(n) && n > 0) departamentosSet[String(n)] = true;
                });
            }

            const ferramentasSet: Record<string, boolean> = {};
            if (Array.isArray(ferramentasJson)) {
                ferramentasJson.forEach((key: unknown) => {
                    if (typeof key === "string") ferramentasSet[key] = true;
                });
            }

            setAllowed(paginasSet);
            setAllowedDepartamentos(departamentosSet);
            setAllowedFerramentas(ferramentasSet);
            setSnapUsuario({
                pags: retrato(marcadas(paginasSet)),
                deps: retrato(marcadas(departamentosSet)),
                tools: retrato(marcadas(ferramentasSet)),
            });
        } catch (e: any) {
            if (pedido !== reqUsuario.current) return;
            setAllowed({});
            setAllowedDepartamentos({});
            setAllowedFerramentas({});
            setSnapUsuario({ pags: "", deps: "", tools: "" });
            setError(e?.message || "Erro ao carregar permissões do usuário.");
        } finally {
            if (pedido === reqUsuario.current) setCarregandoUsuario(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        setError(null);

        Promise.all([fetchUsuarios(), fetchPages(), fetchDepartamentos(), fetchFerramentas(), fetchPainel()])
            .catch((e: any) => {
                setError(e?.message || "Erro ao carregar dados de permissões.");
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (userId != null) {
            setAba("paginas");
            void fetchPermsUsuario(userId);
        } else {
            reqUsuario.current++;
            setCarregandoUsuario(false);
            setAllowed({});
            setAllowedDepartamentos({});
            setAllowedFerramentas({});
            setSnapUsuario({ pags: "", deps: "", tools: "" });
        }
    }, [userId]);

    /* ---------------------------------------------------------------------- */
    /* Dados derivados                                                         */
    /* ---------------------------------------------------------------------- */

    const chavesValidas = useMemo(() => new Set(pages.map((p) => p.key)), [pages]);
    const rotuloPagina = useMemo(() => {
        const m = new Map<string, string>();
        pages.forEach((p) => m.set(p.key, p.label));
        return m;
    }, [pages]);

    const grupoPorId = useMemo(() => {
        const m = new Map<number, Grupo>();
        grupos.forEach((g) => m.set(g.id, g));
        return m;
    }, [grupos]);

    const grupoUsuario: number | null = userId != null ? usuariosGrupo[userId]?.grupo_id ?? null : null;

    const paginasDoGrupo = useMemo(() => {
        const g = grupoUsuario != null ? grupoPorId.get(grupoUsuario) : undefined;
        return new Set<string>(g && g.ativo ? g.paginas : []);
    }, [grupoPorId, grupoUsuario]);

    const currentUser = useMemo(() => usuarios.find((u) => u.id === userId), [userId, usuarios]);

    const grupoAtual = typeof grupoSel === "number" ? grupoPorId.get(grupoSel) ?? null : null;

    const nomeGrupo = (gid: number | null | undefined) =>
        (gid != null ? grupoPorId.get(gid)?.nome : undefined) ?? "Sem grupo";

    const nomeUsuario = (id: number) => {
        const u = usuariosGrupo[id] || usuarios.find((x) => x.id === id);
        return u ? u.nome || u.usuario : `#${id}`;
    };

    const validasDoGrupo = (g: Grupo) => g.paginas.filter((k) => chavesValidas.has(k));
    const extrasValidasDe = (uid: number) =>
        (usuariosGrupo[uid]?.extras ?? []).filter((k) => chavesValidas.has(k));

    const semGrupo = (uid: number) => {
        const gid = usuariosGrupo[uid]?.grupo_id ?? null;
        return gid == null || !grupoPorId.has(gid);
    };

    const contagemPorGrupo = useMemo(() => {
        const m = new Map<FiltroGrupo, number>();
        let sem = 0;
        usuarios.forEach((u) => {
            const gid = usuariosGrupo[u.id]?.grupo_id ?? null;
            if (gid == null || !grupoPorId.has(gid)) sem++;
            else m.set(gid, (m.get(gid) ?? 0) + 1);
        });
        m.set("sem", sem);
        m.set("todos", usuarios.length);
        return m;
    }, [usuarios, usuariosGrupo, grupoPorId]);

    const usuariosFiltrados = useMemo(() => {
        const q = semAcento(buscaUsuario);
        return usuarios.filter((u) => {
            const gid = usuariosGrupo[u.id]?.grupo_id ?? null;
            const sem = gid == null || !grupoPorId.has(gid);
            if (filtroGrupo === "sem" && !sem) return false;
            if (typeof filtroGrupo === "number" && gid !== filtroGrupo) return false;
            if (!q) return true;
            return semAcento(`${u.nome} ${u.usuario}`).includes(q);
        });
    }, [usuarios, usuariosGrupo, grupoPorId, buscaUsuario, filtroGrupo]);

    const ferramentasPorGrupo = useMemo(() => {
        const groups: Record<string, FerramentaIA[]> = {};
        for (const tool of ferramentas) {
            const group = String(tool.grupo || "Outros").trim() || "Outros";
            if (!groups[group]) groups[group] = [];
            groups[group].push(tool);
        }
        return groups;
    }, [ferramentas]);

    /* Usuário: contagens e alterações */
    const extrasValidas = marcadas(allowed).filter((k) => chavesValidas.has(k) && !paginasDoGrupo.has(k));
    const extrasAntigas = marcadas(allowed).filter((k) => !chavesValidas.has(k));
    const paginasDoGrupoValidas = pages.filter((p) => paginasDoGrupo.has(p.key)).length;
    const paginasUsuario = paginasDoGrupoValidas + extrasValidas.length;
    const departamentosMarcados = marcadas(allowedDepartamentos).length;
    const ferramentasMarcadas = marcadas(allowedFerramentas).length;

    const alteracoesUsuario =
        userId == null || carregandoUsuario
            ? 0
            : diferencas(snapUsuario.pags, retrato(marcadas(allowed))) +
            diferencas(snapUsuario.deps, retrato(marcadas(allowedDepartamentos))) +
            diferencas(snapUsuario.tools, retrato(marcadas(allowedFerramentas)));

    /* Grupo: contagens e alterações */
    const grupoPagsMarcadas = marcadas(grupoPags);
    const grupoPagsValidas = grupoPagsMarcadas.filter((k) => chavesValidas.has(k));
    const grupoPagsAntigas = grupoPagsMarcadas.filter((k) => !chavesValidas.has(k));

    const alteracoesGrupo =
        grupoSel == null
            ? 0
            : diferencas(snapGrupo.pags, retrato(grupoPagsMarcadas)) +
            (grupoNome.trim() !== snapGrupo.nome.trim() ? 1 : 0) +
            (grupoDesc.trim() !== snapGrupo.desc.trim() ? 1 : 0);

    const temAlteracao =
        (modo === "usuarios" && alteracoesUsuario > 0) || (modo === "grupos" && alteracoesGrupo > 0);

    /** Executa a ação; se houver alteração não salva, pergunta antes. */
    const comConfirmacao = useCallback(
        (acao: () => void) => {
            if (temAlteracao) setDescartar({ acao });
            else acao();
        },
        [temAlteracao],
    );

    // avisa o navegador ao fechar/recarregar com alteração pendente
    useEffect(() => {
        if (!temAlteracao) return;
        const fn = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", fn);
        return () => window.removeEventListener("beforeunload", fn);
    }, [temAlteracao]);

    /* ---------------------------------------------------------------------- */
    /* Ações: usuário                                                          */
    /* ---------------------------------------------------------------------- */

    const selecionarUsuario = (id: number | null) => {
        setMsg(null);
        setError(null);
        setUserId(id);
    };

    /** Volta as marcações do usuário ao que está salvo (sem buscar de novo). */
    const restaurarUsuario = () => {
        setAllowed(deRetrato(snapUsuario.pags));
        setAllowedDepartamentos(deRetrato(snapUsuario.deps));
        setAllowedFerramentas(deRetrato(snapUsuario.tools));
    };

    const togglePagina = (key: string) => {
        if (paginasDoGrupo.has(key)) return;
        setAllowed((prev) => {
            const novo = { ...prev };
            if (novo[key]) delete novo[key];
            else novo[key] = true;
            return novo;
        });
    };

    const definirPaginas = (keys: string[], marcar: boolean) => {
        setAllowed((prev) => {
            const novo = { ...prev };
            keys.forEach((k) => {
                if (paginasDoGrupo.has(k)) return;
                if (marcar) novo[k] = true;
                else delete novo[k];
            });
            return novo;
        });
    };

    const toggleEm = (setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>, key: string) =>
        setter((prev) => {
            const novo = { ...prev };
            if (novo[key]) delete novo[key];
            else novo[key] = true;
            return novo;
        });

    const save = async () => {
        if (userId == null) return;

        setLoading(true);
        setMsg(null);
        setError(null);

        try {
            const paginasSelecionadas = marcadas(allowed);
            const departamentosSelecionados = marcadas(allowedDepartamentos)
                .map((id) => Number(id))
                .filter((id) => Number.isFinite(id) && id > 0);
            const ferramentasSelecionadas = marcadas(allowedFerramentas);

            // grupo + extras pelo grupos.php (só Gestão). Extra que o grupo já dá não é gravado:
            // o pai_api list_permissions (menu e middleware) já soma grupo + extras.
            if (podeEditar) {
                if (grupoUsuario == null) {
                    throw new Error("Escolha o grupo do usuário antes de salvar.");
                }
                await safeJsonFetch(`${GRUPOS_URL}?action=usuario_salvar`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: userId,
                        grupo_id: grupoUsuario,
                        extras: paginasSelecionadas.filter((k) => !paginasDoGrupo.has(k)),
                    }),
                });
            }

            await safeJsonFetch(`${API_URL}?action=save_user_ia_departamentos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, departamentos: departamentosSelecionados }),
            });

            await safeJsonFetch(`${API_URL}?action=save_user_ia_ferramentas`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, ferramentas: ferramentasSelecionadas }),
            });

            setSnapUsuario({
                pags: podeEditar ? retrato(paginasSelecionadas) : snapUsuario.pags,
                deps: retrato(departamentosSelecionados),
                tools: retrato(ferramentasSelecionadas),
            });
            setMsg("Permissões salvas.");
            await fetchPainel().catch(() => undefined);
        } catch (e: any) {
            setError(e?.message || "Erro ao salvar permissões.");
        } finally {
            setLoading(false);
        }
    };

    /** Troca o grupo (depois da confirmação). As extras continuam. */
    const mudarGrupo = async (uid: number, gid: number) => {
        setLoading(true);
        setMsg(null);
        setError(null);
        try {
            await safeJsonFetch(`${GRUPOS_URL}?action=usuario_grupo`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: uid, grupo_id: gid }),
            });
            setMsg(`${nomeUsuario(uid)} agora está no grupo ${nomeGrupo(gid)}.`);
            await fetchPainel();
        } catch (e: any) {
            setError(e?.message || "Erro ao alterar o grupo.");
        } finally {
            setLoading(false);
            setTrocaGrupo(null);
        }
    };

    /* ---------------------------------------------------------------------- */
    /* Ações: grupos                                                           */
    /* ---------------------------------------------------------------------- */

    const abrirGrupo = (g: Grupo | "novo") => {
        setMsg(null);
        setError(null);
        if (g === "novo") {
            setGrupoSel("novo");
            setGrupoNome("");
            setGrupoDesc("");
            setGrupoPags({});
            setSnapGrupo({ nome: "", desc: "", pags: "" });
            return;
        }
        setGrupoSel(g.id);
        setGrupoNome(g.nome);
        setGrupoDesc(g.descricao || "");
        setGrupoPags(Object.fromEntries(g.paginas.map((k) => [k, true])) as Record<string, boolean>);
        setSnapGrupo({ nome: g.nome, desc: g.descricao || "", pags: retrato(g.paginas) });
    };

    /** Volta o grupo aberto ao que está salvo. */
    const restaurarGrupo = () => {
        setGrupoNome(snapGrupo.nome);
        setGrupoDesc(snapGrupo.desc);
        setGrupoPags(deRetrato(snapGrupo.pags));
    };

    const definirPaginasGrupo = (keys: string[], marcar: boolean) => {
        setGrupoPags((prev) => {
            const novo = { ...prev };
            keys.forEach((k) => {
                if (marcar) novo[k] = true;
                else delete novo[k];
            });
            return novo;
        });
    };

    const salvarGrupo = async () => {
        if (grupoSel == null) return;
        if (!grupoNome.trim()) {
            setError("Informe o nome do grupo.");
            return;
        }
        setLoading(true);
        setMsg(null);
        setError(null);
        try {
            const paginas = marcadas(grupoPags);
            const j = await safeJsonFetch(`${GRUPOS_URL}?action=grupo_salvar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: grupoSel === "novo" ? 0 : grupoSel,
                    nome: grupoNome,
                    descricao: grupoDesc,
                    paginas,
                }),
            });
            const novoId = Number(j?.dados?.id) || null;
            if (novoId) setGrupoSel(novoId);
            setSnapGrupo({ nome: grupoNome, desc: grupoDesc, pags: retrato(paginas) });
            setMsg(grupoSel === "novo" ? "Grupo criado." : "Grupo salvo.");
            await fetchPainel();
        } catch (e: any) {
            setError(e?.message || "Erro ao salvar o grupo.");
        } finally {
            setLoading(false);
        }
    };

    const alternarAtivoGrupo = async (g: Grupo) => {
        setLoading(true);
        setMsg(null);
        setError(null);
        try {
            await safeJsonFetch(`${GRUPOS_URL}?action=grupo_ativo`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: g.id, ativo: !g.ativo }),
            });
            setMsg(g.ativo ? "Grupo desativado." : "Grupo ativado.");
            await fetchPainel();
        } catch (e: any) {
            setError(e?.message || "Erro ao alterar o grupo.");
        } finally {
            setLoading(false);
            setConfirmarDesativar(null);
        }
    };

    const abrirMembro = (id: number) =>
        comConfirmacao(() => {
            setModo("usuarios");
            setFiltroGrupo("todos");
            setBuscaUsuario("");
            selecionarUsuario(id);
        });

    const trocarModo = (m: Modo) =>
        comConfirmacao(() => {
            setModo(m);
            setMsg(null);
            setError(null);
        });

    /* ---------------------------------------------------------------------- */
    /* Troca de grupo: o que ganha e o que perde                               */
    /* ---------------------------------------------------------------------- */

    const resumoTroca = useMemo(() => {
        if (!trocaGrupo) return null;
        const de = usuariosGrupo[trocaGrupo.uid]?.grupo_id ?? null;
        const gDe = de != null ? grupoPorId.get(de) : undefined;
        const gPara = grupoPorId.get(trocaGrupo.para);
        const setDe = new Set((gDe && gDe.ativo ? gDe.paginas : []).filter((k) => chavesValidas.has(k)));
        const setPara = new Set((gPara ? gPara.paginas : []).filter((k) => chavesValidas.has(k)));
        const extras = new Set(usuariosGrupo[trocaGrupo.uid]?.extras ?? []);
        const ganha = Array.from(setPara).filter((k) => !setDe.has(k) && !extras.has(k));
        const perde = Array.from(setDe).filter((k) => !setPara.has(k) && !extras.has(k));
        return { de: gDe?.nome ?? "Sem grupo", para: gPara?.nome ?? "—", ganha, perde };
    }, [trocaGrupo, usuariosGrupo, grupoPorId, chavesValidas]);

    /* ---------------------------------------------------------------------- */
    /* Render                                                                  */
    /* ---------------------------------------------------------------------- */

    const abasUsuario: Array<{ key: Aba; label: string; count: number; total: number }> = [
        { key: "paginas", label: "Páginas", count: paginasUsuario, total: pages.length },
        { key: "conhecimento", label: "Conhecimento IA", count: departamentosMarcados, total: departamentos.length },
        { key: "ferramentas", label: "Funções Aurora", count: ferramentasMarcadas, total: ferramentas.length },
    ];

    const semGrupoLista = usuarios.filter((u) => semGrupo(u.id));
    const comExtrasLista = usuarios.filter((u) => extrasValidasDe(u.id).length > 0);

    const chipsFiltro: Array<{ k: FiltroGrupo; nome: string }> = [
        { k: "todos", nome: "Todos" },
        ...grupos
            .filter((g) => g.ativo || (contagemPorGrupo.get(g.id) ?? 0) > 0)
            .map((g) => ({ k: g.id as FiltroGrupo, nome: g.nome })),
        ...((contagemPorGrupo.get("sem") ?? 0) > 0 ? [{ k: "sem" as FiltroGrupo, nome: "Sem grupo" }] : []),
    ];

    return (
        <div className="min-h-screen bg-[#F6F8FB] text-[#313C55] dark:bg-[#1C2334] dark:text-white">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                {/* Cabeçalho */}
                <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Permissões</h1>
                        <p className={`mt-1 max-w-3xl text-sm ${TXT_SEC}`}>
                            Cada usuário pertence a um <b>grupo</b>, que libera as páginas do grupo. Páginas{" "}
                            <b>extras</b> marcadas no usuário só acrescentam.
                            {podeEditar ? "" : " Só quem tem Gestão altera grupos e páginas."}
                        </p>
                    </div>

                    <div
                        role="tablist"
                        className="inline-flex w-full shrink-0 gap-1 rounded-2xl border border-[#E3E8F0] bg-white p-1 shadow-sm sm:w-auto dark:border-white/[0.12] dark:bg-[#232B3F]"
                    >
                        {(
                            [
                                ["usuarios", "Usuários", usuarios.length],
                                ["grupos", "Grupos", grupos.length],
                            ] as Array<[Modo, string, number]>
                        ).map(([k, label, n]) => (
                            <button
                                key={k}
                                type="button"
                                role="tab"
                                aria-selected={modo === k}
                                onClick={() => modo !== k && trocarModo(k)}
                                className={[
                                    "flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition sm:flex-none",
                                    modo === k
                                        ? "bg-[#313C55] text-white dark:bg-[#3D6A99]"
                                        : "text-[#5B6782] hover:bg-[#F6F8FB] dark:text-[#AEB9CF] dark:hover:bg-white/10",
                                ].join(" ")}
                            >
                                {label}
                                <span
                                    className={[
                                        "rounded-full px-2 py-0.5 text-[11px]",
                                        modo === k ? "bg-white/15" : "bg-[#E9EFF6] dark:bg-white/10",
                                    ].join(" ")}
                                >
                                    {n}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Avisos */}
                {msg || error ? (
                    <div aria-live="polite" className="mb-4 space-y-2">
                        {msg ? <Aviso tom="ok">{msg}</Aviso> : null}
                        {error ? <Aviso tom="erro">{error}</Aviso> : null}
                    </div>
                ) : null}

                {modo === "grupos" ? (
                    /* ================================ GRUPOS ================================ */
                    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                        <aside className={`${CARD} min-w-0 self-start p-3 ${grupoSel != null ? "hidden lg:block" : ""}`}>
                            {podeEditar ? (
                                <button
                                    type="button"
                                    onClick={() => comConfirmacao(() => abrirGrupo("novo"))}
                                    className={`${BTN_PRIMARIO} mb-3 w-full`}
                                >
                                    <IconPlus size={18} stroke={2.2} />
                                    Novo grupo
                                </button>
                            ) : null}
                            <div className="space-y-2">
                                {grupos.map((g) => {
                                    const validas = validasDoGrupo(g).length;
                                    const antigas = g.paginas.length - validas;
                                    const pct = pages.length ? Math.round((validas / pages.length) * 100) : 0;
                                    const revisar = g.ativo && (validas === 0 || /reclassific/i.test(g.nome));
                                    return (
                                        <button
                                            key={g.id}
                                            type="button"
                                            onClick={() => grupoSel !== g.id && comConfirmacao(() => abrirGrupo(g))}
                                            className={[
                                                "w-full rounded-xl border px-3 py-2.5 text-left transition",
                                                grupoSel === g.id
                                                    ? "border-[#3D6A99] bg-[#E9EFF6] dark:bg-[#3D6A99]/20"
                                                    : "border-[#E3E8F0] hover:bg-[#F6F8FB] dark:border-white/[0.12] dark:hover:bg-[#1C2334]",
                                                g.ativo ? "" : "opacity-60",
                                            ].join(" ")}
                                        >
                                            <span className="flex items-center gap-2">
                                                <span className="min-w-0 flex-1 truncate text-sm font-bold">{g.nome}</span>
                                                {!g.ativo ? (
                                                    <span className="shrink-0 rounded-full bg-[#EEF2F7] px-2 py-0.5 text-[10px] font-bold uppercase text-[#5B6782] dark:bg-white/10 dark:text-[#AEB9CF]">
                                                        Inativo
                                                    </span>
                                                ) : revisar ? (
                                                    <span
                                                        className="shrink-0 text-[#C79A0A] dark:text-[#F2CB3F]"
                                                        title={validas === 0 ? "Grupo sem páginas" : "Grupo a reclassificar"}
                                                    >
                                                        <IconAlertTriangle size={16} stroke={2} />
                                                    </span>
                                                ) : null}
                                            </span>
                                            <span className={`mt-0.5 block text-xs ${TXT_SEC}`}>
                                                {g.membros.length} {plural(g.membros.length, "membro", "membros")} · {validas} de {pages.length} páginas
                                                {antigas > 0 ? (
                                                    <span className="font-semibold text-[#9A7409] dark:text-[#F2CB3F]">
                                                        {" "}
                                                        · {antigas} {plural(antigas, "antiga", "antigas")}
                                                    </span>
                                                ) : null}
                                            </span>
                                            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#EEF2F7] dark:bg-white/10">
                                                <span
                                                    className="block h-full rounded-full bg-[#3D6A99] dark:bg-[#9CC0E6]"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </span>
                                        </button>
                                    );
                                })}
                                {grupos.length === 0 && !loading ? (
                                    <p className={`px-1 py-4 text-sm ${TXT_SEC}`}>Nenhum grupo cadastrado.</p>
                                ) : null}
                            </div>
                        </aside>

                        {grupoSel == null ? (
                            <div className={`${CARD} hidden border-dashed px-6 py-16 text-center lg:block`}>
                                <IconUsersGroup size={36} stroke={1.5} className="mx-auto text-[#8A94A8]" />
                                <div className="mt-3 text-base font-bold">Selecione um grupo</div>
                                <p className={`mt-1 text-sm ${TXT_SEC}`}>As páginas e os membros do grupo aparecem aqui.</p>
                            </div>
                        ) : (
                            <div className="min-w-0">
                                <button
                                    type="button"
                                    onClick={() => comConfirmacao(() => setGrupoSel(null))}
                                    className="mb-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#3D6A99] lg:hidden dark:text-[#9CC0E6]"
                                >
                                    <IconArrowLeft size={18} stroke={2} />
                                    Grupos
                                </button>

                                <div className={`${CARD} p-4 md:p-6`}>
                                    {/* Cabeçalho do grupo */}
                                    <div className="flex flex-wrap items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="text-xl font-extrabold">
                                                    {grupoSel === "novo" ? "Novo grupo" : snapGrupo.nome || "Grupo"}
                                                </h2>
                                                {grupoAtual && !grupoAtual.ativo ? (
                                                    <span className="rounded-full bg-[#EEF2F7] px-2 py-0.5 text-[11px] font-bold uppercase text-[#5B6782] dark:bg-white/10 dark:text-[#AEB9CF]">
                                                        Inativo
                                                    </span>
                                                ) : null}
                                            </div>
                                            <p className={`mt-0.5 text-sm ${TXT_SEC}`}>
                                                {grupoPagsValidas.length} de {pages.length} páginas
                                                {grupoAtual
                                                    ? ` · ${grupoAtual.membros.length} ${plural(grupoAtual.membros.length, "membro", "membros")}`
                                                    : ""}
                                            </p>
                                        </div>
                                        {podeEditar && grupoAtual ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    grupoAtual.ativo
                                                        ? setConfirmarDesativar(grupoAtual)
                                                        : void alternarAtivoGrupo(grupoAtual)
                                                }
                                                disabled={loading}
                                                className={grupoAtual.ativo ? BTN_PERIGO : BTN_SECUNDARIO}
                                            >
                                                {grupoAtual.ativo ? "Desativar grupo" : "Ativar grupo"}
                                            </button>
                                        ) : null}
                                    </div>

                                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                                        <div>
                                            <label htmlFor="grupo-nome" className="mb-1.5 block text-sm font-bold">
                                                Nome do grupo
                                            </label>
                                            <input
                                                id="grupo-nome"
                                                value={grupoNome}
                                                onChange={(e) => setGrupoNome(e.target.value)}
                                                disabled={!podeEditar}
                                                maxLength={80}
                                                placeholder="Ex.: Agente"
                                                className={CAMPO}
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="grupo-desc" className="mb-1.5 block text-sm font-bold">
                                                Descrição
                                            </label>
                                            <input
                                                id="grupo-desc"
                                                value={grupoDesc}
                                                onChange={(e) => setGrupoDesc(e.target.value)}
                                                disabled={!podeEditar}
                                                maxLength={255}
                                                placeholder="Para que serve este grupo"
                                                className={CAMPO}
                                            />
                                        </div>
                                    </div>

                                    {grupoAtual ? (
                                        <div className="mt-6">
                                            <h3 className={`text-xs font-extrabold uppercase tracking-wider ${TXT_SEC}`}>
                                                Membros ({grupoAtual.membros.length})
                                            </h3>
                                            <p className={`mt-1 text-xs ${TXT_SEC}`}>
                                                Toque num membro para abrir as permissões dele. É lá que se troca o grupo.
                                            </p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {grupoAtual.membros.map((id) => (
                                                    <button
                                                        key={id}
                                                        type="button"
                                                        onClick={() => abrirMembro(id)}
                                                        className="inline-flex min-h-[36px] items-center gap-2 rounded-full bg-[#E9EFF6] py-1 pl-1 pr-3 text-xs font-bold text-[#313C55] transition hover:bg-[#D9E3EF] dark:bg-[#3D6A99]/30 dark:text-white dark:hover:bg-[#3D6A99]/50"
                                                    >
                                                        <span className="grid size-7 place-items-center rounded-full bg-white text-[10px] font-extrabold dark:bg-[#232B3F]">
                                                            {iniciais(nomeUsuario(id))}
                                                        </span>
                                                        {nomeUsuario(id)}
                                                    </button>
                                                ))}
                                                {grupoAtual.membros.length === 0 ? (
                                                    <span className={`text-xs ${TXT_SEC}`}>Nenhum membro.</span>
                                                ) : null}
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className="mt-6 border-t border-[#E3E8F0] pt-5 dark:border-white/[0.12]">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <div className="min-w-[min(100%,240px)] flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-lg font-extrabold">Páginas do grupo</h3>
                                                    <Contador n={grupoPagsValidas.length} total={pages.length} />
                                                </div>
                                                <p className={`mt-1 text-sm ${TXT_SEC}`}>
                                                    Todos os membros acessam estas páginas. As marcadas como{" "}
                                                    <b className="text-red-700 dark:text-[#FF9C92]">sensível</b> dão poder sobre
                                                    acessos, pessoas ou dinheiro.
                                                </p>
                                            </div>
                                            {podeEditar ? (
                                                <div className="flex shrink-0 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => definirPaginasGrupo(pages.map((p) => p.key), true)}
                                                        className={BTN_SECUNDARIO}
                                                    >
                                                        Marcar tudo
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => definirPaginasGrupo(pages.map((p) => p.key), false)}
                                                        className={BTN_SECUNDARIO}
                                                    >
                                                        Desmarcar tudo
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>

                                        <AvisoPaginasAntigas
                                            chaves={grupoPagsAntigas}
                                            podeLimpar={podeEditar}
                                            onLimpar={() => definirPaginasGrupo(grupoPagsAntigas, false)}
                                        />

                                        <div className="mt-4">
                                            <ListaPaginas
                                                key={`g-${grupoSel}`}
                                                prefixo="gpg"
                                                pages={pages}
                                                estadoDe={(k) => (grupoPags[k] ? "marcada" : "livre")}
                                                onToggle={(k) => toggleEm(setGrupoPags, k)}
                                                onDefinirSecao={definirPaginasGrupo}
                                                bloqueado={!podeEditar}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {podeEditar ? (
                                    <BarraAlteracoes
                                        alteracoes={alteracoesGrupo}
                                        salvando={loading}
                                        rotuloSalvar={grupoSel === "novo" ? "Criar grupo" : "Salvar grupo"}
                                        onDescartar={restaurarGrupo}
                                        onSalvar={salvarGrupo}
                                    />
                                ) : null}
                            </div>
                        )}
                    </div>
                ) : (
                    /* =============================== USUÁRIOS =============================== */
                    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                        <aside className={`${CARD} min-w-0 self-start p-3 ${userId != null ? "hidden lg:block" : ""}`}>
                            <div className="relative">
                                <IconSearch
                                    size={18}
                                    stroke={1.8}
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A94A8]"
                                />
                                <input
                                    value={buscaUsuario}
                                    onChange={(e) => setBuscaUsuario(e.target.value)}
                                    placeholder="Buscar usuário"
                                    aria-label="Buscar usuário"
                                    className={`${CAMPO} pl-10`}
                                />
                            </div>

                            {/* Filtro por grupo */}
                            <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
                                {chipsFiltro.map((c) => {
                                    const ativo = filtroGrupo === c.k;
                                    return (
                                        <button
                                            key={String(c.k)}
                                            type="button"
                                            onClick={() => setFiltroGrupo(c.k)}
                                            aria-pressed={ativo}
                                            className={[
                                                "inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition",
                                                ativo
                                                    ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                                                    : c.k === "sem"
                                                        ? "border-[#F2CB3F] bg-[#FFF7DB] text-[#6B5208] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]"
                                                        : "border-[#E3E8F0] bg-white text-[#5B6782] hover:bg-[#F6F8FB] dark:border-white/[0.12] dark:bg-transparent dark:text-[#AEB9CF]",
                                            ].join(" ")}
                                        >
                                            {c.nome}
                                            <span className="opacity-75">{contagemPorGrupo.get(c.k) ?? 0}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-2 max-h-[68vh] space-y-1 overflow-y-auto pr-1">
                                {usuariosFiltrados.map((u) => {
                                    const gid = usuariosGrupo[u.id]?.grupo_id ?? null;
                                    const sem = semGrupo(u.id);
                                    const nExtras = extrasValidasDe(u.id).length;
                                    const ativo = userId === u.id;
                                    return (
                                        <button
                                            key={u.id}
                                            type="button"
                                            onClick={() => !ativo && comConfirmacao(() => selecionarUsuario(u.id))}
                                            className={[
                                                "flex min-h-[56px] w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition",
                                                ativo
                                                    ? "border-[#3D6A99] bg-[#E9EFF6] dark:bg-[#3D6A99]/20"
                                                    : "border-transparent hover:bg-[#F6F8FB] dark:hover:bg-[#1C2334]",
                                            ].join(" ")}
                                        >
                                            <Avatar nome={u.nome || u.usuario} ativo={ativo} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-bold">{u.nome}</span>
                                                <span className={`block truncate text-xs ${TXT_SEC}`}>
                                                    @{u.usuario}
                                                    {nExtras > 0 ? ` · +${nExtras} ${plural(nExtras, "extra", "extras")}` : ""}
                                                </span>
                                            </span>
                                            <EtiquetaGrupo nome={sem ? "Sem grupo" : nomeGrupo(gid)} vazio={sem} />
                                        </button>
                                    );
                                })}
                                {usuariosFiltrados.length === 0 && !loading ? (
                                    <p className={`px-1 py-4 text-sm ${TXT_SEC}`}>Nenhum usuário encontrado.</p>
                                ) : null}
                            </div>
                        </aside>

                        <div className={`min-w-0 ${userId == null ? "hidden lg:block" : ""}`}>
                            {userId == null ? (
                                /* Resumo quando nenhum usuário está aberto */
                                <div className="space-y-4">
                                    <div className={`${CARD} p-4 md:p-6`}>
                                        <h2 className="text-lg font-extrabold">Resumo</h2>
                                        <p className={`mt-1 text-sm ${TXT_SEC}`}>
                                            Escolha um usuário na lista para ver e alterar as permissões dele. Toque num grupo
                                            para filtrar a lista.
                                        </p>
                                        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                            {grupos
                                                .filter((g) => g.ativo)
                                                .map((g) => (
                                                    <button
                                                        key={g.id}
                                                        type="button"
                                                        onClick={() => setFiltroGrupo(g.id)}
                                                        className={[
                                                            "rounded-xl border px-3 py-3 text-left transition hover:border-[#3D6A99] hover:bg-[#F6F8FB] dark:hover:bg-[#1C2334]",
                                                            filtroGrupo === g.id
                                                                ? "border-[#3D6A99]"
                                                                : "border-[#E3E8F0] dark:border-white/[0.12]",
                                                        ].join(" ")}
                                                    >
                                                        <span className="block truncate text-sm font-bold">{g.nome}</span>
                                                        <span className={`block text-xs ${TXT_SEC}`}>
                                                            {contagemPorGrupo.get(g.id) ?? 0}{" "}
                                                            {plural(contagemPorGrupo.get(g.id) ?? 0, "usuário", "usuários")} ·{" "}
                                                            {validasDoGrupo(g).length} páginas
                                                        </span>
                                                    </button>
                                                ))}
                                        </div>
                                    </div>

                                    {semGrupoLista.length > 0 ? (
                                        <div className="rounded-2xl border border-[#F2CB3F]/70 bg-[#FFF7DB] p-4 dark:bg-[#F2CB3F]/10">
                                            <div className="flex items-center gap-2 text-sm font-extrabold text-[#6B5208] dark:text-[#F2CB3F]">
                                                <IconAlertTriangle size={18} stroke={2} />
                                                {semGrupoLista.length} {plural(semGrupoLista.length, "usuário sem grupo", "usuários sem grupo")}
                                            </div>
                                            <p className="mt-1 text-xs text-[#6B5208] dark:text-[#F2CB3F]">
                                                Sem grupo, a pessoa só acessa as páginas extras dela.
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {semGrupoLista.map((u) => (
                                                    <button
                                                        key={u.id}
                                                        type="button"
                                                        onClick={() => selecionarUsuario(u.id)}
                                                        className="min-h-[36px] rounded-full bg-white px-3 text-xs font-bold text-[#313C55] hover:bg-[#FFFBEA] dark:bg-[#232B3F] dark:text-white"
                                                    >
                                                        {u.nome || u.usuario}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}

                                    {comExtrasLista.length > 0 ? (
                                        <div className={`${CARD} p-4`}>
                                            <div className="text-sm font-extrabold">Com páginas extras ({comExtrasLista.length})</div>
                                            <p className={`mt-1 text-xs ${TXT_SEC}`}>
                                                Acessos dados fora do grupo. Vale revisar de tempos em tempos.
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {comExtrasLista.map((u) => (
                                                    <button
                                                        key={u.id}
                                                        type="button"
                                                        onClick={() => selecionarUsuario(u.id)}
                                                        className="min-h-[36px] rounded-full bg-[#E9EFF6] px-3 text-xs font-bold text-[#313C55] hover:bg-[#D9E3EF] dark:bg-[#3D6A99]/30 dark:text-white"
                                                    >
                                                        {u.nome || u.usuario} · +{extrasValidasDe(u.id).length}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => comConfirmacao(() => selecionarUsuario(null))}
                                        className="mb-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#3D6A99] lg:hidden dark:text-[#9CC0E6]"
                                    >
                                        <IconArrowLeft size={18} stroke={2} />
                                        Usuários
                                    </button>

                                    {/* Cabeçalho do usuário */}
                                    <div className={`${CARD} p-4 md:p-5`}>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <Avatar nome={currentUser?.nome || currentUser?.usuario || "?"} ativo />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-lg font-extrabold">{currentUser?.nome}</div>
                                                <div className={`truncate text-sm ${TXT_SEC}`}>@{currentUser?.usuario}</div>
                                            </div>
                                            <div className="w-full sm:w-64">
                                                <label htmlFor="grupo-usuario" className={`mb-1 block text-xs font-bold ${TXT_SEC}`}>
                                                    Grupo
                                                </label>
                                                <select
                                                    id="grupo-usuario"
                                                    value={grupoUsuario ?? ""}
                                                    disabled={!podeEditar || loading}
                                                    onChange={(e) => {
                                                        const gid = e.target.value ? parseInt(e.target.value, 10) : null;
                                                        if (gid != null && gid !== grupoUsuario) {
                                                            setTrocaGrupo({ uid: userId, para: gid });
                                                        }
                                                    }}
                                                    className={CAMPO}
                                                >
                                                    {grupoUsuario == null ? <option value="">Sem grupo</option> : null}
                                                    {grupos
                                                        .filter((g) => g.ativo || g.id === grupoUsuario)
                                                        .map((g) => (
                                                            <option key={g.id} value={g.id}>
                                                                {g.nome}
                                                                {g.ativo ? "" : " (inativo)"}
                                                            </option>
                                                        ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                                            <div className="rounded-xl bg-[#B3CE52]/15 px-2 py-2.5">
                                                <div className="text-xl font-extrabold">{paginasDoGrupoValidas}</div>
                                                <div className={`text-[11px] font-bold ${TXT_SEC}`}>do grupo</div>
                                            </div>
                                            <div className="rounded-xl bg-[#E9EFF6] px-2 py-2.5 dark:bg-[#3D6A99]/25">
                                                <div className="text-xl font-extrabold">+{extrasValidas.length}</div>
                                                <div className={`text-[11px] font-bold ${TXT_SEC}`}>extras</div>
                                            </div>
                                            <div className="rounded-xl bg-[#313C55] px-2 py-2.5 text-white dark:bg-[#F2CB3F] dark:text-[#313C55]">
                                                <div className="text-xl font-extrabold">{paginasUsuario}</div>
                                                <div className="text-[11px] font-bold opacity-80">páginas no total</div>
                                            </div>
                                        </div>
                                        {grupoUsuario != null && grupoPorId.get(grupoUsuario)?.ativo === false ? (
                                            <div className="mt-3">
                                                <Aviso tom="atencao">
                                                    O grupo {nomeGrupo(grupoUsuario)} está inativo: as páginas dele não valem. Escolha
                                                    outro grupo.
                                                </Aviso>
                                            </div>
                                        ) : null}
                                        {grupoUsuario == null && podeEditar ? (
                                            <div className="mt-3">
                                                <Aviso tom="atencao">Este usuário está sem grupo. Escolha um grupo acima.</Aviso>
                                            </div>
                                        ) : null}
                                    </div>

                                    {/* Abas */}
                                    <div className="mt-4 overflow-x-auto">
                                        <div
                                            role="tablist"
                                            className="inline-flex min-w-full gap-1 rounded-2xl border border-[#E3E8F0] bg-white p-1 shadow-sm md:min-w-0 dark:border-white/[0.12] dark:bg-[#232B3F]"
                                        >
                                            {abasUsuario.map((item) => {
                                                const active = aba === item.key;
                                                return (
                                                    <button
                                                        key={item.key}
                                                        type="button"
                                                        role="tab"
                                                        aria-selected={active}
                                                        onClick={() => setAba(item.key)}
                                                        className={[
                                                            "flex min-h-[44px] min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition md:flex-none",
                                                            active
                                                                ? "bg-[#313C55] text-white dark:bg-[#3D6A99]"
                                                                : "text-[#5B6782] hover:bg-[#F6F8FB] dark:text-[#AEB9CF] dark:hover:bg-white/10",
                                                        ].join(" ")}
                                                    >
                                                        {item.label}
                                                        <span
                                                            className={[
                                                                "rounded-full px-2 py-0.5 text-[11px]",
                                                                active ? "bg-white/15" : "bg-[#E9EFF6] dark:bg-white/10",
                                                            ].join(" ")}
                                                        >
                                                            {item.count}/{item.total}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Conteúdo */}
                                    <div
                                        className={`${CARD} mt-4 p-4 md:p-6 ${carregandoUsuario ? "pointer-events-none opacity-60" : ""}`}
                                        aria-busy={carregandoUsuario}
                                    >
                                        {aba === "paginas" ? (
                                            <>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <div className="min-w-[min(100%,240px)] flex-1">
                                                        <h3 className="text-lg font-extrabold">Páginas</h3>
                                                        <p className={`mt-1 text-sm ${TXT_SEC}`}>
                                                            <span className="font-bold text-[#5F7A12] dark:text-[#B3CE52]">Verde</span> = vem
                                                            do grupo (muda na aba Grupos).{" "}
                                                            <span className="font-bold text-[#3D6A99] dark:text-[#9CC0E6]">Azul</span> = extra
                                                            só deste usuário.
                                                        </p>
                                                    </div>
                                                    {podeEditar && extrasValidas.length > 0 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => definirPaginas(extrasValidas, false)}
                                                            className={BTN_SECUNDARIO}
                                                        >
                                                            Remover extras
                                                        </button>
                                                    ) : null}
                                                </div>

                                                <AvisoPaginasAntigas
                                                    chaves={extrasAntigas}
                                                    podeLimpar={podeEditar}
                                                    onLimpar={() => definirPaginas(extrasAntigas, false)}
                                                />

                                                <div className="mt-4">
                                                    <ListaPaginas
                                                        key={`u-${userId}`}
                                                        prefixo="pg"
                                                        pages={pages}
                                                        estadoDe={(k) =>
                                                            paginasDoGrupo.has(k) ? "grupo" : allowed[k] ? "marcada" : "livre"
                                                        }
                                                        onToggle={togglePagina}
                                                        onDefinirSecao={definirPaginas}
                                                        bloqueado={!podeEditar}
                                                        seloDe={(k) =>
                                                            paginasDoGrupo.has(k) ? "grupo" : allowed[k] ? "extra" : null
                                                        }
                                                    />
                                                </div>
                                            </>
                                        ) : null}

                                        {aba === "conhecimento" ? (
                                            <>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <div className="min-w-[min(100%,240px)] flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="text-lg font-extrabold">Conhecimento da Aurora</h3>
                                                            <Contador n={departamentosMarcados} total={departamentos.length} />
                                                        </div>
                                                        <p className={`mt-1 text-sm ${TXT_SEC}`}>
                                                            Departamentos da Base de Conhecimento que a Aurora pode usar nas respostas
                                                            deste usuário.
                                                        </p>
                                                    </div>
                                                    <div className="flex shrink-0 gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setAllowedDepartamentos(
                                                                    Object.fromEntries(departamentos.map((d) => [String(d.id), true])),
                                                                )
                                                            }
                                                            disabled={departamentos.length === 0}
                                                            className={BTN_SECUNDARIO}
                                                        >
                                                            Marcar tudo
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAllowedDepartamentos({})}
                                                            disabled={departamentos.length === 0}
                                                            className={BTN_SECUNDARIO}
                                                        >
                                                            Desmarcar tudo
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                                    {departamentos.map((dep) => (
                                                        <ItemPermissao
                                                            key={dep.id}
                                                            id={`dep-${dep.id}`}
                                                            titulo={dep.nome}
                                                            descricao={dep.descricao}
                                                            estado={allowedDepartamentos[String(dep.id)] ? "marcada" : "livre"}
                                                            onToggle={() => toggleEm(setAllowedDepartamentos, String(dep.id))}
                                                        />
                                                    ))}
                                                    {departamentos.length === 0 ? (
                                                        <p className={`text-sm ${TXT_SEC}`}>Nenhum departamento cadastrado.</p>
                                                    ) : null}
                                                </div>
                                            </>
                                        ) : null}

                                        {aba === "ferramentas" ? (
                                            <>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <div className="min-w-[min(100%,240px)] flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="text-lg font-extrabold">Funções da Aurora</h3>
                                                            <Contador n={ferramentasMarcadas} total={ferramentas.length} />
                                                        </div>
                                                        <p className={`mt-1 text-sm ${TXT_SEC}`}>
                                                            Consultas e ações que a Aurora pode executar para este usuário. As de{" "}
                                                            <b>ação</b> alteram dados.
                                                        </p>
                                                    </div>
                                                    <div className="flex shrink-0 gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setAllowedFerramentas(
                                                                    Object.fromEntries(ferramentas.map((t) => [t.key, true])),
                                                                )
                                                            }
                                                            disabled={ferramentas.length === 0}
                                                            className={BTN_SECUNDARIO}
                                                        >
                                                            Marcar tudo
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAllowedFerramentas({})}
                                                            disabled={ferramentas.length === 0}
                                                            className={BTN_SECUNDARIO}
                                                        >
                                                            Desmarcar tudo
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="mt-4 space-y-3">
                                                    {Object.entries(ferramentasPorGrupo).map(([grupo, tools]) => {
                                                        const n = tools.filter((t) => allowedFerramentas[t.key]).length;
                                                        return (
                                                            <section
                                                                key={grupo}
                                                                className="overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12]"
                                                            >
                                                                <div className="flex items-center gap-2 bg-[#F6F8FB] px-4 py-2.5 dark:bg-[#1C2334]">
                                                                    <span className="flex-1 truncate text-sm font-extrabold">{grupo}</span>
                                                                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold dark:bg-white/10">
                                                                        {n}/{tools.length}
                                                                    </span>
                                                                </div>
                                                                <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
                                                                    {tools.map((tool) => (
                                                                        <ItemPermissao
                                                                            key={tool.key}
                                                                            id={`tool-${tool.key}`}
                                                                            titulo={tool.label}
                                                                            estado={allowedFerramentas[tool.key] ? "marcada" : "livre"}
                                                                            onToggle={() => toggleEm(setAllowedFerramentas, tool.key)}
                                                                            sensivel={tool.tipo === "acao"}
                                                                            selo={tool.tipo === "acao" ? "ação" : "consulta"}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            </section>
                                                        );
                                                    })}
                                                    {ferramentas.length === 0 ? (
                                                        <p className={`text-sm ${TXT_SEC}`}>Nenhuma função cadastrada.</p>
                                                    ) : null}
                                                </div>
                                            </>
                                        ) : null}
                                    </div>

                                    <BarraAlteracoes
                                        alteracoes={alteracoesUsuario}
                                        salvando={loading}
                                        rotuloSalvar="Salvar permissões"
                                        onDescartar={restaurarUsuario}
                                        onSalvar={save}
                                    />
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ============================== Janelas ============================== */}

            {descartar ? (
                <Janela
                    titulo="Descartar alterações?"
                    subtitulo="Há alterações que ainda não foram salvas."
                    icone={<IconAlertTriangle size={24} stroke={2} className="text-[#C79A0A] dark:text-[#F2CB3F]" />}
                    onClose={() => setDescartar(null)}
                    rodape={
                        <>
                            <button type="button" onClick={() => setDescartar(null)} className={BTN_SECUNDARIO}>
                                Continuar editando
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const { acao } = descartar;
                                    setDescartar(null);
                                    // volta ao que está salvo e segue
                                    if (modo === "grupos") restaurarGrupo();
                                    else restaurarUsuario();
                                    acao();
                                }}
                                className={BTN_PERIGO}
                            >
                                Descartar
                            </button>
                        </>
                    }
                >
                    <p className="text-sm">Se continuar, as marcações feitas aqui serão perdidas.</p>
                </Janela>
            ) : null}

            {trocaGrupo && resumoTroca ? (
                <Janela
                    titulo="Trocar de grupo?"
                    subtitulo={`${nomeUsuario(trocaGrupo.uid)}: ${resumoTroca.de} → ${resumoTroca.para}`}
                    icone={<IconUsersGroup size={24} stroke={1.8} className="text-[#3D6A99] dark:text-[#9CC0E6]" />}
                    onClose={() => {
                        if (!loading) setTrocaGrupo(null);
                    }}
                    podeFechar={!loading}
                    rodape={
                        <>
                            <button type="button" onClick={() => setTrocaGrupo(null)} disabled={loading} className={BTN_SECUNDARIO}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => void mudarGrupo(trocaGrupo.uid, trocaGrupo.para)}
                                disabled={loading}
                                className={BTN_PRIMARIO}
                            >
                                {loading ? "Trocando…" : "Trocar grupo"}
                            </button>
                        </>
                    }
                >
                    <p className={`text-sm ${TXT_SEC}`}>A troca vale na hora. As páginas extras deste usuário continuam.</p>
                    {resumoTroca.perde.length === 0 && resumoTroca.ganha.length === 0 ? (
                        <p className="mt-4 text-sm font-semibold">
                            Os dois grupos liberam as mesmas páginas para este usuário.
                        </p>
                    ) : null}
                    {resumoTroca.perde.length > 0 ? (
                        <div className="mt-4">
                            <div className="text-sm font-extrabold text-red-700 dark:text-[#FF9C92]">
                                Perde {resumoTroca.perde.length} {plural(resumoTroca.perde.length, "página", "páginas")}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {resumoTroca.perde.map((k) => (
                                    <span
                                        key={k}
                                        className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"
                                    >
                                        {rotuloPagina.get(k) ?? k}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    {resumoTroca.ganha.length > 0 ? (
                        <div className="mt-4">
                            <div className="text-sm font-extrabold text-[#5F7A12] dark:text-[#B3CE52]">
                                Ganha {resumoTroca.ganha.length} {plural(resumoTroca.ganha.length, "página", "páginas")}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {resumoTroca.ganha.map((k) => (
                                    <span
                                        key={k}
                                        className={[
                                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                                            PAGINAS_SENSIVEIS.has(k)
                                                ? "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92] dark:ring-[#FF9C92]/40"
                                                : "bg-[#B3CE52]/20 text-[#3F5410] dark:text-[#B3CE52]",
                                        ].join(" ")}
                                    >
                                        {PAGINAS_SENSIVEIS.has(k) ? <IconShieldLock size={12} stroke={2} /> : null}
                                        {rotuloPagina.get(k) ?? k}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    {alteracoesUsuario > 0 ? (
                        <div className="mt-4">
                            <Aviso tom="atencao">
                                Há {alteracoesUsuario} {plural(alteracoesUsuario, "alteração não salva", "alterações não salvas")} neste
                                usuário. Elas continuam na tela; salve depois da troca.
                            </Aviso>
                        </div>
                    ) : null}
                </Janela>
            ) : null}

            {confirmarDesativar ? (
                <Janela
                    titulo={`Desativar o grupo ${confirmarDesativar.nome}?`}
                    icone={<IconAlertTriangle size={24} stroke={2} className="text-red-600 dark:text-[#FF9C92]" />}
                    onClose={() => {
                        if (!loading) setConfirmarDesativar(null);
                    }}
                    podeFechar={!loading}
                    rodape={
                        <>
                            <button
                                type="button"
                                onClick={() => setConfirmarDesativar(null)}
                                disabled={loading}
                                className={BTN_SECUNDARIO}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => void alternarAtivoGrupo(confirmarDesativar)}
                                disabled={loading}
                                className={BTN_PERIGO}
                            >
                                {loading ? "Desativando…" : "Desativar grupo"}
                            </button>
                        </>
                    }
                >
                    <p className="text-sm">
                        {confirmarDesativar.membros.length > 0 ? (
                            <>
                                <b>
                                    {confirmarDesativar.membros.length}{" "}
                                    {plural(confirmarDesativar.membros.length, "usuário", "usuários")}
                                </b>{" "}
                                deste grupo perdem as páginas do grupo e ficam só com as extras até serem movidos para outro
                                grupo.
                            </>
                        ) : (
                            "O grupo não tem membros. Ele deixa de aparecer na escolha de grupo dos usuários."
                        )}
                    </p>
                </Janela>
            ) : null}
        </div>
    );
}
