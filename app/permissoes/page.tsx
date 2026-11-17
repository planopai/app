"use client";

/**
 * /permissoes — Permissões por cargo e por pessoa. Refeita em 17/11/2026 (prévia "Permissões" aprovada).
 *
 * Modelo (grupos.php, desde 27/10/2026; "Tirar" desde 17/11/2026):
 *   - cada pessoa tem UM cargo (usuarios.cargo = cargos.slug); o cargo libera telas (cargo_paginas);
 *   - "Dar" libera uma tela só para a pessoa (permissoes); "Tirar" bloqueia uma tela do cargo só para ela (permissoes_bloqueio);
 *   - Gestão (cargo adm ou a chave gestao) continua vendo tudo; só a Gestão grava aqui.
 *
 * A árvore segue o menu (useMenu: a organização da Gestão em Organizar menu): módulo › seção › tela, uma linha por chave.
 * Telas com parte de operação e de gestão (Tesouraria, Contas a Receber) têm duas linhas. Chaves que nenhuma tela do menu
 * usa (páginas de entrada dos módulos e chaves antigas que ainda valem no servidor) ficam em "Outras chaves", recolhidas.
 * As funções da Aurora e o conhecimento da Aurora continuam por pessoa (pai_api.php: *_user_ia_*).
 *
 * Abas: Cargos e pessoas · Quem acessa · Comparar cargos · Ver o menu como.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    IconAlertTriangle,
    IconChevronDown,
    IconChevronRight,
    IconCopy,
    IconSearch,
    IconShieldLock,
    IconSparkles,
    IconX,
} from "@tabler/icons-react";

import { itemVisivel, type ItemModulo, type Modulo } from "@/components/shell/modulos";
import { useMenu } from "@/components/shell/useMenu";
import { BOTAO_PAGINA, BOTAO_PAGINA_PRI, BOTAO_PAGINA_SEC, TopoPagina } from "@/components/shell/ModuloHub";

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

type Pagina = { key: string; label: string };
type Grupo = { id: number; nome: string; slug: string; descricao: string; ativo: boolean; paginas: string[]; membros: number[] };
type Pessoa = { id: number; nome: string; usuario: string; cargo: string; grupo_id: number | null; extras: string[]; bloqueios: string[] };
type Ferramenta = { key: string; label: string; grupo?: string | null; tipo?: string | null };
type Departamento = { id: number; nome: string; descricao?: string | null; ativo?: number };
type Excecao = "dar" | "tirar";

/** Uma linha da árvore: uma chave dentro de uma seção (pode abrir mais de uma tela). */
type Linha = { key: string; nomes: string[]; parte: "Operação" | "Gestão" | null; onde: string };
type Secao = { titulo: string; linhas: Linha[] };
type Mod = { id: string; titulo: string; secoes: Secao[]; paraTodos: string[] };

type Sel = { tipo: "cargo"; id: number } | { tipo: "pessoa"; id: number } | null;
type Vista = "cargos" | "quem" | "comparar" | "ver";

const API_URL = "https://api.planoassistencialintegrado.com.br/pai_api.php";
const GRUPOS_URL = "https://api.planoassistencialintegrado.com.br/grupos.php";

/** Chaves que dão poder sobre acessos, pessoas ou dinheiro (aparecem com destaque). */
const SENSIVEIS = new Set(["gestao", "permissoes", "usuarios", "auditoria", "tesouraria-gestao", "contas-receber-gestao", "resultados-config", "folha", "fin-config"]);

/* -------------------------------------------------------------------------- */
/* Estilos                                                                     */
/* -------------------------------------------------------------------------- */

const BTN = `${BOTAO_PAGINA} ${BOTAO_PAGINA_SEC} disabled:opacity-40`;
const BTN_PRI = `${BOTAO_PAGINA} ${BOTAO_PAGINA_PRI} disabled:opacity-40`;
const BTN_PEQ =
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-[#C9D1DE] bg-white px-3 text-[13px] font-extrabold leading-none text-[#313C55] hover:border-[#313C55] disabled:opacity-40 dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-white";
const CARTAO = "min-w-0 rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";
const CAMPO =
    "h-12 w-full min-w-0 rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none focus:ring-2 focus:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-white";
const ROTULO = "text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]";
const MUDO = "text-[#5B6478] dark:text-[#AEB9CF]";
const PILULA = (on: boolean) =>
    `inline-flex h-10 shrink-0 items-center justify-center rounded-full border px-4 text-[14px] font-extrabold leading-none ${
        on
            ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]"
            : "border-[#E3E8F0] bg-white text-[#313C55] hover:border-[#C9D1DE] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-white"
    }`;
const TAG_OP = "rounded-full bg-[#EEF5D6] px-2 py-0.5 text-[11px] font-extrabold text-[#3F5A0A] dark:bg-[#B3CE52]/20 dark:text-[#CFE38A]";
const TAG_GE = "rounded-full bg-[#E9EFF6] px-2 py-0.5 text-[11px] font-extrabold text-[#313C55] dark:bg-[#3D6A99]/30 dark:text-white";
const TAG_AVISO = "rounded-md bg-[#FCF2CF] px-1.5 py-0.5 text-[11px] font-extrabold text-[#7A5600] dark:bg-[#F2CB3F]/20 dark:text-[#F2CB3F]";

/* -------------------------------------------------------------------------- */
/* Ajudantes                                                                   */
/* -------------------------------------------------------------------------- */

async function pedir(input: string, init?: RequestInit): Promise<any> {
    const r = await fetch(input, { cache: "no-store", credentials: "include", ...init });
    const txt = (await r.text()).replace(/^﻿/, "").trim();
    let j: any = null;
    try {
        j = JSON.parse(txt);
    } catch {
        j = null;
    }
    if (r.status === 401 || j?.need_login) {
        window.location.href = "/login";
        throw new Error("Sessão expirada.");
    }
    if (j == null) throw new Error("Resposta inválida do servidor.");
    if (!r.ok || j?.erro) throw new Error((typeof j?.erro === "string" ? j.erro : "") || j?.msg || `Erro ${r.status}`);
    return j;
}
const postar = (url: string, corpo: unknown) =>
    pedir(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

const semAcento = (s: string) =>
    s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();

const iguais = (a: Set<string | number>, b: Set<string | number>) => a.size === b.size && Array.from(a).every((x) => b.has(x));
const difSets = (a: Set<string>, b: Set<string>) => {
    let n = 0;
    a.forEach((x) => !b.has(x) && n++);
    b.forEach((x) => !a.has(x) && n++);
    return n;
};
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Chave(s) de uma tela do menu. Tela com parte de gestão (ex.: tesouraria + tesouraria-gestao) tem as duas;
 * as outras ficam com a primeira chave (as demais são alternativas antigas, como geral, e vão para "Outras chaves").
 * "gestao" só conta quando é a única (Organizar Menu).
 */
function chavesDoItem(it: ItemModulo, validas: Set<string>): string[] {
    const ks = it.slugs.filter((k) => k !== "*" && k !== "gestao" && validas.has(k));
    if (!ks.length) return it.slugs.includes("gestao") && validas.has("gestao") ? ["gestao"] : [];
    return ks.some((k) => k.endsWith("-gestao")) ? ks : [ks[0]];
}

/** Monta a árvore módulo › seção › chave a partir do menu organizado. */
function montarArvore(modulos: Modulo[], fixos: ItemModulo[], validas: Set<string>): { mods: Mod[]; lugares: Map<string, string[]> } {
    const lugares = new Map<string, string[]>();
    const anota = (k: string, onde: string) => {
        const l = lugares.get(k) || [];
        if (!l.includes(onde)) l.push(onde);
        lugares.set(k, l);
    };
    const mods: Mod[] = [];
    const montar = (id: string, titulo: string, itens: ItemModulo[]) => {
        const mod: Mod = { id, titulo, secoes: [], paraTodos: [] };
        for (const it of itens) {
            if (it.slugs.includes("*")) {
                mod.paraTodos.push(it.titulo);
                continue;
            }
            const ks = chavesDoItem(it, validas);
            const temGestao = ks.some((k) => k.endsWith("-gestao"));
            const sTit = it.secao || "";
            let sec = mod.secoes.find((s) => s.titulo === sTit);
            if (!sec) {
                sec = { titulo: sTit, linhas: [] };
                mod.secoes.push(sec);
            }
            for (const k of ks) {
                const onde = `${titulo}${sTit ? ` › ${sTit}` : ""} › ${it.titulo}`;
                anota(k, onde);
                const ex = sec.linhas.find((l) => l.key === k);
                if (ex) {
                    if (!ex.nomes.includes(it.titulo)) ex.nomes.push(it.titulo);
                    continue;
                }
                sec.linhas.push({ key: k, nomes: [it.titulo], parte: k.endsWith("-gestao") ? "Gestão" : temGestao ? "Operação" : null, onde: `${titulo}${sTit ? ` › ${sTit}` : ""}` });
            }
        }
        // seção sem título primeiro (como no menu)
        mod.secoes.sort((a, b) => Number(!!a.titulo) - Number(!!b.titulo));
        mod.secoes = mod.secoes.filter((s) => s.linhas.length);
        if (mod.secoes.length || mod.paraTodos.length) mods.push(mod);
    };
    const fixosSoltos = fixos.filter((f) => !modulos.some((m) => m.itens.some((i) => i.id === f.id)));
    montar("__fixos", "Fixos", fixosSoltos);
    for (const m of modulos) montar(m.id, m.titulo, m.itens);
    return { mods, lugares };
}

/* -------------------------------------------------------------------------- */
/* Peças                                                                       */
/* -------------------------------------------------------------------------- */

/** Caixa de marcar com três estados (marcada, desmarcada, em parte). */
function Marca({ estado, onClick, rotulo, desligada }: { estado: boolean | "parte"; onClick: () => void; rotulo: string; desligada?: boolean }) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={estado === "parte" ? "mixed" : estado}
            aria-label={rotulo}
            disabled={desligada}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            className={`grid size-[26px] shrink-0 place-items-center rounded-[7px] border-2 disabled:opacity-40 ${
                estado ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]" : "border-[#C9D1DE] bg-white dark:border-white/30 dark:bg-[#1C2334]"
            }`}
        >
            {estado === true ? (
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12l5 5L20 7" />
                </svg>
            ) : estado === "parte" ? (
                <span className="h-[3px] w-3 rounded bg-current" />
            ) : null}
        </button>
    );
}

