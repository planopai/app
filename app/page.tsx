"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
    IconAlertTriangle,
    IconBuildingSkyscraper,
    IconChevronRight,
    IconFileText,
    IconFlower,
    IconPlus,
    IconSearch,
    IconStar,
    IconStarFilled,
    IconTruckDelivery,
    IconX,
} from "@tabler/icons-react";
import { usePerms } from "./_perms/PermsProvider";
import { useNaoLidas } from "@/components/messenger/ContadorMenu";
import { destinoDoModulo, hrefDoItem, itemVisivel, moduloVisivel, type Icone } from "@/components/shell/modulos";
import { useMenu } from "@/components/shell/useMenu";
import { formatarSelo, useContadores } from "@/components/shell/useContadores";
import { BlocoTela, CartaoInfo, GRADE_BLOCOS, GRADE_CARTOES, ROTULO_SECAO, TOM_DO_MODULO } from "@/components/shell/ModuloHub";

/**
 * Tela inicial (rota "/"): junta o visual aprovado da repaginada com o que a home anterior já tinha.
 *
 * Da home anterior ficaram: o relógio, a pesquisa de funções (só entram páginas permitidas; casa pelo começo do título),
 * o contador do Messenger (não lidas + fila de clientes) e o filtro por permissões (`usePerms`).
 * Novos: boas-vindas com o nome, resumo de números, "Acesso rápido" e os módulos do organograma.
 *
 * 15/10/2026 (navegação do Início, sem repetição):
 *  - o Quadro de Atendimentos abre só pelo cartão "Serviços funerários" (saiu o botão do topo e o item do Acesso rápido);
 *  - "Novo orçamento" virou "Orçamentos" (abre a tela com os orçamentos salvos; o novo é criado lá);
 *  - saíram os cartões "Material a recolher" e "Aguardando sua ação";
 *  - "Requisições para separar" só para quem tem a página "requisicoes"; "Alertas de estoque" só para quem tem o Estoque;
 *  - Acesso rápido continua vindo do Organizar menu; o padrão novo está em FIXOS_PADRAO_IDS (modulos.tsx).
 *
 * Os números vêm de useContadores (mesmas consultas da home anterior; atendimentos pela regra do Quadro, concluídos não contam).
 * Quando a consulta falha, mostra "—". Não existe mais a rota /inicio: o Início é esta tela.
 */

type Tom = "azul" | "verde" | "amarelo";

const CHIP: Record<Tom, string> = {
    azul: "bg-[#E9EFF6] dark:bg-[#3D6A99]/30",
    verde: "bg-[#EEF5D6] dark:bg-[#B3CE52]/20",
    amarelo: "bg-[#FCF3CC] dark:bg-[#F2CB3F]/15",
};

const CARD =
    "rounded-2xl border border-[#E3E8F0] bg-white shadow-sm transition hover:border-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:hover:border-white/50";

const TOM_MODULO: Record<string, Tom> = {
    atendimento: "azul",
    comunicacao: "azul",
    requisicoes: "amarelo",
    estoque: "amarelo",
    financeiro: "verde",
    plano: "verde",
    administrativo: "verde",
    gestao: "verde",
};

/** Nomes que as pessoas já usavam na pesquisa (a pesquisa continua achando por eles). */
const APELIDOS: { title: string; href: string; slug: string; group: string }[] = [
    { title: "Quadro de Acompanhamento", href: "/quadro-acompanhamento", slug: "quadro-acompanhamento", group: "Atendimento" },
    { title: "Serviços Funerários", href: "/servicos-funerarios", slug: "servicos-funerarios", group: "Atendimento" },
    { title: "Descontos", href: "/parceiros", slug: "parceiros", group: "Plano" },
    { title: "Enviar Notícias", href: "/noticias", slug: "noticias", group: "Plano" },
    { title: "Médicos Parceiros", href: "/medicos", slug: "medicos", group: "Plano" },
    { title: "Relatório de Consultas", href: "/relatorio-guias", slug: "relatorio-guias", group: "Administrativo" },
    { title: "Painel de Atendimentos", href: "/desempenho", slug: "desempenho", group: "Gestão" },
    { title: "Consulta de Produtos", href: "/produtos", slug: "produtos", group: "Estoque" },
    { title: "Relatório", href: "/relatorio", slug: "relatorio", group: "Gestão" },
    { title: "Requisição de Material", href: "/requisicao", slug: "requisicao", group: "Requisições" },
];

