"use client";

/**
 * Personalizar menu (antes "Personalizar barra") — rota /personalizar-barra (sem chave própria: qualquer usuário logado).
 *
 * Aba "Atalhos": cada usuário escolhe os atalhos da barra do computador e da barra de baixo do celular, a ordem
 * e (08/10/2026) o ícone de cada um. Desde 08/10 qualquer tela do menu pode virar atalho (barra_atalhos.php).
 * Administrador (cargo adm): "Padrão por cargo", como antes. API: barra_atalhos.php (+ pai_api.php?action=list_cargos).
 *
 * Aba "Meu menu" (08/10/2026): ordem dos módulos e das telas e o que esconder, só para este usuário.
 * Fica nas preferências do menu_modulos.php (com os ícones dos atalhos). A organização de todos é da Gestão (Organizar menu).
 */
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconArrowDown, IconArrowUp, IconChevronDown, IconChevronRight, IconEye, IconEyeOff, IconPalette, IconSearch } from "@tabler/icons-react";
import { API_BASE, apiJson, barraGet, barraPost } from "@/components/messenger/api";
import { EVENTO_BARRA, IconeAtalho, type ItemBarra, type MinhaBarra } from "@/components/barra/atalhos";
import { usePerms } from "@/app/_perms/PermsProvider";
import { itensVisiveis, moduloVisivel } from "@/components/shell/modulos";
import { secoesDe, type PrefsMenu } from "@/components/shell/menuOrganizado";
import { menuPost, recarregarMenu, useMenu } from "@/components/shell/useMenu";
import { AvisoFaixa, EscolherIcone } from "@/components/shell/menuUi";

type Aparelho = "computador" | "celular";
type Cargo = { id: number; nome: string };
type Aba = "atalhos" | "menu";

function normalizarCargos(j: any): Cargo[] {
    const lista = Array.isArray(j) ? j : j?.cargos || j?.rows || j?.dados || j?.data || [];
    return (Array.isArray(lista) ? lista : [])
        .map((c: any) => ({ id: Number(c.id ?? c.cargo_id), nome: String(c.nome ?? c.name ?? c.slug ?? c.id) }))
        .filter((c: Cargo) => c.id > 0);
}

const btn = "h-11 rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55] disabled:opacity-40";
const btnPri = "h-11 rounded-xl bg-[#313C55] px-4 text-sm font-extrabold text-white disabled:opacity-40";
const quad = "flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-[#E3E8F0] bg-white text-[#313C55] disabled:opacity-35";
/* 44 px nos controles novos (Meu menu e ícone) */
/* "+" escuro: sem o bg-white do quad, para a cor não depender da ordem do CSS */
const quadPri = "flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-[#313C55] bg-[#313C55] text-white disabled:opacity-35";
const quad44 = "grid size-11 flex-none place-items-center rounded-xl border border-[#E3E8F0] bg-white text-[#313C55] disabled:opacity-30";

