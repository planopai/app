"use client";

/**
 * Personalizar barra — cada usuário escolhe os atalhos da barra do computador e da barra de baixo do celular.
 * Rota /personalizar-barra (sem chave própria: qualquer usuário logado; acessar pelo menu/rodapé, como no mockup).
 * Administrador (cargo adm): aba "Padrão por cargo". API: barra_atalhos.php (+ pai_api.php?action=list_cargos).
 */
import React, { useEffect, useMemo, useState } from "react";
import { API_BASE, apiJson, barraGet, barraPost } from "@/components/messenger/api";
import { EVENTO_BARRA, IconeAtalho, type ItemBarra, type MinhaBarra } from "@/components/barra/atalhos";

type Aparelho = "computador" | "celular";
type Cargo = { id: number; nome: string };

function normalizarCargos(j: any): Cargo[] {
    const lista = Array.isArray(j) ? j : j?.cargos || j?.rows || j?.dados || j?.data || [];
    return (Array.isArray(lista) ? lista : [])
        .map((c: any) => ({ id: Number(c.id ?? c.cargo_id), nome: String(c.nome ?? c.name ?? c.slug ?? c.id) }))
        .filter((c: Cargo) => c.id > 0);
}

const btn = "h-11 rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55] disabled:opacity-40";
const btnPri = "h-11 rounded-xl bg-[#313C55] px-4 text-sm font-extrabold text-white disabled:opacity-40";
const quad = "flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-[#E3E8F0] bg-white text-[#313C55] disabled:opacity-35";