function normalizeSearch(value: string) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function saudacao(h: number) {
    if (h < 5) return "Boa madrugada";
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
}

function dataExtenso(d: Date) {
    const dias = ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dias[d.getDay()]}, ${dd}/${mm}/${d.getFullYear()}`;
}

function dois(n: number | null) {
    return n == null ? "—" : String(n).padStart(2, "0");
}

/** Itens do módulo que o usuário pode abrir (mesma regra do menu). */
function itensVisiveisDe<T extends { slugs: string[] }>(itens: T[], has: (s: string) => boolean): T[] {
    return itens.filter((i) => i.slugs.includes("*") || i.slugs.some((s) => has(s)));
}

export default function HomePage() {
    const { perms, has } = usePerms();
    const c = useContadores(perms, has);
    const [agora, setAgora] = useState<Date | null>(null);
    const [busca, setBusca] = useState("");

    /* Messenger: não lidas + fila de clientes (tempo real) */
    const temMessenger = perms !== null && has("messenger");
    const naoLidas = useNaoLidas(temMessenger);
    const contMessenger = naoLidas.carregado ? naoLidas.total + naoLidas.fila : null;

    useEffect(() => {
        setAgora(new Date());
        const t = window.setInterval(() => setAgora(new Date()), 1000);
        return () => window.clearInterval(t);
    }, []);

    const pronto = perms !== null;
    const nome = c.nome ? c.nome.trim().split(/\s+/)[0] : "";

    const resumo = useMemo(() => {
        // 06/11/2026: cartões no padrão das páginas (rótulo, número e complemento; 4 colunas fixas)
        const itens: { label: string; sub: string; estilo?: "escuro" | "alerta"; valor: number | null; href: string; tom: Tom; icon: Icone; mostrar: boolean }[] = [
            { label: "Serviços funerários", sub: "em andamento", estilo: "escuro", valor: c.servicos, href: "/quadro-acompanhamento", tom: "azul", icon: IconBuildingSkyscraper, mostrar: true },
            { label: "Coroas de flores", sub: "na fila de confecção", valor: c.coroas, href: "/coroa-de-flores", tom: "verde", icon: IconFlower, mostrar: pronto && has("coroa-de-flores") },
            { label: "Requisições", sub: "para separar", valor: c.requisicoes, href: "/requisicoes", tom: "azul", icon: IconTruckDelivery, mostrar: pronto && has("requisicoes") },
            { label: "Alertas de estoque", sub: "abaixo do mínimo", estilo: "alerta", valor: c.estoque, href: has("estoque") ? "/estoque" : "/geral", tom: "amarelo", icon: IconAlertTriangle, mostrar: pronto && (has("geral") || has("estoque")) },
        ];
        return itens.filter((i) => i.mostrar);
    }, [c, pronto, has]);

    /*
     * Acesso rápido: os itens fixos do menu, menos o Início. A Gestão escolhe os fixos e a ordem em Organizar menu (08/10/2026).
     * 15/10/2026: o padrão passou a ser Minhas OS, Consulta, Solicitar Produto, Minhas Solicitações, Messenger e Chat
     * (FIXOS_PADRAO_IDS no modulos.tsx); Minhas Solicitações mostra o número das requisições abertas do usuário.
     */
    const menu = useMenu();
    /* 06/11/2026: o Início mostra os favoritos do usuário (estrela ao lado do nome da tela), sem limite.
       Quem ainda não favoritou nada vê o Acesso rápido definido pela Gestão. */
    const todasTelas = useMemo(() => {
        const m = new Map<string, { item: (typeof menu.fixos)[number]; modulo: string; tom: string }>();
        for (const mod of menu.modulos) for (const i of mod.itens) if (!m.has(i.id)) m.set(i.id, { item: i, modulo: mod.titulo, tom: TOM_DO_MODULO[mod.id] || "azul" });
        for (const f of menu.fixos) if (!m.has(f.id)) m.set(f.id, { item: f, modulo: "Início", tom: "azul" });
        return m;
    }, [menu.modulos, menu.fixos]);
    const favoritos = useMemo(
        () => (pronto ? menu.favoritos.map((id) => todasTelas.get(id)?.item).filter((i): i is (typeof menu.fixos)[number] => !!i && i.href !== "/" && itemVisivel(i, has)) : []),
        [menu.favoritos, todasTelas, pronto, has],
    );
    const usaFavoritos = favoritos.length > 0;
    const rapidos = useMemo(
        () => (usaFavoritos ? favoritos : menu.fixos.filter((i) => i.href !== "/" && pronto && itemVisivel(i, has))),
        [usaFavoritos, favoritos, menu.fixos, pronto, has],
    );
    const [escolher, setEscolher] = useState(false);
    useEffect(() => {
        if (!escolher) return;
        const k = (e: KeyboardEvent) => {
            if (e.key === "Escape") setEscolher(false);
        };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    }, [escolher]);

    const modulos = pronto ? menu.modulosPessoais.filter((m) => moduloVisivel(m, has)) : [];

    /* Pesquisa de funções: só páginas permitidas; casa pelo começo do título (como antes) */
    const resultados = useMemo(() => {
        const q = normalizeSearch(busca);
        if (!q || !pronto) return [];
        const base: { title: string; href: string; group: string; icone: Icone }[] = [
            ...menu.modulos.flatMap((m) =>
                itensVisiveisDe(m.itens, has).map((i) => ({ title: i.titulo, href: hrefDoItem(i, has), group: m.titulo, icone: i.icone as Icone })),
            ),
            ...menu.fixos.filter((f) => itemVisivel(f, has)).map((f) => ({ title: f.titulo, href: f.href, group: "Início", icone: f.icone as Icone })),
            ...APELIDOS.filter((a) => has(a.slug)).map((a) => ({ title: a.title, href: a.href, group: a.group, icone: IconSearch as Icone })),
        ];
        const vistos = new Set<string>();
        return base.filter((i) => {
            if (!normalizeSearch(i.title).startsWith(q)) return false;
            const k = `${i.title}|${i.href}`;
            if (vistos.has(k)) return false;
            vistos.add(k);
            return true;
        });
    }, [busca, pronto, has, menu.modulos, menu.fixos]);

    const pesquisando = busca.trim() !== "";
    const horas = agora ? agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";

    return (
        <div className="min-h-[calc(100dvh-1px)] bg-[#F6F8FB] pb-[calc(2rem+env(safe-area-inset-bottom))] text-[#313C55] dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
                {/* BOAS-VINDAS */}
                <section className="relative overflow-hidden rounded-[20px] bg-[#313C55] px-5 py-5 text-white sm:px-7">
                    <span aria-hidden className="absolute -right-[70px] -top-[110px] size-[200px] rounded-full bg-[#F2CB3F]" />
                    <span aria-hidden className="absolute -bottom-[70px] right-[62px] size-[116px] rounded-full bg-[#00AEEC]" />
                    <span aria-hidden className="absolute -bottom-[34px] -right-2 size-[70px] rounded-full bg-[#B3CE52]" />

                    <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
                        <div className="min-w-0 flex-1">
                            <div className="text-xs font-extrabold tracking-[0.12em] text-[#B3CE52]">{agora ? dataExtenso(agora) : "\u00A0"}</div>
                            <h1 className="mt-1 text-2xl font-extrabold leading-tight sm:text-[28px]">
                                {agora ? saudacao(agora.getHours()) : "Olá"}
                                {nome ? `, ${nome}` : ""}
                            </h1>
                            <p className="mt-1 text-sm tabular-nums text-[#D6DCE8]">
                                <span className="lg:hidden">Este é o resumo do seu dia. </span>
                                <b className="text-white">{horas}</b>
                            </p>
                        </div>

                        <div className="relative flex flex-wrap gap-3 pr-20 sm:pr-28 lg:mr-44 lg:pr-0">
                            {pronto && has("acompanhamento") ? (
                                <Link href="/acompanhamento" className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-[14px] bg-[#F2CB3F] px-5 text-[15px] font-extrabold text-[#313C55]">
                                    <IconPlus size={18} />
                                    Novo atendimento
                                </Link>
                            ) : null}
                            {/* 13/10/2026: atalho do Orçamento (página "orcamento"). 15/10/2026: abre a lista dos salvos; o novo é criado lá. */}
                            {pronto && has("orcamento") ? (
                                <Link href="/orcamento" className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-[14px] border-[1.5px] border-white px-4 text-[15px] font-extrabold text-white hover:bg-white/10">
                                    <IconFileText size={18} />
                                    Orçamentos
                                </Link>
                            ) : null}
                        </div>
                    </div>
                </section>

                {/* PESQUISA DE FUNÇÕES */}
                <div className="mt-5 flex h-[54px] items-center gap-2 rounded-xl border lg:hidden border-[#E3E8F0] bg-white px-3 shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F]">
                    <IconSearch size={19} className="shrink-0 text-[#7A8396]" />
                    <input
                        type="search"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder={pronto ? "Pesquise" : "Carregando acessos..."}
                        disabled={!pronto}
                        aria-label="Pesquisar funções do sistema"
                        autoComplete="off"
                        className="min-w-0 flex-1 bg-transparent text-base font-medium text-[#313C55] outline-none placeholder:text-[#7A8396] dark:text-white"
                    />
                    {pesquisando ? (
                        <button
                            type="button"
                            onClick={() => setBusca("")}
                            aria-label="Limpar pesquisa"
                            className="grid size-9 shrink-0 place-items-center rounded-lg text-[#5B6478] hover:bg-[#EEF2F7] dark:text-[#AEB9CF] dark:hover:bg-white/10"
                        >
                            <IconX size={18} />
                        </button>
                    ) : null}
                </div>

                {pesquisando ? (
                    /* RESULTADO DA PESQUISA */
                    <section aria-label="Resultado da pesquisa" className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
                        {pronto && resultados.length === 0 ? (
                            <div className={[CARD, "col-span-full border-dashed p-8 text-center"].join(" ")}>
                                <IconSearch size={24} className="mx-auto text-[#7A8396]" />
                                <div className="mt-3 text-sm font-black">Nenhuma função encontrada</div>
                                <div className="mt-1 text-xs text-[#5B6478] dark:text-[#AEB9CF]">Não há páginas permitidas que correspondam a “{busca.trim()}”.</div>
                            </div>
                        ) : null}
                        {resultados.map((r) => {
                            const Icon = r.icone;
                            return (
                                <Link key={`${r.title}-${r.href}`} href={r.href} className={[CARD, "flex items-center gap-3.5 p-4"].join(" ")}>
                                    <span className={["grid size-11 shrink-0 place-items-center rounded-[14px] text-[#313C55] dark:text-white", CHIP.azul].join(" ")}>
                                        <Icon size={22} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[15px] font-extrabold">{r.title}</span>
                                        <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{r.group}</span>
                                    </span>
                                    <IconChevronRight size={18} className="shrink-0 text-[#7A8396]" />
                                </Link>
                            );
                        })}
                    </section>
                ) : (
                    <>
                        {/* RESUMO */}
                        {resumo.length ? (
                            <section aria-label="Resumo" className={`mt-5 lg:mt-6 ${GRADE_CARTOES}`}>
                                {resumo.map((r) => (
                                    <CartaoInfo key={r.label} rotulo={r.label} valor={dois(r.valor)} sub={r.sub} href={r.href} estilo={r.estilo} />
                                ))}
                            </section>
                        ) : null}
                        {/* ACESSO RÁPIDO (06/11/2026: blocos no padrão das páginas, na cor do módulo de cada tela) */}
                        <h2 className={`mb-3 mt-7 lg:mb-4 lg:mt-8 ${ROTULO_SECAO}`}>{usaFavoritos ? "Favoritos" : "Acesso rápido"}</h2>
                        <div className={GRADE_BLOCOS}>
                            {rapidos.map((f) => {
                                const n =
                                    f.selo === "avisos" ? c.avisos
                                        : f.selo === "messenger" ? contMessenger
                                            : f.selo === "aguardando" ? c.aguardando
                                                : f.selo === "coroas" ? c.coroas
                                                    : f.selo === "estoque" ? c.estoque
                                                        : f.id === "minhas-solicitacoes" ? c.minhasRequisicoes
                                                            : null;
                                const doModulo = menu.modulos.find((m) => m.itens.some((i) => i.id === f.id));
                                return <BlocoTela key={f.id} titulo={f.titulo} href={hrefDoItem(f, has)} Icone={f.icone} tom={(doModulo && TOM_DO_MODULO[doModulo.id]) || "azul"} selo={n} dica={f.desc} />;
                            })}
                            {pronto ? (
                                <button
                                    type="button"
                                    onClick={() => setEscolher(true)}
                                    className="flex min-h-[124px] flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-[#C9D1DE] px-3 py-4 text-center text-[14.5px] font-extrabold text-[#5B6478] transition hover:border-[#313C55] hover:text-[#313C55] dark:border-white/[0.2] dark:text-[#AEB9CF] dark:hover:text-white lg:min-h-[140px] lg:text-[15px]"
                                >
                                    <span className="grid size-14 place-items-center rounded-[18px] bg-[#EEF2F7] dark:bg-white/[0.08]">
                                        <IconPlus size={28} stroke={1.8} />
                                    </span>
                                    {usaFavoritos ? "Escolher favoritos" : "Adicionar favorito"}
                                </button>
                            ) : null}
                        </div>
                        {escolher ? (
                            <EscolherFavoritos
                                fechar={() => setEscolher(false)}
                                grupos={menu.modulos
                                    .map((m) => ({ titulo: m.titulo, itens: m.itens.filter((i) => itemVisivel(i, has)) }))
                                    .concat([{ titulo: "Início", itens: menu.fixos.filter((f) => f.href !== "/" && itemVisivel(f, has) && !menu.modulos.some((m) => m.itens.some((i) => i.id === f.id))) }])
                                    .filter((g) => g.itens.length)}
                                favoritos={menu.favoritos}
                                alternar={(id) => void menu.alternarFavorito(id)}
                            />
                        ) : null}
                        {/* MÓDULOS */}
                        {/* 06/11/2026: no computador os módulos ficam na barra lateral; aqui só no celular */}
                        <div className="lg:hidden">
                        <h2 className={`mb-3 mt-7 ${ROTULO_SECAO}`}>Módulos</h2>
                        {!pronto ? (
                            <div className={[CARD, "p-5 text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF]"].join(" ")}>Carregando acessos disponíveis neste dispositivo...</div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(max(14rem,calc((100%-3rem)/4)),1fr))] lg:gap-4">
                                {modulos.map((m) => {
                                    const Icon = m.icone;
                                    return (
                                        <Link key={m.id} href={destinoDoModulo(m, has)} className={[CARD, "flex items-center gap-3.5 p-4"].join(" ")}>
                                            <span className={["grid size-11 shrink-0 place-items-center rounded-[14px] text-[#313C55] dark:text-white", CHIP[TOM_MODULO[m.id] || "azul"]].join(" ")}>
                                                <Icon size={22} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[15px] font-extrabold">{m.titulo}</span>
                                                <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{m.desc}</span>
                                            </span>
                                            <IconChevronRight size={18} className="shrink-0 text-[#7A8396]" />
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/** 06/11/2026: janela para escolher as telas favoritas do Início (a mesma estrela do cabeçalho de cada tela). */
function EscolherFavoritos({ fechar, grupos, favoritos, alternar }: { fechar: () => void; grupos: { titulo: string; itens: { id: string; titulo: string; icone: Icone }[] }[]; favoritos: string[]; alternar: (id: string) => void }) {
    if (typeof document === "undefined") return null;
    return createPortal(
        <div
            data-pai-overlay
            role="dialog"
            aria-modal="true"
            aria-label="Favoritos do Início"
            className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6"
            onClick={(e) => {
                if (e.target === e.currentTarget) fechar();
            }}
        >
            <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white lg:rounded-2xl">
                <div className="flex items-center gap-3 border-b border-[#E3E8F0] px-5 py-3.5 dark:border-white/[0.08]">
                    <h2 className="flex-1 text-[18px] font-extrabold">Favoritos do Início</h2>
                    <button type="button" onClick={fechar} aria-label="Fechar" className="grid size-11 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/[0.08]">
                        <IconX size={20} />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {grupos.map((g) => (
                        <div key={g.titulo} className="mb-4 last:mb-0">
                            <div className={`mb-1.5 ${ROTULO_SECAO}`}>{g.titulo}</div>
                            <div className="overflow-hidden rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                                {g.itens.map((i) => {
                                    const fav = favoritos.includes(i.id);
                                    const I = i.icone;
                                    return (
                                        <button
                                            key={i.id}
                                            type="button"
                                            aria-pressed={fav}
                                            onClick={() => alternar(i.id)}
                                            className="flex min-h-12 w-full items-center gap-3 border-t border-[#E3E8F0] px-3 text-left text-[14.5px] font-bold first:border-t-0 hover:bg-[#F6F8FB] dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
                                        >
                                            <I size={20} className="shrink-0 text-[#5B6478] dark:text-[#AEB9CF]" />
                                            <span className="min-w-0 flex-1 break-words">{i.titulo}</span>
                                            {fav ? <IconStarFilled size={20} className="shrink-0 text-[#F2CB3F]" /> : <IconStar size={20} className="shrink-0 text-[#98A1B3]" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 py-3 dark:border-white/[0.08] dark:bg-[#1C2334]">
                    <button type="button" onClick={fechar} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#313C55] px-5 text-[14px] font-extrabold text-white hover:bg-[#232B40] dark:bg-[#F2CB3F] dark:text-[#313C55]">
                        Pronto
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