const iguais = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function PersonalizarMenuPage() {
    const [aba, setAba] = useState<Aba>("atalhos");
    const [modo, setModo] = useState<"minha" | "cargo">("minha");
    const [aparelho, setAparelho] = useState<Aparelho>(() => (typeof window !== "undefined" && window.innerWidth < 768 ? "celular" : "computador"));
    const [dados, setDados] = useState<MinhaBarra | null>(null);
    const [listas, setListas] = useState<Record<Aparelho, string[]>>({ computador: [], celular: [] });
    const [souAdmin, setSouAdmin] = useState(false);
    const [cargos, setCargos] = useState<Cargo[]>([]);
    const [cargoId, setCargoId] = useState(0);
    const [cargoNome, setCargoNome] = useState("");
    const [erro, setErro] = useState("");
    const [ok, setOk] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [filtro, setFiltro] = useState("");

    /* preferências (ícones dos atalhos + meu menu) */
    const menu = useMenu();
    const { perms, has } = usePerms();
    const [prefs, setPrefs] = useState<PrefsMenu | null>(null);
    const [escolhendoIcone, setEscolhendoIcone] = useState<string | null>(null);
    const [aberto, setAberto] = useState<string | null>(null);
    useEffect(() => {
        if (menu.carregado && prefs === null) setPrefs(menu.preferencias || {});
    }, [menu.carregado, menu.preferencias, prefs]);
    const prefsMudaram = prefs !== null && !iguais(prefs, menu.preferencias || {});

    const aplicar = (d: MinhaBarra) => {
        setDados(d);
        setListas({ computador: d.computador.itens.map((i) => i.id), celular: d.celular.itens.map((i) => i.id) });
    };

    useEffect(() => {
        barraGet<MinhaBarra>("minha_barra").then(aplicar).catch((e) => setErro(e.message));
        apiJson(`${API_BASE}/pai_api.php?action=whoami&_=${Date.now()}`)
            .then((j: any) => setSouAdmin(String(j?.cargo || j?.dados?.cargo || "").toLowerCase() === "adm"))
            .catch(() => {});
    }, []);

    const entrarModoCargo = async () => {
        setModo("cargo");
        setOk("");
        if (!cargos.length) {
            try {
                const l = normalizarCargos(await apiJson(`${API_BASE}/pai_api.php?action=list_cargos&_=${Date.now()}`));
                setCargos(l);
                if (l[0]) carregarCargo(l[0].id);
            } catch (e: any) {
                setErro(e.message);
            }
        } else if (cargoId) carregarCargo(cargoId);
    };
    const carregarCargo = async (id: number) => {
        setCargoId(id);
        try {
            const d = await barraGet<any>("padrao_cargo", { cargo_id: id });
            setCargoNome(d.cargo?.nome || "");
            aplicar(d);
            setErro("");
        } catch (e: any) {
            setErro(e.message);
        }
    };
    const voltarMinha = () => {
        setModo("minha");
        setOk("");
        barraGet<MinhaBarra>("minha_barra").then(aplicar).catch((e) => setErro(e.message));
    };

    const lista = listas[aparelho];
    const limite = dados ? dados[aparelho].limite : aparelho === "celular" ? 5 : 8;
    const porId = useMemo(() => {
        const m: Record<string, ItemBarra> = {};
        (dados?.disponiveis || []).forEach((i) => (m[i.id] = i));
        (dados?.computador.itens || []).concat(dados?.celular.itens || []).forEach((i) => (m[i.id] = m[i.id] || i));
        return m;
    }, [dados]);

    /* Disponíveis agrupados pelo módulo em que a tela está (desde 08/10 são todas as telas do menu). */
    const grupos = useMemo(() => {
        const q = filtro.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
        const livres = (dados?.disponiveis || []).filter(
            (i) => !lista.includes(i.id) && (!q || i.rotulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)),
        );
        const saida: { titulo: string; itens: ItemBarra[] }[] = [];
        const usados = new Set<string>();
        for (const m of menu.modulos) {
            const itens = livres.filter((i) => m.itens.some((t) => t.id === i.id));
            itens.forEach((i) => usados.add(i.id));
            if (itens.length) saida.push({ titulo: m.titulo, itens });
        }
        const resto = livres.filter((i) => !usados.has(i.id));
        if (resto.length) saida.unshift({ titulo: "Principais", itens: resto });
        return saida;
    }, [dados, lista, filtro, menu.modulos]);
    const totalLivres = grupos.reduce((n, g) => n + g.itens.length, 0);

    const mudar = (nova: string[]) => {
        setListas({ ...listas, [aparelho]: nova });
        setOk("");
    };
    const mover = (i: number, d: number) => {
        const n = [...lista];
        [n[i], n[i + d]] = [n[i + d], n[i]];
        mudar(n);
    };

    /* ===== preferências ===== */
    const mudarPrefs = (f: (p: PrefsMenu) => PrefsMenu) => {
        setPrefs((p) => f(p || {}));
        setOk("");
    };
    const iconeDe = (id: string) => prefs?.icones?.[id] || "";
    const escolherIcone = (id: string, nome: string) =>
        mudarPrefs((p) => {
            const icones = { ...(p.icones || {}) };
            if (nome) icones[id] = nome;
            else delete icones[id];
            return { ...p, icones };
        });
    /* grava e passa a usar o que o servidor guardou (já conferido e no mesmo formato) */
    const gravarPrefs = async (p: PrefsMenu) => {
        const r = await menuPost<PrefsMenu | null>("salvar_preferencias", { config: p });
        await recarregarMenu();
        setPrefs(r.dados || {});
    };

    const salvar = async () => {
        setSalvando(true);
        try {
            const r =
                modo === "minha"
                    ? await barraPost("salvar", { dispositivo: aparelho, itens: lista })
                    : await barraPost("padrao_cargo", { cargo_id: cargoId, dispositivo: aparelho, itens: lista });
            aplicar(r.dados);
            if (modo === "minha" && prefsMudaram && prefs) await gravarPrefs(prefs);
            setOk(
                modo === "minha"
                    ? "Barra salva. Ela acompanha você em qualquer aparelho em que entrar."
                    : "Padrão do cargo salvo. Vale para quem ainda não personalizou a própria barra.",
            );
            setErro("");
            if (modo === "minha") window.dispatchEvent(new Event(EVENTO_BARRA));
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    };
    const restaurar = async () => {
        if (modo === "cargo") return carregarCargo(cargoId);
        try {
            const r = await barraPost("restaurar", { dispositivo: aparelho });
            aplicar(r.dados);
            setOk("Barra restaurada para o padrão do cargo.");
            window.dispatchEvent(new Event(EVENTO_BARRA));
        } catch (e: any) {
            setErro(e.message);
        }
    };

    /* ===== Meu menu ===== */
    const modulosMeus = useMemo(() => {
        if (perms === null) return [];
        const visiveis = menu.modulos.filter((m) => moduloVisivel(m, has)).map((m) => ({ ...m, itens: itensVisiveis(m, has) }));
        const ordem = prefs?.ordem_modulos || [];
        const pos = (id: string, i: number) => (ordem.indexOf(id) < 0 ? 10000 + i : ordem.indexOf(id));
        return visiveis
            .map((m, i) => ({ m, i }))
            .sort((a, b) => pos(a.m.id, a.i) - pos(b.m.id, b.i))
            .map(({ m }) => {
                const ordemI = prefs?.ordem_itens?.[m.id] || [];
                const secoes = ["", ...secoesDe(m.itens)];
                const p = (id: string, i: number) => (ordemI.indexOf(id) < 0 ? 10000 + i : ordemI.indexOf(id));
                const itens = m.itens
                    .map((it, i) => ({ it, i }))
                    .sort((a, b) => secoes.indexOf(a.it.secao || "") - secoes.indexOf(b.it.secao || "") || p(a.it.id, a.i) - p(b.it.id, b.i))
                    .map(({ it }) => it);
                return { ...m, itens };
            });
    }, [menu.modulos, perms, has, prefs]);

    const moverModulo = (i: number, d: number) => {
        const ids = modulosMeus.map((m) => m.id);
        [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
        mudarPrefs((p) => ({ ...p, ordem_modulos: ids }));
    };
    const moverTela = (modId: string, pos: number, d: number) => {
        const m = modulosMeus.find((x) => x.id === modId);
        if (!m) return;
        const ids = m.itens.map((i) => i.id);
        [ids[pos], ids[pos + d]] = [ids[pos + d], ids[pos]];
        mudarPrefs((p) => ({ ...p, ordem_itens: { ...(p.ordem_itens || {}), [modId]: ids } }));
    };
    const alternar = (campo: "ocultos_modulos" | "ocultos_itens", id: string) =>
        mudarPrefs((p) => {
            const atual = p[campo] || [];
            return { ...p, [campo]: atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id] };
        });
    const escondidoM = (id: string) => (prefs?.ocultos_modulos || []).includes(id);
    const escondidoI = (id: string) => (prefs?.ocultos_itens || []).includes(id);

    const salvarMeuMenu = async () => {
        if (!prefs) return;
        setSalvando(true);
        try {
            await gravarPrefs(prefs);
            setOk("Seu menu foi salvo.");
            setErro("");
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    };
    /* volta à ordem da Gestão e mostra tudo de novo; os ícones dos atalhos continuam */
    const padraoMeuMenu = async () => {
        const p: PrefsMenu = { icones: prefs?.icones || {} };
        setSalvando(true);
        try {
            await gravarPrefs(p);
            setOk("Seu menu voltou à organização da Gestão.");
            setErro("");
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    };

    const abaBtn = (a: Aba, rotulo: string) => (
        <button
            type="button"
            role="tab"
            aria-selected={aba === a}
            onClick={() => {
                setAba(a);
                setOk("");
            }}
            className={`h-11 flex-1 rounded-[10px] text-sm font-extrabold ${aba === a ? "bg-white shadow-sm" : "text-[#6B7488]"}`}
        >
            {rotulo}
        </button>
    );

    return (
        <div className="min-h-screen bg-[#F4F6F9] p-4 pb-28 text-[#313C55] md:p-8">
            <div className="mx-auto flex max-w-[1120px] flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-[240px] flex-1">
                        <h1 className="m-0 text-2xl font-extrabold md:text-[32px]">
                            {aba === "menu" ? "Personalizar menu" : modo === "minha" ? "Personalizar menu" : "Barra padrão por cargo"}
                        </h1>
                        <p className="mt-1 text-[15px] text-[#5B6478]">
                            {aba === "menu"
                                ? "Ordem dos módulos e das telas e o que esconder. Só muda o seu menu."
                                : modo === "minha"
                                  ? "Escolha os atalhos da sua barra, a ordem e o ícone. Só aparecem as telas que você tem permissão para abrir."
                                  : "A barra inicial de quem tem este cargo. Só aparecem as páginas que o cargo tem."}
                        </p>
                    </div>
                    {aba === "atalhos" ? (
                        <>
                            {souAdmin &&
                                (modo === "minha" ? (
                                    <button type="button" className={btn} onClick={entrarModoCargo}>
                                        Padrão por cargo (administrador)
                                    </button>
                                ) : (
                                    <button type="button" className={btn} onClick={voltarMinha}>
                                        Voltar à minha barra
                                    </button>
                                ))}
                            <button type="button" className={btn} onClick={restaurar}>
                                {modo === "minha" ? "Restaurar padrão do cargo" : "Descartar mudanças"}
                            </button>
                            <button type="button" className={btnPri} disabled={salvando || !lista.length || (modo === "cargo" && !cargoId)} onClick={salvar}>
                                {modo === "minha" ? "Salvar" : "Salvar padrão do cargo"}
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button" className={btn} disabled={salvando || !menu.tabelasProntas} onClick={padraoMeuMenu}>
                                Voltar à organização da Gestão
                            </button>
                            <button type="button" className={btnPri} disabled={salvando || !prefsMudaram || !menu.tabelasProntas} onClick={salvarMeuMenu}>
                                Salvar
                            </button>
                        </>
                    )}
                </div>

                {modo === "minha" ? (
                    <div className="flex w-[360px] max-w-full gap-1 rounded-[14px] bg-[#E9EDF3] p-1" role="tablist" aria-label="O que personalizar">
                        {abaBtn("atalhos", "Atalhos")}
                        {abaBtn("menu", "Meu menu")}
                    </div>
                ) : null}

                {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318]">{erro}</div>}
                {ok && <div className="rounded-xl border border-[#B3CE52] bg-[#EEF5D6] px-4 py-2 text-sm font-bold">{ok}</div>}
                {!menu.tabelasProntas && menu.carregado ? (
                    <AvisoFaixa tom="atencao">Os ícones e o seu menu ainda não podem ser salvos: falta rodar o menu_modulos.sql no banco.</AvisoFaixa>
                ) : null}

                {aba === "atalhos" ? (
                    <>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex w-[360px] max-w-full gap-1 rounded-[14px] bg-[#F1F4F8] p-1" role="group" aria-label="Aparelho">
                                {(["celular", "computador"] as Aparelho[]).map((a) => (
                                    <button
                                        key={a}
                                        type="button"
                                        aria-pressed={aparelho === a}
                                        onClick={() => {
                                            setAparelho(a);
                                            setOk("");
                                        }}
                                        className={`h-10 flex-1 rounded-[10px] text-sm font-extrabold ${aparelho === a ? "bg-white shadow-sm" : "text-[#6B7488]"}`}
                                    >
                                        {a === "celular" ? "Celular" : "Computador"}
                                    </button>
                                ))}
                            </div>
                            {modo === "cargo" && (
                                <label className="flex items-center gap-2 text-sm font-extrabold">
                                    Cargo
                                    <select className="h-11 min-w-[220px] rounded-xl border border-[#E1E5EC] bg-white px-3 font-bold" value={cargoId} onChange={(e) => carregarCargo(Number(e.target.value))}>
                                        {cargos.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.nome}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            <span className="text-sm font-bold text-[#5B6478]">{modo === "cargo" && cargoNome ? `Editando: ${cargoNome}. ` : ""}Cada aparelho tem a sua barra.</span>
                        </div>

                        {lista.length >= limite && (
                            <div className="rounded-xl border border-[#F2CB3F] bg-[#FCF3CC] px-4 py-2 text-sm font-bold">
                                A barra {aparelho === "celular" ? "do celular" : "do computador"} está completa ({limite} atalhos). Tire um para pôr outro.
                            </div>
                        )}

                        <div className="grid gap-5 md:grid-cols-3">
                            <section className="flex flex-col gap-2 rounded-2xl border border-[#E1E5EC] bg-white p-4">
                                <div className="mb-1 flex items-baseline">
                                    <h2 className="m-0 flex-1 text-lg font-extrabold">{modo === "minha" ? "Na sua barra" : "Na barra do cargo"}</h2>
                                    <span className="text-[13px] font-extrabold text-[#5B6478]">
                                        {lista.length} de {limite}
                                    </span>
                                </div>
                                {lista.map((id, i) => {
                                    const it = porId[id];
                                    return (
                                        <div key={id} className="flex items-center gap-2 rounded-[14px] border border-[#E3E8F0] py-2 pl-3 pr-2">
                                            <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[#F1F4F8] text-[12.5px] font-extrabold text-[#5B6478]">{i + 1}</span>
                                            {modo === "minha" ? (
                                                <button
                                                    type="button"
                                                    className={quad44}
                                                    onClick={() => setEscolhendoIcone(id)}
                                                    aria-label={`Trocar o ícone de ${it?.rotulo || id}`}
                                                    title="Trocar o ícone"
                                                >
                                                    <IconeAtalho id={id} icone={prefs ? iconeDe(id) : undefined} className="h-5 w-5" />
                                                </button>
                                            ) : (
                                                <IconeAtalho id={id} icone="" className="h-5 w-5 flex-none" />
                                            )}
                                            <span className="line-clamp-2 min-w-0 flex-1 break-words text-[15px] font-extrabold leading-tight">{it?.rotulo || id}</span>
                                            <button type="button" className={quad} disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Mover ${it?.rotulo} para cima`}>
                                                ↑
                                            </button>
                                            <button type="button" className={quad} disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label={`Mover ${it?.rotulo} para baixo`}>
                                                ↓
                                            </button>
                                            <button type="button" className={quad} disabled={lista.length <= 1} onClick={() => mudar(lista.filter((x) => x !== id))} aria-label={`Tirar ${it?.rotulo} da barra`}>
                                                ✕
                                            </button>
                                        </div>
                                    );
                                })}
                                {modo === "minha" ? (
                                    <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#5B6478]">
                                        <IconPalette size={16} className="shrink-0" /> Toque no ícone para trocá-lo. O ícone vale nos dois aparelhos.
                                    </p>
                                ) : null}
                                {aparelho === "celular" && <p className="mt-1 text-[13px] text-[#5B6478]">No celular, o Menu fica sempre por último e não sai da barra.</p>}
                            </section>
                            <section className="flex flex-col gap-2 rounded-2xl border border-[#E1E5EC] bg-white p-4">
                                <h2 className="m-0 mb-1 text-lg font-extrabold">{modo === "minha" ? "Disponíveis para você" : "Páginas que o cargo tem"}</h2>
                                <label className="flex h-11 items-center gap-2 rounded-xl bg-[#F1F4F8] px-3 text-[#5B6478]">
                                    <IconSearch size={17} className="shrink-0" />
                                    <input
                                        type="search"
                                        value={filtro}
                                        onChange={(e) => setFiltro(e.target.value)}
                                        placeholder="Procurar tela"
                                        aria-label="Procurar tela"
                                        className="min-w-0 flex-1 bg-transparent text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396]"
                                    />
                                </label>
                                <div className="flex max-h-[520px] flex-col gap-2 overflow-y-auto pr-0.5">
                                    {grupos.map((g) => (
                                        <React.Fragment key={g.titulo}>
                                            <p className="mt-1 text-xs font-extrabold uppercase tracking-[0.08em] text-[#5B6478]">{g.titulo}</p>
                                            {g.itens.map((it) => (
                                                <div key={it.id} className="flex items-center gap-2.5 rounded-[14px] border border-[#E3E8F0] py-2 pl-3 pr-2">
                                                    <IconeAtalho id={it.id} icone={modo === "minha" && prefs ? iconeDe(it.id) : ""} className="h-5 w-5 flex-none" />
                                                    <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{it.rotulo}</span>
                                                    <button
                                                        type="button"
                                                        className={quadPri}
                                                        disabled={lista.length >= limite}
                                                        onClick={() => mudar([...lista, it.id])}
                                                        aria-label={`Pôr ${it.rotulo} na barra`}
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </div>
                                {!totalLivres && <p className="text-sm text-[#6B7488]">{filtro ? "Nenhuma tela com esse nome." : "Todos os atalhos possíveis já estão na barra."}</p>}
                            </section>
                            <section className="flex flex-col gap-3 rounded-2xl border border-[#E1E5EC] bg-white p-4">
                                <h2 className="m-0 text-lg font-extrabold">Prévia</h2>
                                {aparelho === "celular" ? (
                                    <div className="flex h-[72px] rounded-2xl bg-[#313C55] px-0.5" aria-label="Prévia da barra do celular">
                                        {lista.map((id) => (
                                            <span key={id} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-bold text-[#D6DCE8]">
                                                <IconeAtalho id={id} icone={modo === "minha" && prefs ? iconeDe(id) : ""} />
                                                <span className="max-w-full truncate px-0.5">{porId[id]?.curto || id}</span>
                                            </span>
                                        ))}
                                        <span className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-bold text-[#D6DCE8]">
                                            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                                                <path d="M4 12h16M4 6h16M4 18h16" />
                                            </svg>
                                            Menu
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-0.5 rounded-2xl bg-[#313C55] p-3" aria-label="Prévia da barra do computador">
                                        {lista.map((id) => (
                                            <span key={id} className="flex min-h-[38px] items-center gap-2.5 rounded-[10px] px-2.5 text-sm font-bold text-[#E8ECF4]">
                                                <IconeAtalho id={id} icone={modo === "minha" && prefs ? iconeDe(id) : ""} className="h-[18px] w-[18px]" />
                                                {porId[id]?.rotulo || id}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <p className="m-0 text-[13px] text-[#5B6478]">Os números (como Messenger e Estoque) seguem com o atalho para onde ele for.</p>
                            </section>
                        </div>
                    </>
                ) : (
                    /* ===== MEU MENU ===== */
                    <section className="flex flex-col gap-2 rounded-2xl border border-[#E1E5EC] bg-white p-4 md:p-5">
                        <p className="m-0 text-sm text-[#5B6478]">
                            Use as setas para mudar a ordem e o olho para esconder ou mostrar. Escondido some só do seu menu: a tela continua na pesquisa e na
                            página do módulo. Quem decide os módulos e onde cada tela fica é a Gestão
                            {menu.podeOrganizar ? (
                                <>
                                    {" "}
                                    (
                                    <Link href="/organizar-menu" className="font-bold underline">
                                        Organizar menu
                                    </Link>
                                    )
                                </>
                            ) : null}
                            .
                        </p>
                        {modulosMeus.map((m, i) => {
                            const I = m.icone;
                            const esc = escondidoM(m.id);
                            const exp = aberto === m.id;
                            return (
                                <div key={m.id} className={`rounded-[14px] border border-[#E3E8F0] ${esc ? "bg-[#F6F8FB]" : ""}`}>
                                    <div className="flex items-center gap-2 py-2 pl-2 pr-2">
                                        <button
                                            type="button"
                                            onClick={() => setAberto(exp ? null : m.id)}
                                            aria-expanded={exp}
                                            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 text-left"
                                        >
                                            <span className={`grid size-10 shrink-0 place-items-center rounded-xl bg-[#EEF2F7] ${esc ? "opacity-50" : ""}`}>
                                                <I size={20} />
                                            </span>
                                            <span className={`min-w-0 flex-1 ${esc ? "opacity-60" : ""}`}>
                                                <span className="block truncate font-extrabold">{m.titulo}</span>
                                                <span className="block text-[13px] text-[#5B6478]">{esc ? "Escondido do seu menu" : `${m.itens.length} ${m.itens.length === 1 ? "tela" : "telas"}`}</span>
                                            </span>
                                            {exp ? <IconChevronDown size={18} className="text-[#7A8396]" /> : <IconChevronRight size={18} className="text-[#7A8396]" />}
                                        </button>
                                        <button type="button" className={quad44} onClick={() => alternar("ocultos_modulos", m.id)} aria-label={esc ? `Mostrar ${m.titulo}` : `Esconder ${m.titulo}`} title={esc ? "Mostrar" : "Esconder"}>
                                            {esc ? <IconEyeOff size={19} /> : <IconEye size={19} />}
                                        </button>
                                        <button type="button" className={quad44} disabled={i === 0} onClick={() => moverModulo(i, -1)} aria-label={`Subir ${m.titulo}`}>
                                            <IconArrowUp size={18} />
                                        </button>
                                        <button type="button" className={quad44} disabled={i === modulosMeus.length - 1} onClick={() => moverModulo(i, 1)} aria-label={`Descer ${m.titulo}`}>
                                            <IconArrowDown size={18} />
                                        </button>
                                    </div>
                                    {exp ? (
                                        <div className="space-y-1.5 border-t border-[#E3E8F0] px-2 pb-2 pt-2">
                                            {m.itens.map((it, pos) => {
                                                const T = it.icone;
                                                const e2 = escondidoI(it.id);
                                                const ant = m.itens[pos - 1];
                                                const prox = m.itens[pos + 1];
                                                const mesma = (o?: { secao?: string }) => !!o && (o.secao || "") === (it.secao || "");
                                                return (
                                                    <React.Fragment key={it.id}>
                                                        {it.secao && it.secao !== ant?.secao ? (
                                                            <p className="px-2 pt-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[#5B6478]">{it.secao}</p>
                                                        ) : null}
                                                        <div className="flex items-center gap-2 rounded-xl py-1 pl-2">
                                                            <T size={19} className={`shrink-0 ${e2 ? "opacity-40" : ""}`} />
                                                            <span className={`min-w-0 flex-1 truncate text-[15px] font-bold ${e2 ? "text-[#7A8396] line-through" : ""}`}>{it.titulo}</span>
                                                            <button type="button" className={quad44} onClick={() => alternar("ocultos_itens", it.id)} aria-label={e2 ? `Mostrar ${it.titulo}` : `Esconder ${it.titulo}`} title={e2 ? "Mostrar" : "Esconder"}>
                                                                {e2 ? <IconEyeOff size={19} /> : <IconEye size={19} />}
                                                            </button>
                                                            <button type="button" className={quad44} disabled={!mesma(ant)} onClick={() => moverTela(m.id, pos, -1)} aria-label={`Subir ${it.titulo}`}>
                                                                <IconArrowUp size={18} />
                                                            </button>
                                                            <button type="button" className={quad44} disabled={!mesma(prox)} onClick={() => moverTela(m.id, pos, 1)} aria-label={`Descer ${it.titulo}`}>
                                                                <IconArrowDown size={18} />
                                                            </button>
                                                        </div>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                        {prefsMudaram ? <p className="m-0 text-sm font-bold text-[#5B6478]">Mudanças ainda não salvas.</p> : null}
                    </section>
                )}
            </div>

            {escolhendoIcone ? (
                <EscolherIcone
                    atual={iconeDe(escolhendoIcone)}
                    padrao={<IconeAtalho id={escolhendoIcone} icone="" className="h-5 w-5" />}
                    aoFechar={() => setEscolhendoIcone(null)}
                    aoEscolher={(nome) => {
                        escolherIcone(escolhendoIcone, nome);
                        setEscolhendoIcone(null);
                    }}
                />
            ) : null}
        </div>
    );
}
