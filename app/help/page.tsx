"use client";

/**
 * Ajuda (/help) — Manual do app PAI.
 *
 * 27/10/2026: a antiga "Dicas & Boas Práticas" virou o manual de uso de cada tela.
 * - Conteúdo em components/manual.ts (um tópico por tela, com o id da tela no menu).
 * - Agrupa pelos módulos do menu (useMenu: segue o Organizar menu da Gestão) e mostra primeiro só as telas
 *   que o usuário pode abrir (usePerms). "Todas as telas" mostra o manual inteiro.
 * - Busca sem acento em tudo (título, passos, dicas, perguntas e palavras-chave).
 * - Link direto para um tópico: /help#<id> (ex.: /help#atendimentos). O botão "Abrir tela" leva à tela.
 * Não chama nenhuma API nova e não muda permissões: a chave "help" continua como está.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    IconArrowRight,
    IconBook,
    IconChevronDown,
    IconHelp,
    IconInfoCircle,
    IconLink,
    IconPalette,
    IconQuestionMark,
    IconSearch,
    IconBulb,
    IconX,
} from "@tabler/icons-react";
import { usePerms } from "@/app/_perms/PermsProvider";
import { FIXOS, MODULOS, hrefDoItem, itemVisivel, type Icone, type ItemModulo } from "@/components/shell/modulos";
import { useMenu } from "@/components/shell/useMenu";
import { FAQ_GERAL, GUIA_ID, TOPICOS, type Passo, type Topico } from "./components/manual";

/* ============================== utilidades ============================== */

/** Minúsculas e sem acento, para a busca. */
function normalizar(s: string): string {
    return String(s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\*\*/g, "")
        .toLowerCase();
}

function textoDoTopico(t: Topico): string {
    const passos = (t.passos || [])
        .map((p) => (typeof p === "string" ? p : `${p.titulo} ${p.passos.join(" ")}`))
        .join(" ");
    const faq = (t.faq || []).map((f) => `${f.p} ${f.r}`).join(" ");
    return normalizar(
        [t.titulo, t.rota || "", t.resumo, passos, (t.cores || []).join(" "), (t.dicas || []).join(" "), faq, (t.chaves || []).join(" ")].join(" "),
    );
}

/** Texto com **negrito**. */
function Rico({ t }: { t: string }) {
    const partes = String(t).split(/\*\*(.+?)\*\*/g);
    return (
        <>
            {partes.map((p, i) =>
                i % 2 === 1 ? (
                    <strong key={i} className="font-extrabold text-[#313C55] dark:text-white">
                        {p}
                    </strong>
                ) : (
                    <React.Fragment key={i}>{p}</React.Fragment>
                ),
            )}
        </>
    );
}

/* ============================== tipos da tela ============================== */

type Grupo = {
    id: string;
    titulo: string;
    desc: string;
    icone: Icone;
    topicos: TopicoPronto[];
};

type TopicoPronto = Topico & {
    icone: Icone;
    /** Item do menu que o usuário pode abrir (para o botão "Abrir tela"). */
    item: ItemModulo | null;
    /** true = o usuário tem alguma das telas do tópico (ou é tópico geral). */
    meu: boolean;
    busca: string;
};

const GUIA_GRUPO = { id: GUIA_ID, titulo: "Primeiros passos", desc: "Entrar, navegar e personalizar o app", icone: IconBook as Icone };
const OUTROS_ID = "outros";

/* ============================== página ============================== */