function Janela({ titulo, aoFechar, rodape, children }: { titulo: string; aoFechar: () => void; rodape: React.ReactNode; children: React.ReactNode }) {
    useEffect(() => {
        const f = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
        window.addEventListener("keydown", f);
        return () => window.removeEventListener("keydown", f);
    }, [aoFechar]);
    if (typeof document === "undefined") return null;
    return createPortal(
        <div data-pai-overlay className="fixed inset-0 z-[70] flex items-end justify-center bg-[#161C2A]/55 lg:items-center lg:p-6" onClick={aoFechar}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={titulo}
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-[#FFFFFF] text-[#313C55] dark:bg-[#232B3F] dark:text-white lg:max-w-lg lg:rounded-2xl"
            >
                <div className="flex items-center gap-3 border-b border-[#E3E8F0] px-5 py-4 dark:border-white/[0.12]">
                    <b className="min-w-0 flex-1 text-[18px]">{titulo}</b>
                    <button type="button" onClick={aoFechar} aria-label="Fechar" className="grid size-11 place-items-center rounded-xl hover:bg-black/[0.05] dark:hover:bg-white/10">
                        <IconX size={20} />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
                <div className="flex gap-2.5 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] dark:border-white/[0.12] dark:bg-[#1C2334] lg:justify-end lg:pb-3.5 [&>*]:flex-1 lg:[&>*]:flex-none">
                    {rodape}
                </div>
            </div>
        </div>,
        document.body,
    );
}

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

export default function PermissoesPage() {
    const menu = useMenu();
    const [vista, setVista] = useState<Vista>("cargos");
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);

    const [paginas, setPaginas] = useState<Pagina[]>([]);
    const [grupos, setGrupos] = useState<Grupo[]>([]);
    const [pessoas, setPessoas] = useState<Pessoa[]>([]);
    const [podeEditar, setPodeEditar] = useState(false);
    const [ferramentas, setFerramentas] = useState<Ferramenta[]>([]);
    const [departamentos, setDepartamentos] = useState<Departamento[]>([]);

    const [sel, setSel] = useState<Sel>(null);
    const [busca, setBusca] = useState("");
    const [buscaPessoa, setBuscaPessoa] = useState("");
    const [abertos, setAbertos] = useState<Record<string, boolean>>({});
    const [outrasAbertas, setOutrasAbertas] = useState(false);

    /* rascunho da seleção atual */
    const [rCargo, setRCargo] = useState<Set<string>>(new Set());
    const [rGrupoPessoa, setRGrupoPessoa] = useState<number | null>(null);
    const [rEx, setREx] = useState<Record<string, Excecao>>({});
    const [rFerr, setRFerr] = useState<Set<string>>(new Set());
    const [rDeps, setRDeps] = useState<Set<number>>(new Set());
    const [iaOriginal, setIaOriginal] = useState<{ ferr: Set<string>; deps: Set<number> } | null>(null);
    const pedidoIa = useRef(0);

    /* janelas */
    const [trocar, setTrocar] = useState<Sel | "vista" | null>(null);
    const [proximaVista, setProximaVista] = useState<Vista | null>(null);
    const [copiar, setCopiar] = useState<{ nome: string } | null>(null);
    const [igualar, setIgualar] = useState<{ de: number; para: number } | null>(null);

    /* outras abas */
    const [chaveQuem, setChaveQuem] = useState("");
    const [cmp, setCmp] = useState<[number, number]>([0, 0]);
    const [comoQuem, setComoQuem] = useState<number>(0);

    useEffect(() => {
        if (!aviso) return;
        const t = window.setTimeout(() => setAviso(null), 3500);
        return () => window.clearTimeout(t);
    }, [aviso]);

    /* ------------------------------ carregar ------------------------------ */

    const carregarPainel = useCallback(async () => {
        const j = await pedir(`${GRUPOS_URL}?action=painel&_=${Date.now()}`);
        const d = j?.dados || {};
        const gs: Grupo[] = Array.isArray(d.grupos) ? d.grupos : [];
        const ps: Pessoa[] = (Array.isArray(d.usuarios) ? d.usuarios : []).map((u: any) => ({ ...u, extras: u.extras || [], bloqueios: u.bloqueios || [] }));
        setGrupos(gs);
        setPessoas(ps);
        setPaginas(Array.isArray(d.paginas) ? d.paginas : []);
        setPodeEditar(!!d.eu?.pode_editar);
        return { gs, ps };
    }, []);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const { gs, ps } = await carregarPainel();
                if (!vivo) return;
                const primeiro = gs.find((g) => g.ativo);
                if (primeiro) {
                    setSel({ tipo: "cargo", id: primeiro.id });
                    setRCargo(new Set(primeiro.paginas));
                }
                const ativos = gs.filter((g) => g.ativo);
                setCmp([ativos[0]?.id || 0, ativos[1]?.id || ativos[0]?.id || 0]);
                setComoQuem(ps[0]?.id || 0);
            } catch (e: any) {
                if (vivo) setErro(e?.message || "Não foi possível carregar as permissões.");
            } finally {
                if (vivo) setCarregando(false);
            }
            // funções e conhecimento da Aurora (por pessoa): se falhar, a tela continua
            pedir(`${API_URL}?action=list_ia_ferramentas&_=${Date.now()}`)
                .then((j) => vivo && setFerramentas(Array.isArray(j) ? j : []))
                .catch(() => undefined);
            pedir(`${API_URL}?action=list_ia_departamentos&_=${Date.now()}`)
                .then((j) => vivo && setDepartamentos(Array.isArray(j) ? j : []))
                .catch(() => undefined);
        })();
        return () => {
            vivo = false;
        };
    }, [carregarPainel]);

    /* ------------------------------ árvore ------------------------------ */

    const validas = useMemo(() => new Set(paginas.map((p) => p.key)), [paginas]);
    const rotuloDa = useMemo(() => new Map(paginas.map((p) => [p.key, p.label])), [paginas]);
    const { mods, lugares } = useMemo(() => montarArvore(menu.modulos, menu.fixos, validas), [menu.modulos, menu.fixos, validas]);
    const outras = useMemo(() => paginas.filter((p) => !lugares.has(p.key)), [paginas, lugares]);
    const totalChaves = paginas.length;

    const grupoPorId = useMemo(() => new Map(grupos.map((g) => [g.id, g])), [grupos]);
    const pessoaPorId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);

    const paginasDoGrupo = useCallback((gid: number | null | undefined) => {
        const g = gid ? grupoPorId.get(gid) : undefined;
        return new Set(g && g.ativo ? g.paginas : []);
    }, [grupoPorId]);

    /** Exceções gravadas da pessoa: "dar" = extra que o cargo não dá; "tirar" = bloqueio. */
    const excecoesGravadas = useCallback(
        (p: Pessoa): Record<string, Excecao> => {
            const doCargo = paginasDoGrupo(p.grupo_id);
            const ex: Record<string, Excecao> = {};
            p.extras.forEach((k) => {
                if (!doCargo.has(k)) ex[k] = "dar";
            });
            p.bloqueios.forEach((k) => (ex[k] = "tirar"));
            return ex;
        },
        [paginasDoGrupo],
    );

    /** O que a pessoa acaba vendo: cargo + Dar − Tirar. */
    const efetivo = useCallback(
        (gid: number | null | undefined, ex: Record<string, Excecao>) => {
            const s = paginasDoGrupo(gid);
            Object.entries(ex).forEach(([k, v]) => (v === "dar" ? s.add(k) : s.delete(k)));
            return s;
        },
        [paginasDoGrupo],
    );
    const ehGestao = (p: Pessoa | undefined, s: Set<string>) => !!p && (p.cargo === "adm" || s.has("gestao"));

    /* ------------------------------ seleção ------------------------------ */

    const pessoaSel = sel?.tipo === "pessoa" ? pessoaPorId.get(sel.id) : undefined;
    const grupoSel = sel?.tipo === "cargo" ? grupoPorId.get(sel.id) : undefined;

    const mudancas = useMemo(() => {
        if (grupoSel) {
            const orig = new Set(grupoSel.paginas.filter((k) => validas.has(k)));
            const agora = new Set(Array.from(rCargo).filter((k) => validas.has(k)));
            return difSets(orig, agora);
        }
        if (pessoaSel) {
            let n = rGrupoPessoa !== pessoaSel.grupo_id ? 1 : 0;
            const orig = excecoesGravadas(pessoaSel);
            const ks = new Set([...Object.keys(orig), ...Object.keys(rEx)]);
            ks.forEach((k) => orig[k] !== rEx[k] && n++);
            if (iaOriginal) {
                n += difSets(new Set(Array.from(iaOriginal.ferr)), new Set(Array.from(rFerr)));
                n += difSets(new Set(Array.from(iaOriginal.deps).map(String)), new Set(Array.from(rDeps).map(String)));
            }
            return n;
        }
        return 0;
    }, [grupoSel, pessoaSel, rCargo, rGrupoPessoa, rEx, rFerr, rDeps, iaOriginal, validas, excecoesGravadas]);

    const abrirSel = useCallback(
        (s: Sel) => {
            setSel(s);
            setIaOriginal(null);
            if (s?.tipo === "cargo") {
                setRCargo(new Set(grupoPorId.get(s.id)?.paginas || []));
            } else if (s?.tipo === "pessoa") {
                const p = pessoaPorId.get(s.id);
                if (!p) return;
                setRGrupoPessoa(p.grupo_id);
                setREx(excecoesGravadas(p));
                setRFerr(new Set());
                setRDeps(new Set());
                const pedido = ++pedidoIa.current;
                Promise.all([
                    pedir(`${API_URL}?action=list_user_ia_ferramentas&user_id=${p.id}&_=${Date.now()}`),
                    pedir(`${API_URL}?action=list_user_ia_departamentos&user_id=${p.id}&_=${Date.now()}`),
                ])
                    .then(([f, d]) => {
                        if (pedido !== pedidoIa.current) return;
                        const ferr = new Set<string>((Array.isArray(f) ? f : []).filter((x: unknown) => typeof x === "string"));
                        const deps = new Set<number>((Array.isArray(d) ? d : []).map(Number).filter((n: number) => Number.isFinite(n) && n > 0));
                        setRFerr(new Set(ferr));
                        setRDeps(new Set(deps));
                        setIaOriginal({ ferr, deps });
                    })
                    .catch(() => undefined);
            }
        },
        [grupoPorId, pessoaPorId, excecoesGravadas],
    );

    /** Troca de seleção ou de aba: com alteração sem gravar, pergunta antes. */
    const irPara = (s: Sel) => {
        if (mudancas > 0) setTrocar(s);
        else abrirSel(s);
    };
    const irVista = (v: Vista) => {
        if (v === vista) return;
        if (mudancas > 0 && vista === "cargos") {
            setProximaVista(v);
            setTrocar("vista");
        } else setVista(v);
    };

    /* ------------------------------ editar ------------------------------ */

    const alternarCargo = (ks: string[]) => {
        if (!podeEditar) return;
        const n = new Set(rCargo);
        const tudo = ks.every((k) => n.has(k));
        ks.forEach((k) => (tudo ? n.delete(k) : n.add(k)));
        setRCargo(n);
    };
    const definirEx = (k: string, v: Excecao | "cargo") => {
        if (!podeEditar) return;
        const n = { ...rEx };
        if (v === "cargo") delete n[k];
        else n[k] = v;
        setREx(n);
    };

    /* ------------------------------ gravar ------------------------------ */

    const gravar = async () => {
        if (!sel) return;
        setSalvando(true);
        setErro(null);
        try {
            if (grupoSel) {
                await postar(`${GRUPOS_URL}?action=grupo_salvar`, { id: grupoSel.id, nome: grupoSel.nome, descricao: grupoSel.descricao, paginas: Array.from(rCargo) });
                const { gs } = await carregarPainel();
                setRCargo(new Set(gs.find((g) => g.id === grupoSel.id)?.paginas || []));
                setAviso(`Cargo ${grupoSel.nome} gravado. Vale no próximo acesso de cada pessoa.`);
            } else if (pessoaSel) {
                if (podeEditar) {
                    if (rGrupoPessoa == null) throw new Error("Escolha o cargo da pessoa antes de gravar.");
                    const doCargo = paginasDoGrupo(rGrupoPessoa);
                    const extras = Object.keys(rEx).filter((k) => rEx[k] === "dar" && !doCargo.has(k));
                    const bloqueios = Object.keys(rEx).filter((k) => rEx[k] === "tirar" && doCargo.has(k));
                    // extras antigos que não são chaves da lista continuam como estão no servidor
                    await postar(`${GRUPOS_URL}?action=usuario_salvar`, { user_id: pessoaSel.id, grupo_id: rGrupoPessoa, extras, bloqueios });
                }
                if (iaOriginal && (!iguais(iaOriginal.ferr, rFerr) || !iguais(iaOriginal.deps, rDeps))) {
                    await postar(`${API_URL}?action=save_user_ia_ferramentas`, { user_id: pessoaSel.id, ferramentas: Array.from(rFerr) });
                    await postar(`${API_URL}?action=save_user_ia_departamentos`, { user_id: pessoaSel.id, departamentos: Array.from(rDeps) });
                    setIaOriginal({ ferr: new Set(rFerr), deps: new Set(rDeps) });
                }
                const { ps } = await carregarPainel();
                const p = ps.find((x) => x.id === pessoaSel.id);
                if (p) {
                    setRGrupoPessoa(p.grupo_id);
                    // recalcula as exceções com o cargo gravado (o painel novo ainda não está no estado)
                    const gNovo = p.grupo_id;
                    const ex: Record<string, Excecao> = {};
                    const doCargo = new Set(Array.from(paginasDoGrupo(gNovo)));
                    p.extras.forEach((k) => !doCargo.has(k) && (ex[k] = "dar"));
                    p.bloqueios.forEach((k) => (ex[k] = "tirar"));
                    setREx(ex);
                }
                setAviso(`Permissões de ${pessoaSel.nome} gravadas. Valem no próximo acesso dela.`);
            }
        } catch (e: any) {
            setErro(e?.message || "Não foi possível gravar.");
        } finally {
            setSalvando(false);
        }
    };
    const desfazer = () => abrirSel(sel);

    const criarCopia = async () => {
        if (!copiar || !grupoSel) return;
        const nome = copiar.nome.trim();
        if (!nome) {
            setErro("Escreva o nome do cargo novo.");
            return;
        }
        setSalvando(true);
        setErro(null);
        try {
            const j = await postar(`${GRUPOS_URL}?action=grupo_salvar`, { id: 0, nome, descricao: "", paginas: Array.from(rCargo) });
            const novoId = Number(j?.dados?.id) || 0;
            const { gs } = await carregarPainel();
            setCopiar(null);
            const g = gs.find((x) => x.id === novoId);
            if (g) {
                setSel({ tipo: "cargo", id: g.id });
                setRCargo(new Set(g.paginas));
            }
            setAviso(`Cargo ${nome} criado com as mesmas telas.`);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível criar o cargo.");
        } finally {
            setSalvando(false);
        }
    };

    const alternarAtivo = async (g: Grupo) => {
        setSalvando(true);
        setErro(null);
        try {
            await postar(`${GRUPOS_URL}?action=grupo_ativo`, { id: g.id, ativo: !g.ativo });
            await carregarPainel();
            setAviso(g.ativo ? `Cargo ${g.nome} desativado.` : `Cargo ${g.nome} ativado.`);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível alterar o cargo.");
        } finally {
            setSalvando(false);
        }
    };

    const fazerIgualar = async () => {
        if (!igualar) return;
        const de = grupoPorId.get(igualar.de);
        const para = grupoPorId.get(igualar.para);
        if (!de || !para) return;
        setSalvando(true);
        setErro(null);
        try {
            await postar(`${GRUPOS_URL}?action=grupo_salvar`, { id: para.id, nome: para.nome, descricao: para.descricao, paginas: de.paginas });
            await carregarPainel();
            setAviso(`${para.nome} agora tem as mesmas telas de ${de.nome}.`);
            setIgualar(null);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível copiar.");
        } finally {
            setSalvando(false);
        }
    };

    /* ------------------------------ filtro ------------------------------ */

    const q = semAcento(busca);
    const casa = (l: Linha, m: Mod, s: Secao) => !q || semAcento(`${l.nomes.join(" ")} ${s.titulo} ${m.titulo} ${l.key} ${rotuloDa.get(l.key) || ""}`).includes(q);
    const aberto = (id: string) => !!q || !!abertos[id];

    /* ------------------------------ render ------------------------------ */

    const ativos = grupos.filter((g) => g.ativo);
    const qp = semAcento(buscaPessoa);
    const pessoasFiltradas = pessoas.filter((p) => !qp || semAcento(`${p.nome} ${p.usuario}`).includes(qp));

    const conjuntoAtual: Set<string> = grupoSel ? rCargo : pessoaSel ? efetivo(rGrupoPessoa, rEx) : new Set();
    const cargoDaPessoa = pessoaSel ? paginasDoGrupo(rGrupoPessoa) : new Set<string>();

    /* uma linha da árvore */
    const linhaTela = (l: Linha) => {
        const tem = conjuntoAtual.has(l.key);
        const outrosLugares = (lugares.get(l.key) || []).filter((o) => !o.startsWith(l.onde + " › "));
        const nome = l.nomes.join(", ");
        return (
            <div key={l.key} className={`flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#E3E8F0] py-2 pr-3 dark:border-white/[0.08] ${l.parte ? "pl-12 lg:pl-14" : "pl-4 lg:pl-10"}`}>
                <div className="min-w-0 flex-1 basis-[200px]">
                    <div className="flex flex-wrap items-center gap-1.5 text-[14.5px] font-bold">
                        <span className="break-words">{nome}</span>
                        {l.parte ? <span className={l.parte === "Gestão" ? TAG_GE : TAG_OP}>{l.parte}</span> : null}
                        {SENSIVEIS.has(l.key) ? <span className={TAG_AVISO}>{l.key === "gestao" ? "acesso total de Gestão" : "sensível"}</span> : null}
                    </div>
                    <div className={`text-[12px] ${MUDO}`}>
                        <span className="font-mono">{l.key}</span>
                        {outrosLugares.length ? ` · também abre: ${outrosLugares.join("; ")}` : ""}
                    </div>
                </div>
                {grupoSel ? (
                    <Marca estado={tem} onClick={() => alternarCargo([l.key])} rotulo={`Liberar ${nome}`} desligada={!podeEditar} />
                ) : pessoaSel ? (
                    <ControlePessoa
                        tem={tem}
                        peloCargo={cargoDaPessoa.has(l.key)}
                        ex={rEx[l.key]}
                        definir={(v) => definirEx(l.key, v)}
                        desligado={!podeEditar}
                        nome={nome}
                    />
                ) : null}
            </div>
        );
    };

    const blocoAurora =
        pessoaSel && (ferramentas.length || departamentos.length) ? (
            <div className="border-t border-[#E3E8F0] px-4 py-3 dark:border-white/[0.08] lg:pl-10">
                <div className={`mb-2 flex items-center gap-2 ${ROTULO}`}>
                    <IconSparkles size={16} /> O que a Aurora faz para {pessoaSel.nome.split(" ")[0]}
                </div>
                {!iaOriginal ? <div className={`text-[13px] ${MUDO}`}>Carregando…</div> : null}
                {iaOriginal && ferramentas.length ? (
                    <div className="grid gap-1 sm:grid-cols-2">
                        {ferramentas.map((f) => (
                            <label key={f.key} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-[#F6F8FB] dark:hover:bg-white/[0.04]">
                                <Marca
                                    estado={rFerr.has(f.key)}
                                    rotulo={f.label}
                                    onClick={() => {
                                        const n = new Set(rFerr);
                                        n.has(f.key) ? n.delete(f.key) : n.add(f.key);
                                        setRFerr(n);
                                    }}
                                />
                                <span className="min-w-0 text-[14px]">
                                    <b className="font-bold">{f.label}</b>
                                    {f.grupo ? <span className={`block text-[12px] ${MUDO}`}>{f.grupo}{f.tipo === "acao" ? " · faz ação" : ""}</span> : null}
                                </span>
                            </label>
                        ))}
                    </div>
                ) : null}
                {iaOriginal && departamentos.length ? (
                    <>
                        <div className={`mb-2 mt-4 ${ROTULO}`}>Conhecimento da Aurora que {pessoaSel.nome.split(" ")[0]} consulta</div>
                        <div className="grid gap-1 sm:grid-cols-2">
                            {departamentos.map((d) => (
                                <label key={d.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-[#F6F8FB] dark:hover:bg-white/[0.04]">
                                    <Marca
                                        estado={rDeps.has(Number(d.id))}
                                        rotulo={d.nome}
                                        onClick={() => {
                                            const n = new Set(rDeps);
                                            const id = Number(d.id);
                                            n.has(id) ? n.delete(id) : n.add(id);
                                            setRDeps(n);
                                        }}
                                    />
                                    <span className="min-w-0 text-[14px] font-bold">{d.nome}</span>
                                </label>
                            ))}
                        </div>
                    </>
                ) : null}
            </div>
        ) : grupoSel ? (
            <div className={`flex items-center gap-2 border-t border-[#E3E8F0] px-4 py-3 text-[13px] dark:border-white/[0.08] lg:pl-10 ${MUDO}`}>
                <IconSparkles size={16} className="shrink-0" /> O que a Aurora faz e o conhecimento que ela consulta valem por pessoa: abra a pessoa para ajustar.
            </div>
        ) : null;

    const arvore = mods.map((m) => {
        const linhas = m.secoes.flatMap((s) => s.linhas.filter((l) => casa(l, m, s)));
        const ehAurora = m.id === "aurora";
        if (q && !linhas.length) return null;
        const ks = Array.from(new Set(linhas.map((l) => l.key)));
        const on = ks.filter((k) => conjuntoAtual.has(k)).length;
        const estado: boolean | "parte" = on === 0 ? false : on === ks.length ? true : "parte";
        return (
            <div key={m.id} className="border-b border-[#E3E8F0] last:border-b-0 dark:border-white/[0.08]">
                <div className="flex min-h-[52px] items-center gap-3 bg-[#F6F8FB] px-3 dark:bg-[#1C2334]">
                    <button type="button" className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setAbertos({ ...abertos, [m.id]: !abertos[m.id] })} aria-expanded={aberto(m.id)}>
                        {aberto(m.id) ? <IconChevronDown size={18} className="shrink-0" /> : <IconChevronRight size={18} className="shrink-0" />}
                        <b className="min-w-0 truncate text-[15.5px]">{m.titulo}</b>
                    </button>
                    {m.paraTodos.length && !ks.length ? null : (
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-extrabold tabular-nums ${estado === true ? "bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/20 dark:text-[#CFE38A]" : "bg-white text-[#5B6478] dark:bg-[#232B3F] dark:text-[#AEB9CF]"}`}>
                            {on} de {ks.length}
                        </span>
                    )}
                    {grupoSel && ks.length ? <Marca estado={estado} onClick={() => alternarCargo(ks)} rotulo={`Marcar todo o módulo ${m.titulo}`} desligada={!podeEditar} /> : null}
                </div>
                {aberto(m.id) ? (
                    <>
                        {m.paraTodos.length && !q ? (
                            <div className={`border-t border-[#E3E8F0] py-2.5 pl-4 pr-3 text-[13px] dark:border-white/[0.08] lg:pl-10 ${MUDO}`}>
                                Abrem para todos: <b className="text-[#313C55] dark:text-white">{m.paraTodos.join(", ")}</b>
                            </div>
                        ) : null}
                        {m.secoes.map((s) => {
                            const ls = s.linhas.filter((l) => casa(l, m, s));
                            if (!ls.length) return null;
                            const sk = Array.from(new Set(ls.map((l) => l.key)));
                            const son = sk.filter((k) => conjuntoAtual.has(k)).length;
                            return (
                                <div key={s.titulo || "_"}>
                                    {s.titulo ? (
                                        <div className="flex min-h-[44px] items-center gap-3 border-t border-[#E3E8F0] py-1.5 pl-4 pr-3 dark:border-white/[0.08] lg:pl-10">
                                            <span className={`min-w-0 flex-1 ${ROTULO}`}>{s.titulo}</span>
                                            <span className={`text-[12px] font-bold tabular-nums ${MUDO}`}>
                                                {son} de {sk.length}
                                            </span>
                                            {grupoSel ? (
                                                <Marca
                                                    estado={son === 0 ? false : son === sk.length ? true : "parte"}
                                                    onClick={() => alternarCargo(sk)}
                                                    rotulo={`Marcar toda a seção ${s.titulo}`}
                                                    desligada={!podeEditar}
                                                />
                                            ) : null}
                                        </div>
                                    ) : null}
                                    {ls.map(linhaTela)}
                                </div>
                            );
                        })}
                        {ehAurora && !q ? blocoAurora : null}
                    </>
                ) : null}
            </div>
        );
    });

    const outrasFiltradas = outras.filter((p) => !q || semAcento(`${p.label} ${p.key}`).includes(q));
    const blocoOutras = outrasFiltradas.length ? (
        <div className="border-t border-[#E3E8F0] dark:border-white/[0.08]">
            <button type="button" className="flex min-h-[52px] w-full items-center gap-2 bg-[#F6F8FB] px-3 text-left dark:bg-[#1C2334]" onClick={() => setOutrasAbertas(!outrasAbertas)} aria-expanded={outrasAbertas || !!q}>
                {outrasAbertas || q ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                <b className="flex-1 text-[15.5px]">Outras chaves</b>
                <span className={`text-[12px] font-bold ${MUDO}`}>{outrasFiltradas.filter((p) => conjuntoAtual.has(p.key)).length} de {outrasFiltradas.length}</span>
            </button>
            {outrasAbertas || q ? (
                <>
                    <div className={`border-t border-[#E3E8F0] px-4 py-2.5 text-[13px] dark:border-white/[0.08] lg:pl-10 ${MUDO}`}>
                        Chaves sem tela própria no menu: páginas de entrada dos módulos e chaves antigas que o servidor ainda usa (ex.: atendimento e administrativo nas permissões da OS). Mexa só se souber para que servem.
                    </div>
                    {outrasFiltradas.map((p) => linhaTela({ key: p.key, nomes: [p.label], parte: null, onde: "Outras chaves" }))}
                </>
            ) : null}
        </div>
    ) : null;

    /* ------------------------------ vistas ------------------------------ */

    const todasLinhas = useMemo(() => {
        const out: { key: string; rotulo: string }[] = [];
        const vistos = new Set<string>();
        for (const m of mods)
            for (const s of m.secoes)
                for (const l of s.linhas) {
                    if (vistos.has(l.key)) continue;
                    vistos.add(l.key);
                    out.push({ key: l.key, rotulo: `${l.onde} › ${l.nomes.join(", ")}${l.parte ? ` (${l.parte})` : ""}` });
                }
        for (const p of outras) out.push({ key: p.key, rotulo: `Outras chaves › ${p.label}` });
        return out;
    }, [mods, outras]);

    const vQuem = () => {
        const k = chaveQuem || todasLinhas[0]?.key || "";
        const cs = grupos.filter((g) => g.ativo && g.paginas.includes(k));
        const ps = pessoas
            .map((p) => {
                const ex = excecoesGravadas(p);
                const s = efetivo(p.grupo_id, ex);
                return { p, ve: s.has(k), ex: ex[k], gestao: ehGestao(p, s) };
            })
            .filter((x) => x.ve || x.ex || x.gestao);
        return (
            <div className={CARTAO}>
                <div className="flex flex-wrap items-center gap-3 border-b border-[#E3E8F0] p-3 dark:border-white/[0.08]">
                    <label htmlFor="tela-quem" className={ROTULO}>
                        Tela
                    </label>
                    <select id="tela-quem" className={`${CAMPO} flex-1 basis-[320px]`} value={k} onChange={(e) => setChaveQuem(e.target.value)}>
                        {todasLinhas.map((l) => (
                            <option key={l.key} value={l.key}>
                                {l.rotulo}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="grid gap-5 p-4 md:grid-cols-2">
                    <div>
                        <div className={`mb-2 ${ROTULO}`}>Cargos que liberam ({cs.length})</div>
                        {cs.length ? cs.map((g) => <div key={g.id} className="border-t border-[#E3E8F0] py-2.5 text-[14.5px] font-bold dark:border-white/[0.08]">{g.nome} <span className={`text-[12.5px] font-semibold ${MUDO}`}>· {plural(g.membros.length, "pessoa", "pessoas")}</span></div>) : <div className={`py-3 text-[14px] ${MUDO}`}>Nenhum cargo.</div>}
                    </div>
                    <div>
                        <div className={`mb-2 ${ROTULO}`}>Pessoas que veem ({ps.filter((x) => x.ve || x.gestao).length})</div>
                        {ps.map((x) => (
                            <div key={x.p.id} className="flex flex-wrap items-center gap-2 border-t border-[#E3E8F0] py-2.5 text-[14.5px] dark:border-white/[0.08]">
                                <span className="min-w-0 flex-1 font-bold">
                                    {x.p.nome} <span className={`text-[12.5px] font-semibold ${MUDO}`}>· {grupoPorId.get(x.p.grupo_id || 0)?.nome || "sem cargo"}</span>
                                </span>
                                {x.ex === "dar" ? <span className={TAG_AVISO}>liberada só para esta pessoa</span> : null}
                                {x.ex === "tirar" ? <span className={TAG_AVISO}>tirada só desta pessoa</span> : null}
                                {x.gestao && !x.ve ? <span className={TAG_GE}>Gestão: vê tudo</span> : null}
                            </div>
                        ))}
                        {!ps.length ? <div className={`py-3 text-[14px] ${MUDO}`}>Ninguém.</div> : null}
                    </div>
                </div>
            </div>
        );
    };

    const vComparar = () => {
        const A = grupoPorId.get(cmp[0]);
        const B = grupoPorId.get(cmp[1]);
        const sa = new Set(A?.paginas || []);
        const sb = new Set(B?.paginas || []);
        const linhas = todasLinhas.filter((l) => sa.has(l.key) || sb.has(l.key));
        const dif = linhas.filter((l) => sa.has(l.key) !== sb.has(l.key)).length;
        const seletor = (i: 0 | 1) => (
            <select className={`${CAMPO} flex-1 basis-[180px]`} value={cmp[i]} onChange={(e) => setCmp(i === 0 ? [Number(e.target.value), cmp[1]] : [cmp[0], Number(e.target.value)])} aria-label={i === 0 ? "Primeiro cargo" : "Segundo cargo"}>
                {ativos.map((g) => (
                    <option key={g.id} value={g.id}>
                        {g.nome}
                    </option>
                ))}
            </select>
        );
        return (
            <div className={CARTAO}>
                <div className="flex flex-wrap items-center gap-3 border-b border-[#E3E8F0] p-3 dark:border-white/[0.08]">
                    {seletor(0)}
                    <span className={`font-extrabold ${MUDO}`}>×</span>
                    {seletor(1)}
                    <span className={`text-[13px] font-bold ${MUDO}`}>{plural(dif, "tela diferente", "telas diferentes")}</span>
                    {podeEditar && A && B && A.id !== B.id ? (
                        <button type="button" className={BTN_PEQ} onClick={() => setIgualar({ de: A.id, para: B.id })}>
                            <IconCopy size={16} /> Copiar {A.nome} para {B.nome}
                        </button>
                    ) : null}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse text-[14px]">
                        <thead>
                            <tr className={ROTULO}>
                                <th className="px-3 py-2.5 text-left">Tela</th>
                                <th className="w-[120px] px-3 py-2.5 text-left">{A?.nome}</th>
                                <th className="w-[120px] px-3 py-2.5 text-left">{B?.nome}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {linhas.map((l) => {
                                const a = sa.has(l.key);
                                const b = sb.has(l.key);
                                return (
                                    <tr key={l.key} className={`border-t border-[#E3E8F0] dark:border-white/[0.08] ${a !== b ? "bg-[#FCF2CF]/50 dark:bg-[#F2CB3F]/[0.07]" : ""}`}>
                                        <td className="px-3 py-2.5">{l.rotulo}</td>
                                        <td className={`px-3 py-2.5 font-extrabold ${a ? "text-[#3F5A0A] dark:text-[#CFE38A]" : MUDO}`}>{a ? "sim" : "—"}</td>
                                        <td className={`px-3 py-2.5 font-extrabold ${b ? "text-[#3F5A0A] dark:text-[#CFE38A]" : MUDO}`}>{b ? "sim" : "—"}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {!linhas.length ? <div className={`p-6 text-center ${MUDO}`}>Nenhum dos dois cargos tem telas.</div> : null}
                </div>
            </div>
        );
    };

    const vVer = () => {
        const p = pessoaPorId.get(comoQuem) || pessoas[0];
        if (!p) return <div className={`${CARTAO} p-6 ${MUDO}`}>Nenhuma pessoa.</div>;
        const s = efetivo(p.grupo_id, excecoesGravadas(p));
        const gestao = ehGestao(p, s);
        const has = (k: string) => gestao || s.has(k);
        const fixosVisiveis = menu.fixos.filter((f) => itemVisivel(f, has) && !menu.modulos.some((m) => m.itens.some((i) => i.id === f.id)));
        return (
            <div className={CARTAO}>
                <div className="flex flex-wrap items-center gap-3 border-b border-[#E3E8F0] p-3 dark:border-white/[0.08]">
                    <label htmlFor="como-quem" className={ROTULO}>
                        Pessoa
                    </label>
                    <select id="como-quem" className={`${CAMPO} flex-1 basis-[240px]`} value={p.id} onChange={(e) => setComoQuem(Number(e.target.value))}>
                        {pessoas.map((x) => (
                            <option key={x.id} value={x.id}>
                                {x.nome}
                            </option>
                        ))}
                    </select>
                    <span className={`text-[13px] font-bold ${MUDO}`}>
                        {grupoPorId.get(p.grupo_id || 0)?.nome || "sem cargo"}
                        {gestao ? " · Gestão: vê tudo" : ""}
                    </span>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {fixosVisiveis.length ? (
                        <div className="rounded-xl bg-[#F6F8FB] p-3 dark:bg-[#1C2334]">
                            <b className="mb-1 block">Fixos</b>
                            {fixosVisiveis.map((f) => (
                                <div key={f.id} className="py-0.5 text-[13.5px]">
                                    {f.titulo}
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {menu.modulos.map((m) => {
                        const its = m.itens.filter((i) => itemVisivel(i, has));
                        if (!its.length) return null;
                        return (
                            <div key={m.id} className="rounded-xl bg-[#F6F8FB] p-3 dark:bg-[#1C2334]">
                                <b className="mb-1 block">{m.titulo}</b>
                                {its.map((i, n) => (
                                    <React.Fragment key={i.id}>
                                        {i.secao && i.secao !== its[n - 1]?.secao ? <div className={`mt-2 ${ROTULO} !text-[11px]`}>{i.secao}</div> : null}
                                        <div className="py-0.5 text-[13.5px]">{i.titulo}</div>
                                    </React.Fragment>
                                ))}
                            </div>
                        );
                    })}
                </div>
                <div className={`px-4 pb-4 text-[13px] ${MUDO}`}>É o menu que {p.nome.split(" ")[0]} vê ao entrar no app (cargo + o que foi dado − o que foi tirado), com o que está gravado agora.</div>
            </div>
        );
    };

    /* ------------------------------ lateral ------------------------------ */

    const lateral = (
        <aside className={`${CARTAO} flex flex-col gap-0.5 p-2 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto`}>
            <div className={`px-2 pb-1 pt-2 ${ROTULO}`}>Cargos</div>
            <div className="max-h-[38dvh] overflow-y-auto lg:max-h-none">
                {[...ativos, ...grupos.filter((g) => !g.ativo)].map((g) => {
                    const on = grupoSel?.id === g.id;
                    const n = g.paginas.filter((k) => validas.has(k)).length;
                    return (
                        <button
                            key={g.id}
                            type="button"
                            onClick={() => irPara({ tipo: "cargo", id: g.id })}
                            className={`flex min-h-[44px] w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-[14.5px] font-bold ${on ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/25" : "hover:bg-[#F6F8FB] dark:hover:bg-white/[0.04]"} ${g.ativo ? "" : "opacity-55"}`}
                        >
                            <span className="min-w-0 flex-1 break-words">{g.nome}</span>
                            <span className={`shrink-0 text-[12px] font-bold tabular-nums ${MUDO}`}>{g.ativo ? `${n} de ${totalChaves}` : "inativo"}</span>
                        </button>
                    );
                })}
            </div>
            <div className={`mt-3 px-2 pb-1 ${ROTULO}`}>Pessoas</div>
            <div className="relative px-1 pb-1">
                <IconSearch size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7A8396]" />
                <input type="search" className={`${CAMPO} h-11 pl-10`} placeholder="Procurar pessoa" value={buscaPessoa} onChange={(e) => setBuscaPessoa(e.target.value)} aria-label="Procurar pessoa" />
            </div>
            <div className="max-h-[38dvh] overflow-y-auto lg:max-h-none">
                {pessoasFiltradas.map((p) => {
                    const on = pessoaSel?.id === p.id;
                    const ne = Object.keys(excecoesGravadas(p)).length;
                    return (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => irPara({ tipo: "pessoa", id: p.id })}
                            className={`flex min-h-[44px] w-full flex-col justify-center rounded-[10px] px-2.5 py-1.5 text-left ${on ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/25" : "hover:bg-[#F6F8FB] dark:hover:bg-white/[0.04]"}`}
                        >
                            <span className="break-words text-[14.5px] font-bold">{p.nome}</span>
                            <span className={`text-[12px] font-semibold ${MUDO}`}>
                                {grupoPorId.get(p.grupo_id || 0)?.nome || "sem cargo"}
                                {ne ? ` · ${plural(ne, "exceção", "exceções")}` : ""}
                            </span>
                        </button>
                    );
                })}
                {!pessoasFiltradas.length ? <div className={`px-3 py-3 text-[13px] ${MUDO}`}>Ninguém com esse nome.</div> : null}
            </div>
        </aside>
    );

    /* ------------------------------ cabeçalho do editor ------------------------------ */

    let cabecalho: React.ReactNode = null;
    if (grupoSel) {
        const n = Array.from(rCargo).filter((k) => validas.has(k)).length;
        cabecalho = (
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="min-w-0 flex-1 basis-[220px]">
                    <div className="text-[18px] font-extrabold">Cargo {grupoSel.nome}</div>
                    <div className={`text-[13px] ${MUDO}`}>
                        {n} de {totalChaves} telas · {plural(grupoSel.membros.length, "pessoa", "pessoas")}
                        {grupoSel.ativo ? "" : " · inativo"}
                    </div>
                </div>
                {podeEditar ? (
                    <>
                        <button type="button" className={BTN_PEQ} onClick={() => setCopiar({ nome: `${grupoSel.nome} (cópia)` })}>
                            <IconCopy size={16} /> Novo cargo a partir deste
                        </button>
                        {grupoSel.slug !== "adm" && (!grupoSel.ativo || grupoSel.membros.length === 0) ? (
                            <button type="button" className={BTN_PEQ} disabled={salvando} onClick={() => void alternarAtivo(grupoSel)}>
                                {grupoSel.ativo ? "Desativar" : "Ativar"}
                            </button>
                        ) : null}
                    </>
                ) : null}
            </div>
        );
    } else if (pessoaSel) {
        const antes = paginasDoGrupo(pessoaSel.grupo_id);
        const depois = paginasDoGrupo(rGrupoPessoa);
        const ganha = Array.from(depois).filter((k) => validas.has(k) && !antes.has(k)).length;
        const perde = Array.from(antes).filter((k) => validas.has(k) && !depois.has(k)).length;
        cabecalho = (
            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1 basis-[220px]">
                    <div className="text-[18px] font-extrabold">{pessoaSel.nome}</div>
                    <div className={`text-[13px] ${MUDO}`}>
                        {pessoaSel.usuario ? `${pessoaSel.usuario} · ` : ""}
                        {efetivo(rGrupoPessoa, rEx).size} telas · as exceções valem só para esta pessoa
                    </div>
                </div>
                <label className="flex min-w-[220px] flex-1 flex-col gap-1 sm:flex-none">
                    <span className={ROTULO}>Cargo</span>
                    <select className={CAMPO} value={rGrupoPessoa ?? ""} disabled={!podeEditar} onChange={(e) => setRGrupoPessoa(e.target.value ? Number(e.target.value) : null)}>
                        {rGrupoPessoa == null ? <option value="">Escolha o cargo</option> : null}
                        {ativos.map((g) => (
                            <option key={g.id} value={g.id}>
                                {g.nome}
                            </option>
                        ))}
                    </select>
                </label>
                {rGrupoPessoa !== pessoaSel.grupo_id && rGrupoPessoa != null ? (
                    <div className="w-full rounded-xl bg-[#FCF2CF] px-3.5 py-2.5 text-[13.5px] font-bold text-[#7A5600] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]">
                        Trocando de cargo: ganha {plural(ganha, "tela", "telas")} e perde {plural(perde, "tela", "telas")} (sem contar as exceções). Só muda ao gravar.
                    </div>
                ) : null}
            </div>
        );
    }

    /* ------------------------------ página ------------------------------ */

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina Icone={IconShieldLock} titulo="Permissões" />
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="tablist">
                    {(
                        [
                            ["cargos", "Cargos e pessoas"],
                            ["quem", "Quem acessa"],
                            ["comparar", "Comparar cargos"],
                            ["ver", "Ver o menu como"],
                        ] as [Vista, string][]
                    ).map(([k, r]) => (
                        <button key={k} type="button" role="tab" aria-selected={vista === k} className={PILULA(vista === k)} onClick={() => irVista(k)}>
                            {r}
                        </button>
                    ))}
                </div>
                {!podeEditar && !carregando && !erro ? (
                    <div className="flex items-start gap-2 rounded-xl bg-[#FCF2CF] px-3.5 py-3 text-[14px] font-bold text-[#7A5600] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]">
                        <IconAlertTriangle size={18} className="mt-0.5 shrink-0" /> Você pode consultar. Só quem tem Gestão altera cargos e telas.
                    </div>
                ) : null}
                {erro ? (
                    <div role="alert" className="flex items-start gap-2 rounded-xl bg-[#FDECEA] px-4 py-3 text-[14px] font-bold text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">
                        <span className="flex-1">{erro}</span>
                        <button type="button" aria-label="Fechar aviso" onClick={() => setErro(null)} className="grid size-7 place-items-center">
                            <IconX size={16} />
                        </button>
                    </div>
                ) : null}
                {carregando ? <div className={`py-10 text-center ${MUDO}`}>Carregando…</div> : null}

                {!carregando && vista === "cargos" ? (
                    <div className="grid items-start gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
                        {lateral}
                        <section className={CARTAO} aria-label="Telas liberadas">
                            <div className="flex flex-col gap-3 border-b border-[#E3E8F0] p-3.5 dark:border-white/[0.08]">
                                {cabecalho}
                                <div className="flex flex-wrap gap-2">
                                    <div className="relative min-w-0 flex-1 basis-[240px]">
                                        <IconSearch size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8396]" />
                                        <input type="search" className={`${CAMPO} pl-10`} placeholder="Procurar tela, seção ou chave" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Procurar tela" />
                                    </div>
                                    <button type="button" className={BTN_PEQ + " h-12"} onClick={() => setAbertos(Object.fromEntries(mods.map((m) => [m.id, true])))}>
                                        Abrir tudo
                                    </button>
                                    <button type="button" className={BTN_PEQ + " h-12"} onClick={() => setAbertos({})}>
                                        Fechar tudo
                                    </button>
                                </div>
                                {pessoaSel ? (
                                    <div className={`text-[13px] ${MUDO}`}>
                                        Em cada tela: <b>Pelo cargo</b> segue o cargo; <b>Dar</b> libera só para esta pessoa; <b>Tirar</b> bloqueia só para ela.
                                    </div>
                                ) : null}
                            </div>
                            {sel ? (
                                <>
                                    {arvore}
                                    {blocoOutras}
                                    {q && !arvore.some(Boolean) && !outrasFiltradas.length ? <div className={`p-8 text-center ${MUDO}`}>Nenhuma tela com esse nome.</div> : null}
                                </>
                            ) : (
                                <div className={`p-8 text-center ${MUDO}`}>Escolha um cargo ou uma pessoa.</div>
                            )}
                            {sel ? (
                                <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-2.5 rounded-b-2xl border-t border-[#E3E8F0] bg-[#FFFFFF] p-3 dark:border-white/[0.12] dark:bg-[#232B3F] lg:bottom-0">
                                    <span className={`min-w-0 flex-1 text-[13.5px] font-bold ${MUDO}`}>{mudancas ? `${plural(mudancas, "alteração", "alterações")} sem gravar` : "Tudo gravado"}</span>
                                    <button type="button" className={BTN} disabled={!mudancas || salvando} onClick={desfazer}>
                                        Desfazer
                                    </button>
                                    <button type="button" className={BTN_PRI} disabled={!mudancas || salvando} onClick={() => void gravar()}>
                                        {salvando ? "Gravando…" : "Gravar"}
                                    </button>
                                </div>
                            ) : null}
                        </section>
                    </div>
                ) : null}
                {!carregando && vista === "quem" ? vQuem() : null}
                {!carregando && vista === "comparar" ? vComparar() : null}
                {!carregando && vista === "ver" ? vVer() : null}
            </div>

            {/* ------------------------------ janelas ------------------------------ */}
            {trocar ? (
                <Janela
                    titulo="Alterações sem gravar"
                    aoFechar={() => setTrocar(null)}
                    rodape={
                        <>
                            <button type="button" className={BTN} onClick={() => setTrocar(null)}>
                                Voltar
                            </button>
                            <button
                                type="button"
                                className={BTN_PRI}
                                onClick={() => {
                                    const t = trocar;
                                    setTrocar(null);
                                    if (t === "vista") {
                                        abrirSel(sel);
                                        if (proximaVista) setVista(proximaVista);
                                    } else abrirSel(t);
                                }}
                            >
                                Descartar e seguir
                            </button>
                        </>
                    }
                >
                    <p className="text-[15px]">Há {plural(mudancas, "alteração", "alterações")} sem gravar. Volte e clique em Gravar, ou descarte para seguir.</p>
                </Janela>
            ) : null}
            {copiar && grupoSel ? (
                <Janela
                    titulo={`Novo cargo a partir de ${grupoSel.nome}`}
                    aoFechar={() => setCopiar(null)}
                    rodape={
                        <>
                            <button type="button" className={BTN} onClick={() => setCopiar(null)}>
                                Voltar
                            </button>
                            <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void criarCopia()}>
                                Criar cargo
                            </button>
                        </>
                    }
                >
                    <label className="flex flex-col gap-1.5">
                        <span className={ROTULO}>Nome do cargo</span>
                        <input className={CAMPO} value={copiar.nome} maxLength={80} autoFocus onChange={(e) => setCopiar({ nome: e.target.value })} />
                    </label>
                    <p className={`mt-3 text-[13.5px] ${MUDO}`}>O cargo novo começa com as mesmas telas marcadas agora ({Array.from(rCargo).filter((k) => validas.has(k)).length}); depois você ajusta.</p>
                </Janela>
            ) : null}
            {igualar ? (
                <Janela
                    titulo="Copiar as telas de um cargo"
                    aoFechar={() => setIgualar(null)}
                    rodape={
                        <>
                            <button type="button" className={BTN} onClick={() => setIgualar(null)}>
                                Voltar
                            </button>
                            <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void fazerIgualar()}>
                                Copiar e gravar
                            </button>
                        </>
                    }
                >
                    <p className="text-[15px]">
                        O cargo <b>{grupoPorId.get(igualar.para)?.nome}</b> passa a ter exatamente as telas de <b>{grupoPorId.get(igualar.de)?.nome}</b>. Vale para todas as pessoas desse cargo no próximo acesso.
                    </p>
                </Janela>
            ) : null}
            {aviso ? (
                <div role="status" className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-1/2 z-[80] w-[min(92vw,480px)] -translate-x-1/2 rounded-xl bg-[#313C55] px-4 py-3 text-center text-[14.5px] font-bold text-white shadow-lg dark:bg-[#F2CB3F] dark:text-[#313C55] lg:bottom-6">
                    {aviso}
                </div>
            ) : null}
        </div>
    );
}

/** Controle de uma tela para a pessoa: Pelo cargo · Dar · Tirar. */
function ControlePessoa({ tem, peloCargo, ex, definir, desligado, nome }: { tem: boolean; peloCargo: boolean; ex?: Excecao; definir: (v: Excecao | "cargo") => void; desligado: boolean; nome: string }) {
    const atual = ex === "dar" && !peloCargo ? "dar" : ex === "tirar" && peloCargo ? "tirar" : "cargo";
    const b = (on: boolean, cor: string) =>
        `h-9 px-3 text-[12.5px] font-extrabold disabled:opacity-35 ${on ? cor : "bg-white text-[#5B6478] dark:bg-[#232B3F] dark:text-[#AEB9CF]"}`;
    return (
        <div className="flex shrink-0 items-center gap-2.5">
            <span className={`w-[52px] text-right text-[12.5px] font-extrabold ${tem ? "text-[#3F5A0A] dark:text-[#CFE38A]" : "text-[#5B6478] dark:text-[#AEB9CF]"}`}>{tem ? "vê" : "não vê"}</span>
            <div role="group" aria-label={`Acesso a ${nome}`} className="inline-flex overflow-hidden rounded-[10px] border border-[#C9D1DE] dark:border-white/[0.2]">
                <button type="button" aria-pressed={atual === "cargo"} disabled={desligado} title={peloCargo ? "O cargo libera" : "O cargo não libera"} onClick={() => definir("cargo")} className={b(atual === "cargo", "bg-[#F1F4F8] text-[#313C55] dark:bg-[#1C2334] dark:text-white")}>
                    Pelo cargo
                </button>
                <button type="button" aria-pressed={atual === "dar"} disabled={desligado || peloCargo} onClick={() => definir("dar")} className={`border-l border-[#C9D1DE] dark:border-white/[0.2] ${b(atual === "dar", "bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/20 dark:text-[#CFE38A]")}`}>
                    Dar
                </button>
                <button type="button" aria-pressed={atual === "tirar"} disabled={desligado || !peloCargo} onClick={() => definir("tirar")} className={`border-l border-[#C9D1DE] dark:border-white/[0.2] ${b(atual === "tirar", "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]")}`}>
                    Tirar
                </button>
            </div>
        </div>
    );
}
