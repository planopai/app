"use client";

/**
 * Organizar menu (Gestão) — 08/10/2026. Rota /organizar-menu, no módulo Gestão (seção Pessoas e acesso).
 *
 * A Gestão define, para todos: os módulos (nome, descrição, ícone, ordem), as seções dentro de cada módulo,
 * em que módulo e seção cada tela fica, e os itens fixos (Acesso rápido do Início).
 * Salvar grava uma versão nova (menu_modulos.php); o histórico permite voltar a uma versão anterior.
 * Mudar uma tela de módulo NÃO muda permissão: quem não tem a página da tela continua sem vê-la.
 *
 * Acesso: quem tem a página "gestao" (sem chave nova) ou o cargo adm. O servidor confere de novo ao salvar.
 */
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    IconArrowDown,
    IconArrowUp,
    IconChevronRight,
    IconFolderPlus,
    IconHistory,
    IconPencil,
    IconArrowBackUp,
    IconRestore,
    IconStar,
    IconTrash,
    IconX,
} from "@tabler/icons-react";
import { FIXOS, MODULOS, type ItemModulo, type Modulo } from "@/components/shell/modulos";
import {
    agruparPorSecao,
    catalogoTelas,
    idParaModulo,
    paraConfig,
    nomeOriginal,
    retratoDesatualizado,
    secoesDe,
} from "@/components/shell/menuOrganizado";
import { menuGet, menuPost, recarregarMenu, useMenu } from "@/components/shell/useMenu";
import { iconePorNome, nomeDoIcone } from "@/components/shell/icones";
import {
    AvisoFaixa,
    BTN,
    BTN_PERIGO,
    BTN_PRI,
    CAMPO,
    CARTAO,
    Confirmar,
    EscolherIcone,
    Janela,
    PerguntaTexto,
    QUAD,
    ROTULO,
} from "@/components/shell/menuUi";

const FIXOS_ID = "__fixos";
const MAX_FIXOS = 12;

type Versao = { id: number; salvo_por: string; salvo_em: string; padrao: boolean; modulos: number };
type Pergunta =
    | { tipo: "novo-modulo" }
    | { tipo: "nova-secao"; modulo: string; item: string }
    | { tipo: "renomear-secao"; modulo: string; secao: string };
type Aviso = { tipo: "salvar" } | { tipo: "padrao" } | { tipo: "restaurar"; versao: Versao } | { tipo: "excluir"; modulo: string };

function copiar(modulos: Modulo[]): Modulo[] {
    return modulos.map((m) => ({ ...m, hub: { ...m.hub }, itens: m.itens.map((i) => ({ ...i })) }));
}