export default function PersonalizarBarraPage() {
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
    const disponiveis = (dados?.disponiveis || []).filter((i) => !lista.includes(i.id));
    const mudar = (nova: string[]) => {
        setListas({ ...listas, [aparelho]: nova });
        setOk("");
    };
    const mover = (i: number, d: number) => {
        const n = [...lista];
        [n[i], n[i + d]] = [n[i + d], n[i]];
        mudar(n);
    };

    const salvar = async () => {
        setSalvando(true);
        try {
            const r = modo === "minha"
                ? await barraPost("salvar", { dispositivo: aparelho, itens: lista })
                : await barraPost("padrao_cargo", { cargo_id: cargoId, dispositivo: aparelho, itens: lista });
            aplicar(r.dados);
            setOk(modo === "minha" ? "Barra salva. Ela acompanha você em qualquer aparelho em que entrar." : "Padrão do cargo salvo. Vale para quem ainda não personalizou a própria barra.");
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

    return (
        <div className="min-h-screen bg-[#F4F6F9] p-4 pb-28 text-[#313C55] md:p-8">
            <div className="mx-auto flex max-w-[1120px] flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-[240px] flex-1">
                        <h1 className="m-0 text-2xl font-extrabold md:text-[32px]">{modo === "minha" ? "Personalizar barra" : "Barra padrão por cargo"}</h1>
                        <p className="mt-1 text-[15px] text-[#5B6478]">
                            {modo === "minha" ? "Escolha os atalhos da sua barra e a ordem. Só aparecem as páginas que você tem permissão para abrir." : "A barra inicial de quem tem este cargo. Só aparecem as páginas que o cargo tem."}
                        </p>
                    </div>
                    {souAdmin && (modo === "minha"
                        ? <button type="button" className={btn} onClick={entrarModoCargo}>Padrão por cargo (administrador)</button>
                        : <button type="button" className={btn} onClick={voltarMinha}>Voltar à minha barra</button>)}
                    <button type="button" className={btn} onClick={restaurar}>{modo === "minha" ? "Restaurar padrão do cargo" : "Descartar mudanças"}</button>
                    <button type="button" className={btnPri} disabled={salvando || !lista.length || (modo === "cargo" && !cargoId)} onClick={salvar}>{modo === "minha" ? "Salvar" : "Salvar padrão do cargo"}</button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex w-[360px] max-w-full gap-1 rounded-[14px] bg-[#F1F4F8] p-1" role="group" aria-label="Aparelho">
                        {(["celular", "computador"] as Aparelho[]).map((a) => (
                            <button key={a} type="button" aria-pressed={aparelho === a} onClick={() => { setAparelho(a); setOk(""); }} className={`h-10 flex-1 rounded-[10px] text-sm font-extrabold ${aparelho === a ? "bg-white shadow-sm" : "text-[#6B7488]"}`}>{a === "celular" ? "Celular" : "Computador"}</button>
                        ))}
                    </div>
                    {modo === "cargo" && (
                        <label className="flex items-center gap-2 text-sm font-extrabold">Cargo
                            <select className="h-11 min-w-[220px] rounded-xl border border-[#E1E5EC] bg-white px-3 font-bold" value={cargoId} onChange={(e) => carregarCargo(Number(e.target.value))}>
                                {cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                            </select>
                        </label>
                    )}
                    <span className="text-sm font-bold text-[#5B6478]">{modo === "cargo" && cargoNome ? `Editando: ${cargoNome}. ` : ""}Cada aparelho tem a sua barra.</span>
                </div>

                {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318]">{erro}</div>}
                {ok && <div className="rounded-xl border border-[#B3CE52] bg-[#EEF5D6] px-4 py-2 text-sm font-bold">{ok}</div>}
                {lista.length >= limite && <div className="rounded-xl border border-[#F2CB3F] bg-[#FCF3CC] px-4 py-2 text-sm font-bold">A barra {aparelho === "celular" ? "do celular" : "do computador"} está completa ({limite} atalhos). Tire um para pôr outro.</div>}

                <div className="grid gap-5 md:grid-cols-3">
                    <section className="flex flex-col gap-2 rounded-2xl border border-[#E1E5EC] bg-white p-4">
                        <div className="mb-1 flex items-baseline"><h2 className="m-0 flex-1 text-lg font-extrabold">{modo === "minha" ? "Na sua barra" : "Na barra do cargo"}</h2><span className="text-[13px] font-extrabold text-[#5B6478]">{lista.length} de {limite}</span></div>
                        {lista.map((id, i) => {
                            const it = porId[id];
                            return (
                                <div key={id} className="flex items-center gap-2.5 rounded-[14px] border border-[#E3E8F0] py-2 pl-3 pr-2">
                                    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[#F1F4F8] text-[12.5px] font-extrabold text-[#5B6478]">{i + 1}</span>
                                    <IconeAtalho id={id} className="h-5 w-5 flex-none" />
                                    <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{it?.rotulo || id}</span>
                                    <button type="button" className={quad} disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Mover ${it?.rotulo} para cima`}>↑</button>
                                    <button type="button" className={quad} disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label={`Mover ${it?.rotulo} para baixo`}>↓</button>
                                    <button type="button" className={quad} disabled={lista.length <= 1} onClick={() => mudar(lista.filter((x) => x !== id))} aria-label={`Tirar ${it?.rotulo} da barra`}>✕</button>
                                </div>
                            );
                        })}
                        {aparelho === "celular" && <p className="mt-1 text-[13px] text-[#5B6478]">No celular, o Menu fica sempre por último e não sai da barra.</p>}
                    </section>
                    <section className="flex flex-col gap-2 rounded-2xl border border-[#E1E5EC] bg-white p-4">
                        <h2 className="m-0 mb-1 text-lg font-extrabold">{modo === "minha" ? "Disponíveis para você" : "Páginas que o cargo tem"}</h2>
                        {disponiveis.map((it) => (
                            <div key={it.id} className="flex items-center gap-2.5 rounded-[14px] border border-[#E3E8F0] py-2 pl-3 pr-2">
                                <IconeAtalho id={it.id} className="h-5 w-5 flex-none" />
                                <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{it.rotulo}</span>
                                <button type="button" className={`${quad} border-[#313C55] bg-[#313C55] text-white`} disabled={lista.length >= limite} onClick={() => mudar([...lista, it.id])} aria-label={`Pôr ${it.rotulo} na barra`}>+</button>
                            </div>
                        ))}
                        {!disponiveis.length && <p className="text-sm text-[#6B7488]">Todos os atalhos possíveis já estão na barra.</p>}
                    </section>
                    <section className="flex flex-col gap-3 rounded-2xl border border-[#E1E5EC] bg-white p-4">
                        <h2 className="m-0 text-lg font-extrabold">Prévia</h2>
                        {aparelho === "celular" ? (
                            <div className="flex h-[72px] rounded-2xl bg-[#313C55] px-0.5" aria-label="Prévia da barra do celular">
                                {lista.map((id) => (
                                    <span key={id} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-bold text-[#D6DCE8]"><IconeAtalho id={id} />{porId[id]?.curto || id}</span>
                                ))}
                                <span className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-bold text-[#D6DCE8]">
                                    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M4 12h16M4 6h16M4 18h16" /></svg>Menu
                                </span>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-0.5 rounded-2xl bg-[#313C55] p-3" aria-label="Prévia da barra do computador">
                                {lista.map((id) => (
                                    <span key={id} className="flex min-h-[38px] items-center gap-2.5 rounded-[10px] px-2.5 text-sm font-bold text-[#E8ECF4]"><IconeAtalho id={id} className="h-[18px] w-[18px]" />{porId[id]?.rotulo || id}</span>
                                ))}
                            </div>
                        )}
                        <p className="m-0 text-[13px] text-[#5B6478]">Os números (como Messenger e Estoque) seguem com o atalho para onde ele for.</p>
                    </section>
                </div>
            </div>
        </div>
    );
}