export default function AjudaPage() {
    const { perms, has } = usePerms();
    const menu = useMenu();

    const [busca, setBusca] = useState("");
    const [escopo, setEscopo] = useState<"meus" | "todos">("meus");
    const [grupoSel, setGrupoSel] = useState<string>("tudo");
    const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
    const buscaRef = useRef<HTMLInputElement>(null);

    // Sem permissões carregadas ainda: mostra tudo (evita a tela vazia piscando).
    // Depende só da lista de permissões (não da função has), para o cálculo não refazer a cada render.
    const chavePerms = perms == null ? "" : perms.join("|");
    const hasRef = useRef(has);
    hasRef.current = has;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const pode = useCallback((slug: string) => (perms == null ? true : hasRef.current(slug)), [chavePerms, perms == null]);

    /* ---- tópicos com módulo, ícone e permissão ---- */
    const { grupos, todosTopicos } = useMemo(() => {
        const modulos = menu.modulos && menu.modulos.length ? menu.modulos : MODULOS;
        const fixos = menu.fixos && menu.fixos.length ? menu.fixos : FIXOS;

        // Onde cada tela está no menu agora (organização da Gestão) e o item de cada id.
        const moduloDoItem = new Map<string, string>();
        const itemPorId = new Map<string, ItemModulo>();
        for (const m of modulos) {
            for (const i of m.itens) {
                if (!moduloDoItem.has(i.id)) moduloDoItem.set(i.id, m.id);
                if (!itemPorId.has(i.id)) itemPorId.set(i.id, i);
            }
        }
        for (const f of [...fixos, ...FIXOS]) if (!itemPorId.has(f.id)) itemPorId.set(f.id, f);
        for (const m of MODULOS) for (const i of m.itens) if (!itemPorId.has(i.id)) itemPorId.set(i.id, i);

        const prontos: TopicoPronto[] = TOPICOS.map((t) => {
            const itens = t.menuIds.map((id) => itemPorId.get(id)).filter(Boolean) as ItemModulo[];
            const visiveis = itens.filter((i) => itemVisivel(i, pode));
            const meu = t.menuIds.length === 0 || visiveis.length > 0;
            const principal = visiveis[0] || null;
            const moduloAtual = t.menuIds.map((id) => moduloDoItem.get(id)).find(Boolean);
            const modulo = t.modulo === GUIA_ID ? GUIA_ID : moduloAtual || t.modulo;
            const icone: Icone = (itens[0]?.icone as Icone) || (t.modulo === GUIA_ID ? IconInfoCircle : IconBook);
            return { ...t, modulo, icone, item: principal, meu, busca: textoDoTopico(t) };
        });

        const lista: Grupo[] = [{ ...GUIA_GRUPO, topicos: [] }];
        for (const m of modulos) lista.push({ id: m.id, titulo: m.titulo, desc: m.desc, icone: m.icone, topicos: [] });
        const outros: Grupo = { id: OUTROS_ID, titulo: "Outras telas", desc: "Telas fora dos módulos do menu", icone: IconBook, topicos: [] };

        for (const t of prontos) {
            const g = lista.find((x) => x.id === t.modulo) || outros;
            g.topicos.push(t);
        }
        if (outros.topicos.length) lista.push(outros);
        return { grupos: lista, todosTopicos: prontos };
    }, [menu.modulos, menu.fixos, pode]);

    /* ---- filtro (escopo + busca + grupo) ---- */
    const termo = normalizar(busca.trim());
    const palavras = termo.split(/\s+/).filter(Boolean);

    const gruposFiltrados = useMemo(() => {
        return grupos
            .map((g) => ({
                ...g,
                topicos: g.topicos.filter((t) => {
                    if (escopo === "meus" && !t.meu) return false;
                    if (palavras.length && !palavras.every((p) => t.busca.indexOf(p) >= 0)) return false;
                    return true;
                }),
            }))
            .filter((g) => g.topicos.length > 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [grupos, escopo, termo]);

    const visiveis = grupoSel === "tudo" ? gruposFiltrados : gruposFiltrados.filter((g) => g.id === grupoSel);
    const totalResultados = visiveis.reduce((n, g) => n + g.topicos.length, 0);
    const ocultosPorPermissao = escopo === "meus" ? todosTopicos.filter((t) => !t.meu).length : 0;

    // Grupo escolhido sumiu com o filtro: volta para "Tudo".
    useEffect(() => {
        if (grupoSel !== "tudo" && !gruposFiltrados.some((g) => g.id === grupoSel)) setGrupoSel("tudo");
    }, [gruposFiltrados, grupoSel]);

    // Busca com poucos resultados: abre todos.
    useEffect(() => {
        if (!palavras.length) return;
        const ids = visiveis.flatMap((g) => g.topicos.map((t) => t.id));
        if (ids.length > 0 && ids.length <= 3) setAbertos(new Set(ids));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [termo]);

    /* ---- link direto (/help#id) ----
       Roda ao abrir a tela e quando o endereço muda (hashchange). Lê os tópicos por ref para não
       depender de referências que mudam a cada render (evita laço de atualização). */
    const topicosRef = useRef<TopicoPronto[]>(todosTopicos);
    topicosRef.current = todosTopicos;

    useEffect(() => {
        const abrirPorHash = () => {
            const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
            if (!id) return;
            const t = topicosRef.current.find((x) => x.id === id);
            if (!t) return;
            if (!t.meu) setEscopo("todos");
            setGrupoSel("tudo");
            setAbertos((a) => (a.has(id) ? a : new Set(a).add(id)));
            window.setTimeout(() => document.getElementById(`ajuda-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
        };
        abrirPorHash();
        window.addEventListener("hashchange", abrirPorHash);
        return () => window.removeEventListener("hashchange", abrirPorHash);
    }, []);

    const alternar = (id: string) => {
        setAbertos((a) => {
            const n = new Set(a);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
        });
        try {
            window.history.replaceState(null, "", `#${id}`);
        } catch {
            /* sem histórico: segue normal */
        }
    };

    const limparBusca = () => {
        setBusca("");
        buscaRef.current?.focus();
    };

    const irParaGrupo = (id: string) => {
        setGrupoSel(id);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    /* ============================== render ============================== */

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                {/* Cabeçalho */}
                <div className="mb-5 flex items-center gap-4">
                    <span className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]">
                        <IconHelp size={28} />
                    </span>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-extrabold leading-tight lg:text-[28px]">Ajuda</h1>
                        <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF] lg:text-[15px]">
                            Manual do app PAI: para que serve cada tela e como usar, passo a passo.
                        </p>
                    </div>
                </div>

                {/* Busca e escopo */}
                <div className="mb-4 rounded-2xl border border-[#E3E8F0] bg-white p-3 shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F] sm:p-4">
                    <label htmlFor="ajuda-busca" className="mb-1.5 block text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                        O que você quer fazer?
                    </label>
                    <div className="relative">
                        <IconSearch size={20} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8396]" />
                        <input
                            id="ajuda-busca"
                            ref={buscaRef}
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            placeholder="Ex.: assinar OS, cancelar requisição, Pix, corpo pronto"
                            className="h-12 w-full rounded-xl border-0 bg-[#F1F4F8] pl-11 pr-12 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334] dark:text-white"
                            autoComplete="off"
                            enterKeyHint="search"
                        />
                        {busca ? (
                            <button
                                type="button"
                                onClick={limparBusca}
                                aria-label="Limpar busca"
                                className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-[#5B6478] hover:bg-[#E3E8F0] dark:text-[#AEB9CF] dark:hover:bg-white/[0.08]"
                            >
                                <IconX size={18} />
                            </button>
                        ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div role="tablist" aria-label="Quais telas mostrar" className="inline-flex rounded-xl bg-[#F1F4F8] p-1 dark:bg-[#1C2334]">
                            {(
                                [
                                    ["meus", "Minhas telas"],
                                    ["todos", "Todas as telas"],
                                ] as const
                            ).map(([v, r]) => (
                                <button
                                    key={v}
                                    type="button"
                                    role="tab"
                                    aria-selected={escopo === v}
                                    onClick={() => setEscopo(v)}
                                    className={[
                                        "min-h-10 rounded-lg px-3.5 text-[14px] font-extrabold transition",
                                        escopo === v
                                            ? "bg-[#313C55] text-white shadow-sm dark:bg-[#3D6A99]"
                                            : "text-[#5B6478] hover:text-[#313C55] dark:text-[#AEB9CF] dark:hover:text-white",
                                    ].join(" ")}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                        <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                            {totalResultados} {totalResultados === 1 ? "tópico" : "tópicos"}
                            {ocultosPorPermissao > 0 ? ` · ${ocultosPorPermissao} de telas que você não usa` : ""}
                        </span>
                    </div>
                </div>

                {/* Módulos (chips; no computador ficam também no índice lateral) */}
                <div className="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:hidden">
                    <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
                        <Chip ativo={grupoSel === "tudo"} onClick={() => irParaGrupo("tudo")} rotulo="Tudo" />
                        {gruposFiltrados.map((g) => (
                            <Chip key={g.id} ativo={grupoSel === g.id} onClick={() => irParaGrupo(g.id)} rotulo={g.titulo} n={g.topicos.length} />
                        ))}
                    </div>
                </div>

                <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
                    {/* Índice lateral (computador) */}
                    <nav aria-label="Módulos da ajuda" className="hidden lg:block">
                        <div className="sticky top-4 space-y-1">
                            <IndiceItem ativo={grupoSel === "tudo"} onClick={() => irParaGrupo("tudo")} rotulo="Tudo" icone={IconBook} />
                            {gruposFiltrados.map((g) => (
                                <IndiceItem key={g.id} ativo={grupoSel === g.id} onClick={() => irParaGrupo(g.id)} rotulo={g.titulo} icone={g.icone} n={g.topicos.length} />
                            ))}
                        </div>
                    </nav>

                    {/* Conteúdo */}
                    <div className="min-w-0">
                        {totalResultados === 0 ? (
                            <div className="rounded-2xl border border-[#E3E8F0] bg-white p-6 text-center dark:border-white/[0.12] dark:bg-[#232B3F]">
                                <p className="text-[15px] font-extrabold">Nada encontrado.</p>
                                <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                                    Tente outra palavra
                                    {escopo === "meus" ? " ou veja em Todas as telas" : ""}.
                                </p>
                                <div className="mt-4 flex flex-wrap justify-center gap-2">
                                    {busca ? (
                                        <button type="button" onClick={limparBusca} className="min-h-11 rounded-xl border border-[#C9D1DE] bg-white px-4 text-[14px] font-extrabold dark:border-white/[0.2] dark:bg-[#232B3F]">
                                            Limpar busca
                                        </button>
                                    ) : null}
                                    {escopo === "meus" ? (
                                        <button type="button" onClick={() => setEscopo("todos")} className="min-h-11 rounded-xl bg-[#313C55] px-4 text-[14px] font-extrabold text-white dark:bg-[#F2CB3F] dark:text-[#313C55]">
                                            Ver todas as telas
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-7">
                                {visiveis.map((g) => {
                                    const GI = g.icone;
                                    return (
                                        <section key={g.id} aria-labelledby={`grupo-${g.id}`}>
                                            <div className="mb-2.5 flex items-center gap-2.5">
                                                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white">
                                                    <GI size={19} />
                                                </span>
                                                <div className="min-w-0">
                                                    <h2 id={`grupo-${g.id}`} className="text-[17px] font-extrabold leading-tight">
                                                        {g.titulo}
                                                    </h2>
                                                    <p className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{g.desc}</p>
                                                </div>
                                            </div>
                                            <div className="space-y-2.5">
                                                {g.topicos.map((t) => (
                                                    <CartaoTopico
                                                        key={t.id}
                                                        t={t}
                                                        aberto={abertos.has(t.id)}
                                                        onAlternar={() => alternar(t.id)}
                                                        href={t.item ? hrefDoItem(t.item, pode) : null}
                                                    />
                                                ))}
                                            </div>
                                        </section>
                                    );
                                })}

                                {/* Perguntas gerais */}
                                {!palavras.length && (grupoSel === "tudo" || grupoSel === GUIA_ID) ? (
                                    <section aria-labelledby="ajuda-faq">
                                        <h2 id="ajuda-faq" className="mb-2.5 text-[17px] font-extrabold">
                                            Dúvidas gerais
                                        </h2>
                                        <div className="divide-y divide-[#E3E8F0] rounded-2xl border border-[#E3E8F0] bg-white dark:divide-white/[0.08] dark:border-white/[0.12] dark:bg-[#232B3F]">
                                            {FAQ_GERAL.map((f) => (
                                                <div key={f.p} className="p-4">
                                                    <p className="text-[15px] font-extrabold">{f.p}</p>
                                                    <p className="mt-1 text-[14px] leading-relaxed text-[#4A5368] dark:text-[#C8CFDC]">{f.r}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                ) : null}
                            </div>
                        )}

                        <p className="mt-8 text-center text-xs text-[#7A8396]">
                            Não achou o que precisava? Pergunte à Aurora no Chat ou fale com a Gestão.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ============================== peças ============================== */

function Chip({ ativo, onClick, rotulo, n }: { ativo: boolean; onClick: () => void; rotulo: string; n?: number }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={ativo}
            className={[
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 text-[14px] font-extrabold transition",
                ativo
                    ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                    : "border-[#E3E8F0] bg-white text-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#C8CFDC]",
            ].join(" ")}
        >
            {rotulo}
            {typeof n === "number" ? <span className={ativo ? "text-white/75" : "text-[#7A8396]"}>{n}</span> : null}
        </button>
    );
}

function IndiceItem({ ativo, onClick, rotulo, icone: I, n }: { ativo: boolean; onClick: () => void; rotulo: string; icone: Icone; n?: number }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={ativo ? "true" : undefined}
            className={[
                "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[14px] font-bold transition",
                ativo
                    ? "bg-[#313C55] text-white dark:bg-[#3D6A99]"
                    : "text-[#313C55] hover:bg-[#E9EFF6] dark:text-[#C8CFDC] dark:hover:bg-white/[0.06]",
            ].join(" ")}
        >
            <I size={18} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{rotulo}</span>
            {typeof n === "number" ? <span className={ativo ? "text-white/75" : "text-[#7A8396]"}>{n}</span> : null}
        </button>
    );
}

function Bloco({ titulo, icone: I, children }: { titulo: string; icone: Icone; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="mb-2 flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                <I size={16} />
                {titulo}
            </h3>
            {children}
        </div>
    );
}

function ListaPassos({ passos }: { passos: Passo[] }) {
    let n = 0;
    return (
        <ol className="space-y-2.5">
            {passos.map((p, i) => {
                if (typeof p === "string") {
                    n += 1;
                    return (
                        <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#313C55] text-[12px] font-extrabold text-white dark:bg-[#3D6A99]">{n}</span>
                            <span className="min-w-0">
                                <Rico t={p} />
                            </span>
                        </li>
                    );
                }
                return (
                    <li key={i} className="rounded-xl bg-[#F6F8FB] p-3 dark:bg-[#1C2334]">
                        <p className="mb-2 text-[14px] font-extrabold">{p.titulo}</p>
                        <ol className="space-y-2">
                            {p.passos.map((s, k) => (
                                <li key={k} className="flex gap-2.5 text-[15px] leading-relaxed">
                                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-[#A9BED6] text-[11px] font-extrabold text-[#313C55] dark:border-[#3D6A99] dark:text-white">
                                        {k + 1}
                                    </span>
                                    <span className="min-w-0">
                                        <Rico t={s} />
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </li>
                );
            })}
        </ol>
    );
}

function Marcadores({ itens }: { itens: string[] }) {
    return (
        <ul className="space-y-1.5">
            {itens.map((d, i) => (
                <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed">
                    <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[#7A8396]" />
                    <span className="min-w-0">
                        <Rico t={d} />
                    </span>
                </li>
            ))}
        </ul>
    );
}

function CartaoTopico({ t, aberto, onAlternar, href }: { t: TopicoPronto; aberto: boolean; onAlternar: () => void; href: string | null }) {
    const I = t.icone;
    const [copiado, setCopiado] = useState(false);

    const copiarLink = async () => {
        try {
            const url = `${window.location.origin}/help#${t.id}`;
            await navigator.clipboard.writeText(url);
            setCopiado(true);
            window.setTimeout(() => setCopiado(false), 1800);
        } catch {
            /* sem área de transferência: ignora */
        }
    };

    return (
        <article id={`ajuda-${t.id}`} className="scroll-mt-4 overflow-hidden rounded-2xl border border-[#E3E8F0] bg-white shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F]">
            <button
                type="button"
                onClick={onAlternar}
                aria-expanded={aberto}
                aria-controls={`ajuda-corpo-${t.id}`}
                className="flex min-h-[64px] w-full items-center gap-3.5 p-4 text-left transition hover:bg-[#F6F8FB] dark:hover:bg-white/[0.03]"
            >
                <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white">
                    <I size={22} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[16px] font-extrabold leading-snug">{t.titulo}</span>
                        {!t.meu ? (
                            <span className="rounded-md bg-[#F1F4F8] px-1.5 py-0.5 text-[11px] font-bold text-[#5B6478] dark:bg-white/[0.08] dark:text-[#AEB9CF]">sem acesso</span>
                        ) : null}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-[#5B6478] dark:text-[#AEB9CF]">{t.resumo}</span>
                </span>
                <IconChevronDown size={20} className={["shrink-0 text-[#7A8396] transition-transform", aberto ? "rotate-180" : ""].join(" ")} />
            </button>

            {aberto ? (
                <div id={`ajuda-corpo-${t.id}`} className="space-y-5 border-t border-[#E3E8F0] p-4 text-[#2B3448] dark:border-white/[0.08] dark:text-[#DDE3EE] sm:p-5">
                    <Bloco titulo="Como usar" icone={IconArrowRight}>
                        <ListaPassos passos={t.passos} />
                    </Bloco>

                    {t.cores && t.cores.length ? (
                        <Bloco titulo="Botões, status e cores" icone={IconPalette}>
                            <Marcadores itens={t.cores} />
                        </Bloco>
                    ) : null}

                    {t.dicas && t.dicas.length ? (
                        <Bloco titulo="Dicas e cuidados" icone={IconBulb}>
                            <div className="rounded-xl border border-[#F2CB3F]/60 bg-[#FCF3CC]/60 p-3 dark:border-[#F2CB3F]/30 dark:bg-[#F2CB3F]/[0.08]">
                                <Marcadores itens={t.dicas} />
                            </div>
                        </Bloco>
                    ) : null}

                    {t.faq && t.faq.length ? (
                        <Bloco titulo="Perguntas frequentes" icone={IconQuestionMark}>
                            <div className="space-y-3">
                                {t.faq.map((f) => (
                                    <div key={f.p}>
                                        <p className="text-[15px] font-extrabold">{f.p}</p>
                                        <p className="mt-0.5 text-[15px] leading-relaxed text-[#4A5368] dark:text-[#C8CFDC]">
                                            <Rico t={f.r} />
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </Bloco>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 border-t border-[#E3E8F0] pt-4 dark:border-white/[0.08]">
                        {href && t.meu ? (
                            <Link
                                href={href}
                                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#313C55] px-4 text-[14px] font-extrabold text-white hover:bg-[#232B40] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]"
                            >
                                Abrir tela
                                <IconArrowRight size={18} />
                            </Link>
                        ) : null}
                        <button
                            type="button"
                            onClick={copiarLink}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#C9D1DE] bg-white px-4 text-[14px] font-extrabold text-[#313C55] hover:border-[#313C55] dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-white"
                        >
                            <IconLink size={18} />
                            {copiado ? "Link copiado" : "Copiar link desta ajuda"}
                        </button>
                        {t.rota ? <span className="ml-auto text-[12px] text-[#7A8396]">{t.rota}</span> : null}
                    </div>
                </div>
            ) : null}
        </article>
    );
}