function dataHora(v: string) {
    const d = new Date(String(v).replace(" ", "T"));
    return isNaN(d.getTime()) ? v : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function OrganizarMenuPage() {
    const menu = useMenu();
    const [modulos, setModulos] = useState<Modulo[] | null>(null);
    const [fixos, setFixos] = useState<ItemModulo[]>([]);
    const [removidos, setRemovidos] = useState<string[]>([]);
    const [sel, setSel] = useState<string>("");
    const [alterado, setAlterado] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");
    const [ok, setOk] = useState("");
    const [pergunta, setPergunta] = useState<Pergunta | null>(null);
    const [aviso, setAviso] = useState<Aviso | null>(null);
    const [icone, setIcone] = useState(false);
    const [historico, setHistorico] = useState<Versao[] | null>(null);

    /* rascunho = o menu atual da Gestão */
    const carregarRascunho = () => {
        setModulos(copiar(menu.modulos));
        setFixos([...menu.fixos]);
        setRemovidos([...(menu.organizacao?.config?.removidos || [])]);
        setAlterado(false);
    };
    /* abre com o menu atual; depois de salvar ou restaurar, recarrega com o que ficou gravado */
    useEffect(() => {
        if (!menu.carregado || modulos !== null || salvando) return;
        carregarRascunho();
        setSel((s) => (s && (s === FIXOS_ID || menu.modulos.some((m) => m.id === s)) ? s : menu.modulos[0]?.id || FIXOS_ID));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modulos, menu.carregado, menu.modulos, menu.fixos, salvando]);

    /* sai da tela com mudanças sem salvar: o navegador avisa */
    useEffect(() => {
        if (!alterado) return;
        const f = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", f);
        return () => window.removeEventListener("beforeunload", f);
    }, [alterado]);

    const mudar = (n: Modulo[]) => {
        setModulos(n);
        setAlterado(true);
        setOk("");
    };
    const mudarModulo = (id: string, f: (m: Modulo) => Modulo) => modulos && mudar(modulos.map((m) => (m.id === id ? f(m) : m)));

    const atual = modulos?.find((m) => m.id === sel) || null;
    const catalogo = useMemo(() => catalogoTelas(), []);
    const desatualizado = retratoDesatualizado(menu.organizacao?.config);

    /* ===== módulos ===== */
    const moverModulo = (i: number, d: number) => {
        if (!modulos) return;
        const n = [...modulos];
        [n[i], n[i + d]] = [n[i + d], n[i]];
        mudar(n);
    };
    const novoModulo = (nome: string) => {
        if (!modulos) return;
        const id = idParaModulo(nome, [...modulos.map((m) => m.id), ...MODULOS.map((m) => m.id)]);
        mudar([...modulos, { id, titulo: nome, desc: "", icone: iconePorNome("folder")!, hub: { href: `/modulo/${id}`, slug: "" }, itens: [] }]);
        setSel(id);
        setPergunta(null);
    };
    const excluirModulo = (id: string) => {
        if (!modulos) return;
        mudar(modulos.filter((m) => m.id !== id));
        if (MODULOS.some((m) => m.id === id)) setRemovidos((r) => (r.includes(id) ? r : [...r, id]));
        setSel(modulos.find((m) => m.id !== id)?.id || FIXOS_ID);
        setAviso(null);
    };

    /* ===== telas ===== */
    const moverItem = (modId: string, pos: number, d: number) =>
        mudarModulo(modId, (m) => {
            const n = [...m.itens];
            [n[pos], n[pos + d]] = [n[pos + d], n[pos]];
            return { ...m, itens: n };
        });
    const definirSecao = (modId: string, itemId: string, secao: string) =>
        mudarModulo(modId, (m) => ({ ...m, itens: agruparPorSecao(m.itens.map((i) => (i.id === itemId ? { ...i, secao: secao || undefined } : i))) }));
    const moverParaModulo = (itemId: string, origem: string, destino: string) => {
        if (!modulos || origem === destino) return;
        const item = modulos.find((m) => m.id === origem)?.itens.find((i) => i.id === itemId);
        if (!item) return;
        mudar(
            modulos.map((m) => {
                if (m.id === origem) return { ...m, itens: m.itens.filter((i) => i.id !== itemId) };
                if (m.id === destino) return { ...m, itens: agruparPorSecao([...m.itens, { ...item, secao: undefined }]) };
                return m;
            }),
        );
        const nomeDestino = modulos.find((m) => m.id === destino)?.titulo;
        setOk(`"${item.titulo}" foi para ${nomeDestino}. Salve para valer para todos.`);
    };

    /* ===== seções ===== */
    const renomearSecao = (modId: string, antiga: string, nova: string) =>
        mudarModulo(modId, (m) => ({ ...m, itens: agruparPorSecao(m.itens.map((i) => (i.secao === antiga ? { ...i, secao: nova || undefined } : i))) }));
    const tirarSecao = (modId: string, secao: string) => renomearSecao(modId, secao, "");
    const moverSecao = (modId: string, secao: string, d: number) =>
        mudarModulo(modId, (m) => {
            const lista = secoesDe(m.itens);
            const i = lista.indexOf(secao);
            if (i < 0 || i + d < 0 || i + d >= lista.length) return m;
            [lista[i], lista[i + d]] = [lista[i + d], lista[i]];
            const semSecao = m.itens.filter((x) => !x.secao);
            return { ...m, itens: [...semSecao, ...lista.flatMap((s) => m.itens.filter((x) => x.secao === s))] };
        });

    /* ===== nome da tela (vale em todo lugar: menu, entradas, pesquisa, cabeçalho e atalhos) ===== */
    const renomearTela = (id: string, nome: string) => {
        const t = nome.slice(0, 60);
        if (modulos) mudar(modulos.map((m) => (m.itens.some((i) => i.id === id) ? { ...m, itens: m.itens.map((i) => (i.id === id ? { ...i, titulo: t } : i)) } : m)));
        setFixos((fs) => fs.map((f) => (f.id === id ? { ...f, titulo: t } : f)));
        setAlterado(true);
    };
    /* ao sair do campo: nome vazio volta ao original */
    const conferirNome = (id: string, comoFixo = false) => {
        const atualNome = (comoFixo ? fixos.find((f) => f.id === id) : modulos?.flatMap((m) => m.itens).find((i) => i.id === id))?.titulo || "";
        if (!atualNome.trim()) renomearTela(id, nomeOriginal(id, comoFixo));
    };

    /* ===== fixos ===== */
    const moverFixo = (i: number, d: number) => {
        const n = [...fixos];
        [n[i], n[i + d]] = [n[i + d], n[i]];
        setFixos(n);
        setAlterado(true);
    };
    const tirarFixo = (id: string) => {
        setFixos(fixos.filter((f) => f.id !== id));
        setAlterado(true);
    };
    const porFixo = (id: string) => {
        const base = FIXOS.find((f) => f.id === id) || catalogo.get(id)?.item;
        if (!base || fixos.some((f) => f.id === id) || fixos.length >= MAX_FIXOS) return;
        const renomeado = modulos?.flatMap((m) => m.itens).find((i) => i.id === id);
        const it = renomeado && renomeado.titulo !== nomeOriginal(id) ? { ...base, titulo: renomeado.titulo } : base;
        setFixos([...fixos, it]);
        setAlterado(true);
    };

    /* ===== gravar ===== */
    const salvar = async (padrao = false) => {
        if (!modulos) return;
        setSalvando(true);
        setErro("");
        try {
            const config = padrao ? { ...paraConfig(MODULOS, FIXOS, []), padrao: true } : paraConfig(modulos, fixos, removidos);
            const r = await menuPost("salvar_organizacao", { config });
            await recarregarMenu();
            setAlterado(false);
            setModulos(null); // recarrega o rascunho com o que ficou salvo
            setOk(padrao ? "O menu voltou ao padrão do sistema. Já vale para todos." : r.msg || "Menu salvo. Já vale para todos.");
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar.");
        } finally {
            setSalvando(false);
            setAviso(null);
        }
    };

    const abrirHistorico = async () => {
        setErro("");
        try {
            setHistorico(await menuGet<Versao[]>("historico"));
        } catch (e: any) {
            setErro(e?.message || "Não foi possível abrir o histórico.");
        }
    };
    const restaurarVersao = async (v: Versao) => {
        setSalvando(true);
        try {
            const r = await menuPost("restaurar_versao", { id: v.id });
            await recarregarMenu();
            setModulos(null);
            setHistorico(null);
            setOk(r.msg || "Versão restaurada.");
        } catch (e: any) {
            setErro(e?.message || "Não foi possível restaurar.");
        } finally {
            setSalvando(false);
            setAviso(null);
        }
    };

    /* ===== telas da página ===== */
    if (!menu.carregado || modulos === null) {
        return <div className="min-h-[100dvh] bg-[#F6F8FB] p-6 text-sm font-bold text-[#5B6478] dark:bg-[#161C2A] dark:text-[#AEB9CF]">Carregando o menu…</div>;
    }
    if (!menu.podeOrganizar) {
        return (
            <div className="min-h-[100dvh] bg-[#F6F8FB] p-4 text-[#313C55] dark:bg-[#161C2A] dark:text-white lg:p-10">
                <div className={`${CARTAO} mx-auto max-w-xl p-6`}>
                    <h1 className="text-2xl font-extrabold">Organizar menu</h1>
                    <p className="mt-2 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">Só a Gestão organiza o menu de todos. Para ajustar o seu, use Personalizar menu.</p>
                    <Link href="/personalizar-barra" className={`${BTN_PRI} mt-4`}>
                        Personalizar meu menu
                    </Link>
                </div>
            </div>
        );
    }

    const secoesAtual = atual ? secoesDe(atual.itens) : [];
    const foraDosFixos = Array.from(catalogo.values())
        .map((t) => FIXOS.find((f) => f.id === t.item.id) || t.item)
        .filter((it) => !fixos.some((f) => f.id === it.id));

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] text-[#313C55] dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <h1 className="text-2xl font-extrabold lg:text-[28px]">Organizar menu</h1>
                <p className="mt-1 max-w-3xl text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">
                    Defina os módulos, as seções, onde cada tela fica e o nome de cada uma. Vale para todos ao salvar. Mudar uma tela de lugar não muda quem pode abri-la: isso
                    continua em Permissões.
                </p>

                <div className="mt-4 space-y-2">
                    {!menu.tabelasProntas ? <AvisoFaixa tom="erro">As tabelas do menu ainda não existem no banco. Rode o menu_modulos.sql antes de salvar.</AvisoFaixa> : null}
                    {menu.tabelasProntas && desatualizado ? (
                        <AvisoFaixa tom="info">
                            {menu.organizacao ? "Há telas novas no sistema." : "O menu ainda está no padrão do sistema."} Salve uma vez para que todas as telas possam
                            virar atalho na barra de cada um.
                        </AvisoFaixa>
                    ) : null}
                    {erro ? <AvisoFaixa tom="erro">{erro}</AvisoFaixa> : null}
                    {ok ? <AvisoFaixa tom="ok">{ok}</AvisoFaixa> : null}
                    {menu.organizacao ? (
                        <p className="text-[13px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">
                            Última gravação: {dataHora(menu.organizacao.salvo_em)} por {menu.organizacao.salvo_por}
                            {menu.organizacao.config?.padrao ? " (padrão do sistema)" : ""}.
                        </p>
                    ) : null}
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                    {/* ===== LISTA DE MÓDULOS ===== */}
                    <nav aria-label="Módulos" className="space-y-2">
                        <button
                            type="button"
                            onClick={() => setSel(FIXOS_ID)}
                            aria-current={sel === FIXOS_ID}
                            className={`${CARTAO} flex min-h-[60px] w-full items-center gap-3 px-3.5 text-left ${sel === FIXOS_ID ? "!border-[#3D6A99] ring-2 ring-[#3D6A99]/25" : ""}`}
                        >
                            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#FCF3CC] dark:bg-[#F2CB3F]/15">
                                <IconStar size={20} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block font-extrabold">Itens fixos</span>
                                <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Acesso rápido do Início · {fixos.length}</span>
                            </span>
                            <IconChevronRight size={18} className="text-[#7A8396]" />
                        </button>

                        <p className={`${ROTULO} pt-3`}>Módulos, na ordem do menu</p>
                        {modulos.map((m, i) => {
                            const I = m.icone;
                            const on = sel === m.id;
                            return (
                                <div
                                    key={m.id}
                                    className={`${CARTAO} flex min-h-[60px] items-center gap-2 py-2 pl-2 pr-2 ${on ? "!border-[#3D6A99] ring-2 ring-[#3D6A99]/25" : ""}`}
                                >
                                    <button type="button" onClick={() => setSel(m.id)} aria-current={on} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 text-left">
                                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EEF2F7] dark:bg-white/10">
                                            <I size={20} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-extrabold">{m.titulo}</span>
                                            <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                {m.itens.length} {m.itens.length === 1 ? "tela" : "telas"}
                                            </span>
                                        </span>
                                    </button>
                                    <button type="button" className={QUAD} disabled={i === 0} onClick={() => moverModulo(i, -1)} aria-label={`Subir ${m.titulo}`}>
                                        <IconArrowUp size={18} />
                                    </button>
                                    <button type="button" className={QUAD} disabled={i === modulos.length - 1} onClick={() => moverModulo(i, 1)} aria-label={`Descer ${m.titulo}`}>
                                        <IconArrowDown size={18} />
                                    </button>
                                </div>
                            );
                        })}
                        <button type="button" className={`${BTN} w-full`} onClick={() => setPergunta({ tipo: "novo-modulo" })}>
                            <IconFolderPlus size={18} /> Novo módulo
                        </button>
                    </nav>

                    {/* ===== EDITOR ===== */}
                    <section aria-label="Editar" className="min-w-0">
                        {sel === FIXOS_ID ? (
                            <div className={`${CARTAO} p-4 lg:p-5`}>
                                <h2 className="text-xl font-extrabold">Itens fixos</h2>
                                <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                                    Aparecem no Acesso rápido do Início (o Início não aparece lá) e na pesquisa. Cada pessoa só vê os que tem permissão. Até {MAX_FIXOS}.
                                </p>
                                <div className="mt-4 space-y-2">
                                    {fixos.map((f, i) => {
                                        const I = f.icone;
                                        return (
                                            <div key={f.id} className="flex items-center gap-2 rounded-xl border border-[#E3E8F0] py-1.5 pl-3 pr-1.5 dark:border-white/[0.12]">
                                                <I size={20} className="shrink-0" />
                                                <input
                                                    className={`${CAMPO} h-11 min-w-0 flex-1 font-bold`}
                                                    value={f.titulo}
                                                    maxLength={60}
                                                    aria-label={`Nome de ${nomeOriginal(f.id, true)}`}
                                                    title={`Nome original: ${nomeOriginal(f.id, true)}`}
                                                    onChange={(e) => renomearTela(f.id, e.target.value)}
                                                    onBlur={() => conferirNome(f.id, true)}
                                                />
                                                <button type="button" className={QUAD} disabled={i === 0} onClick={() => moverFixo(i, -1)} aria-label={`Subir ${f.titulo}`}>
                                                    <IconArrowUp size={18} />
                                                </button>
                                                <button type="button" className={QUAD} disabled={i === fixos.length - 1} onClick={() => moverFixo(i, 1)} aria-label={`Descer ${f.titulo}`}>
                                                    <IconArrowDown size={18} />
                                                </button>
                                                <button type="button" className={QUAD} onClick={() => tirarFixo(f.id)} aria-label={`Tirar ${f.titulo} dos fixos`}>
                                                    <IconX size={18} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {!fixos.length ? <p className="text-sm text-[#5B6478] dark:text-[#AEB9CF]">Nenhum item fixo.</p> : null}
                                </div>
                                <label className={`${ROTULO} mt-5`} htmlFor="por-fixo">
                                    Pôr nos fixos
                                </label>
                                <select
                                    id="por-fixo"
                                    className={CAMPO}
                                    value=""
                                    disabled={fixos.length >= MAX_FIXOS}
                                    onChange={(e) => {
                                        porFixo(e.target.value);
                                        e.target.value = "";
                                    }}
                                >
                                    <option value="">{fixos.length >= MAX_FIXOS ? "Limite atingido" : "Escolha uma tela…"}</option>
                                    {foraDosFixos.map((it) => (
                                        <option key={it.id} value={it.id}>
                                            {it.titulo}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : atual ? (
                            <div className={`${CARTAO} p-4 lg:p-5`}>
                                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                                    <div>
                                        <label className={ROTULO} htmlFor="mod-nome">
                                            Nome do módulo
                                        </label>
                                        <input
                                            id="mod-nome"
                                            className={CAMPO}
                                            value={atual.titulo}
                                            maxLength={40}
                                            onChange={(e) => mudarModulo(atual.id, (m) => ({ ...m, titulo: e.target.value }))}
                                        />
                                    </div>
                                    <div>
                                        <label className={ROTULO} htmlFor="mod-desc">
                                            Descrição
                                        </label>
                                        <input
                                            id="mod-desc"
                                            className={CAMPO}
                                            value={atual.desc}
                                            maxLength={80}
                                            onChange={(e) => mudarModulo(atual.id, (m) => ({ ...m, desc: e.target.value }))}
                                        />
                                    </div>
                                    <div>
                                        <span className={ROTULO}>Ícone</span>
                                        <button type="button" className={`${BTN} h-12 w-full`} onClick={() => setIcone(true)} aria-label="Trocar o ícone do módulo">
                                            <atual.icone size={20} /> Trocar
                                        </button>
                                    </div>
                                </div>
                                {atual.hub.slug === "" ? (
                                    <p className="mt-2 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Módulo criado aqui. Página de entrada: {atual.hub.href}</p>
                                ) : null}

                                <div className="mt-5 flex flex-wrap items-center gap-2">
                                    <h2 className="flex-1 text-lg font-extrabold">Telas do módulo</h2>
                                    <span className="text-[13px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">Para criar uma seção, escolha "Nova seção…" numa tela.</span>
                                </div>

                                {!atual.itens.length ? (
                                    <div className="mt-3 rounded-xl border border-dashed border-[#C9D1DE] p-5 text-sm text-[#5B6478] dark:border-white/20 dark:text-[#AEB9CF]">
                                        Nenhuma tela neste módulo. Traga telas de outro módulo pelo campo "Mover para".
                                    </div>
                                ) : null}

                                <div className="mt-3 space-y-2">
                                    {atual.itens.map((it, pos) => {
                                        const I = it.icone;
                                        const anterior = atual.itens[pos - 1];
                                        const proximo = atual.itens[pos + 1];
                                        const mesmaSecao = (o?: ItemModulo) => !!o && (o.secao || "") === (it.secao || "");
                                        const comecaSecao = !!it.secao && it.secao !== anterior?.secao;
                                        const iSecao = it.secao ? secoesAtual.indexOf(it.secao) : -1;
                                        return (
                                            <React.Fragment key={it.id}>
                                                {comecaSecao ? (
                                                    <div className="flex flex-wrap items-center gap-2 pt-3">
                                                        <span className="min-w-0 flex-1 text-xs font-extrabold uppercase tracking-[0.1em] text-[#5B6478] dark:text-[#AEB9CF]">
                                                            Seção: {it.secao}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            className={QUAD}
                                                            onClick={() => setPergunta({ tipo: "renomear-secao", modulo: atual.id, secao: it.secao! })}
                                                            aria-label={`Renomear a seção ${it.secao}`}
                                                        >
                                                            <IconPencil size={18} />
                                                        </button>
                                                        <button type="button" className={QUAD} disabled={iSecao <= 0} onClick={() => moverSecao(atual.id, it.secao!, -1)} aria-label={`Subir a seção ${it.secao}`}>
                                                            <IconArrowUp size={18} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={QUAD}
                                                            disabled={iSecao === secoesAtual.length - 1}
                                                            onClick={() => moverSecao(atual.id, it.secao!, 1)}
                                                            aria-label={`Descer a seção ${it.secao}`}
                                                        >
                                                            <IconArrowDown size={18} />
                                                        </button>
                                                        <button type="button" className={QUAD} onClick={() => tirarSecao(atual.id, it.secao!)} aria-label={`Desfazer a seção ${it.secao}`} title="Desfazer a seção (as telas ficam sem seção)">
                                                            <IconX size={18} />
                                                        </button>
                                                    </div>
                                                ) : null}
                                                <div className="rounded-xl border border-[#E3E8F0] p-2.5 dark:border-white/[0.12]">
                                                    <div className="flex items-center gap-2">
                                                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EEF2F7] dark:bg-white/10">
                                                            <I size={20} />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate font-extrabold">{it.titulo}</span>
                                                            <span className="block truncate text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                                {it.href} · página {it.slugs.join(" ou ")}
                                                            </span>
                                                        </span>
                                                        <button type="button" className={QUAD} disabled={!mesmaSecao(anterior)} onClick={() => moverItem(atual.id, pos, -1)} aria-label={`Subir ${it.titulo}`}>
                                                            <IconArrowUp size={18} />
                                                        </button>
                                                        <button type="button" className={QUAD} disabled={!mesmaSecao(proximo)} onClick={() => moverItem(atual.id, pos, 1)} aria-label={`Descer ${it.titulo}`}>
                                                            <IconArrowDown size={18} />
                                                        </button>
                                                    </div>
                                                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                                        <div className="sm:col-span-2">
                                                            <label className="sr-only" htmlFor={`nome-${it.id}`}>
                                                                Nome de {nomeOriginal(it.id)} no menu
                                                            </label>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    id={`nome-${it.id}`}
                                                                    className={CAMPO}
                                                                    value={it.titulo}
                                                                    maxLength={60}
                                                                    placeholder={nomeOriginal(it.id)}
                                                                    onChange={(e) => renomearTela(it.id, e.target.value)}
                                                                    onBlur={() => conferirNome(it.id)}
                                                                />
                                                                {it.titulo !== nomeOriginal(it.id) ? (
                                                                    <button
                                                                        type="button"
                                                                        className={`${QUAD} size-12`}
                                                                        onClick={() => renomearTela(it.id, nomeOriginal(it.id))}
                                                                        aria-label={`Voltar ao nome original: ${nomeOriginal(it.id)}`}
                                                                        title={`Voltar ao nome original: ${nomeOriginal(it.id)}`}
                                                                    >
                                                                        <IconArrowBackUp size={18} />
                                                                    </button>
                                                                ) : null}
                                                            </div>
                                                            {it.titulo !== nomeOriginal(it.id) ? (
                                                                <p className="mt-1 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Nome original: {nomeOriginal(it.id)}</p>
                                                            ) : null}
                                                        </div>
                                                        <label className="block">
                                                            <span className="sr-only">Seção de {it.titulo}</span>
                                                            <select
                                                                className={CAMPO}
                                                                value={it.secao || ""}
                                                                onChange={(e) => {
                                                                    const v = e.target.value;
                                                                    if (v === "__nova") setPergunta({ tipo: "nova-secao", modulo: atual.id, item: it.id });
                                                                    else definirSecao(atual.id, it.id, v);
                                                                }}
                                                            >
                                                                <option value="">Sem seção</option>
                                                                {secoesAtual.map((s) => (
                                                                    <option key={s} value={s}>
                                                                        Seção: {s}
                                                                    </option>
                                                                ))}
                                                                <option value="__nova">Nova seção…</option>
                                                            </select>
                                                        </label>
                                                        <label className="block">
                                                            <span className="sr-only">Mover {it.titulo} para outro módulo</span>
                                                            <select className={CAMPO} value={atual.id} onChange={(e) => moverParaModulo(it.id, atual.id, e.target.value)}>
                                                                {modulos.map((m) => (
                                                                    <option key={m.id} value={m.id}>
                                                                        {m.id === atual.id ? `Em ${m.titulo}` : `Mover para ${m.titulo}`}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </label>
                                                    </div>
                                                </div>
                                            </React.Fragment>
                                        );
                                    })}
                                </div>

                                <div className="mt-5 border-t border-[#E3E8F0] pt-4 dark:border-white/[0.12]">
                                    <button
                                        type="button"
                                        className={BTN_PERIGO}
                                        disabled={atual.itens.length > 0 || modulos.length <= 1}
                                        onClick={() => setAviso({ tipo: "excluir", modulo: atual.id })}
                                    >
                                        <IconTrash size={18} /> Excluir módulo
                                    </button>
                                    {atual.itens.length > 0 ? (
                                        <span className="ml-3 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Para excluir, mova antes as telas para outro módulo.</span>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}
                    </section>
                </div>
            </div>

            {/* ===== BARRA DE AÇÕES (presa embaixo ao rolar; no celular, acima da barra de atalhos) ===== */}
            <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 mt-6 border-t border-[#E3E8F0] bg-[#FFFFFF] px-4 py-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:bottom-0">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 lg:px-6">
                    <span className="min-w-0 flex-1 text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF]">{alterado ? "Mudanças ainda não salvas." : "Tudo salvo."}</span>
                    <button type="button" className={BTN} onClick={abrirHistorico} disabled={!menu.tabelasProntas}>
                        <IconHistory size={18} />
                        <span className="hidden sm:inline">Histórico</span>
                    </button>
                    <button type="button" className={BTN} onClick={() => setAviso({ tipo: "padrao" })} disabled={!menu.tabelasProntas || salvando}>
                        <IconRestore size={18} />
                        <span className="hidden sm:inline">Padrão do sistema</span>
                    </button>
                    <button type="button" className={BTN} disabled={!alterado || salvando} onClick={() => { carregarRascunho(); setOk(""); }}>
                        Descartar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={(!alterado && !desatualizado) || salvando || !menu.tabelasProntas} onClick={() => setAviso({ tipo: "salvar" })}>
                        {salvando ? "Salvando…" : "Salvar"}
                    </button>
                </div>
            </div>

            {/* ===== JANELAS ===== */}
            {pergunta?.tipo === "novo-modulo" ? (
                <PerguntaTexto titulo="Novo módulo" rotulo="Nome do módulo" botao="Criar" aoFechar={() => setPergunta(null)} aoConfirmar={novoModulo} />
            ) : null}
            {pergunta?.tipo === "nova-secao" ? (
                <PerguntaTexto
                    titulo="Nova seção"
                    rotulo="Nome da seção"
                    botao="Criar seção"
                    aoFechar={() => setPergunta(null)}
                    aoConfirmar={(v) => {
                        definirSecao(pergunta.modulo, pergunta.item, v);
                        setPergunta(null);
                    }}
                />
            ) : null}
            {pergunta?.tipo === "renomear-secao" ? (
                <PerguntaTexto
                    titulo="Renomear seção"
                    rotulo="Nome da seção"
                    inicial={pergunta.secao}
                    botao="Renomear"
                    aoFechar={() => setPergunta(null)}
                    aoConfirmar={(v) => {
                        renomearSecao(pergunta.modulo, pergunta.secao, v);
                        setPergunta(null);
                    }}
                />
            ) : null}
            {icone && atual ? (
                <EscolherIcone
                    atual={nomeDoIcone(atual.icone)}
                    aoFechar={() => setIcone(false)}
                    aoEscolher={(nome) => {
                        const I = iconePorNome(nome);
                        if (I) mudarModulo(atual.id, (m) => ({ ...m, icone: I }));
                        setIcone(false);
                    }}
                />
            ) : null}
            {aviso?.tipo === "salvar" ? (
                <Confirmar
                    titulo="Salvar o menu"
                    texto="O menu muda para todos assim que salvar. Quem personalizou o próprio menu mantém a ordem e o que escondeu. A versão anterior fica no histórico."
                    botao="Salvar para todos"
                    aoFechar={() => setAviso(null)}
                    aoConfirmar={() => salvar(false)}
                />
            ) : null}
            {aviso?.tipo === "padrao" ? (
                <Confirmar
                    titulo="Voltar ao padrão do sistema"
                    texto="O menu volta a ser o que vem no sistema (módulos, seções e fixos). A organização atual fica no histórico e pode ser restaurada."
                    botao="Voltar ao padrão"
                    perigo
                    aoFechar={() => setAviso(null)}
                    aoConfirmar={() => salvar(true)}
                />
            ) : null}
            {aviso?.tipo === "excluir" ? (
                <Confirmar
                    titulo="Excluir módulo"
                    texto="O módulo sai do menu. Ele está vazio, então nenhuma tela some."
                    botao="Excluir"
                    perigo
                    aoFechar={() => setAviso(null)}
                    aoConfirmar={() => excluirModulo(aviso.modulo)}
                />
            ) : null}
            {aviso?.tipo === "restaurar" ? (
                <Confirmar
                    titulo="Restaurar versão"
                    texto={`O menu volta a ser o salvo em ${dataHora(aviso.versao.salvo_em)} por ${aviso.versao.salvo_por}. Vale para todos na hora.`}
                    botao="Restaurar"
                    aoFechar={() => setAviso(null)}
                    aoConfirmar={() => restaurarVersao(aviso.versao)}
                />
            ) : null}
            {historico ? (
                <Janela titulo="Histórico do menu" aoFechar={() => setHistorico(null)}>
                    {!historico.length ? <p className="text-sm text-[#5B6478] dark:text-[#AEB9CF]">Nenhuma versão salva ainda.</p> : null}
                    <div className="space-y-2">
                        {historico.map((v, i) => (
                            <div key={v.id} className="flex items-center gap-3 rounded-xl border border-[#E3E8F0] py-2 pl-3 pr-2 dark:border-white/[0.12]">
                                <span className="min-w-0 flex-1">
                                    <span className="block font-bold">{dataHora(v.salvo_em)}</span>
                                    <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                        {v.salvo_por} · {v.padrao ? "padrão do sistema" : `${v.modulos} módulos`}
                                        {i === 0 ? " · em uso" : ""}
                                    </span>
                                </span>
                                {i > 0 ? (
                                    <button type="button" className={BTN} onClick={() => setAviso({ tipo: "restaurar", versao: v })}>
                                        <IconRestore size={18} /> Restaurar
                                    </button>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </Janela>
            ) : null}
        </div>
    );
}
