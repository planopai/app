"use client";

/**
 * Seção "Dados e valores da OS" do convênio (dentro do formulário da tela de convênios).
 * - Os itens inclusos e o produto padrão vêm das REGRAS desta mesma tela (itens marcados "Sim").
 * - Aqui ficam só os dados que a OS precisa: tipo, código do número, aditivos, valores de contrato e regras do plano.
 * - Cada valor salvo tem vigência; as OS já lançadas mantêm o valor que usaram (preços congelados).
 * Permissão: página "convenio" (pai_api.php) — a mesma da tela.
 *
 * 02/10/2026:
 *  - Cada item incluso pode ter VÁRIOS produtos aceitos (escolhidos nas regras). Eles aparecem na mesma linha e o
 *    valor no contrato vale para qualquer um deles (o pacote grava uma linha por produto, todas com o mesmo valor).
 *  - Ornamentação, Assistência e Kit lanche mostram os produtos de serviço escolhidos nas regras (não pede mais código).
 *  - Prefeitura: ao abrir o convênio aparece a LISTA de pacotes; clique em um para ver e, se quiser, criar uma nova
 *    versão a partir dele. As versões não são alteradas no lugar (OS já lançadas guardam a versão que usaram).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { osGet, osPost } from "./api";
import type { Convenio, RegrasConvenio } from "./tipos";

const brl = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: any) => Number(String(s ?? "").replace(/\./g, "").replace(",", ".")) || 0;
const decBR = (v: any) => (v === null || v === undefined || v === "" ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const hoje = () => new Date().toLocaleDateString("sv-SE");
const dataBR = (s: string) => new Date(s + "T12:00").toLocaleDateString("pt-BR");
const inputCls = "w-full rounded-lg border border-[#E1E5EC] bg-white px-3 py-2 text-sm font-semibold text-[#313C55] outline-none focus:border-[#00AEEC] disabled:bg-[#F4F6F9]";
const lbl = "mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]";

type TipoOS = "" | "PARTICULAR" | "ASSOCIADO" | "PREFEITURA";
type ProdutoLinha = { produto_id: number; nome: string };
/** Uma linha do pacote = uma categoria (item incluso), com um ou mais produtos aceitos e um valor só. */
type LinhaPacote = { categoria: string; rotulo: string; produtos: ProdutoLinha[] };

const CATEGORIAS_REGRAS: [string, string, string][] = [
    ["urna", "URNA", "Urna"], ["roupa", "ROUPA", "Roupa"], ["invol", "INVOLUCRO", "Invol"], ["veu", "VEU", "Véu"],
    ["cordao", "CORDAO", "Cordão"], ["coroa_flores", "COROA", "Coroa de flores"], ["ornamentacao", "ORNAMENTACAO", "Ornamentação"],
    ["assistencia", "ASSISTENCIA", "Assistência"], ["kit_lanche", "KIT_LANCHE", "Kit lanche"],
];
const ROTULO_CATEGORIA: Record<string, string> = Object.fromEntries(CATEGORIAS_REGRAS.map(([, c, r]) => [c, r]));

/** Produtos de uma regra (lista "produtos" ou, no formato antigo, só produto_id). */
function produtosDaRegra(it: any): ProdutoLinha[] {
    const lista: any[] = Array.isArray(it?.produtos) && it.produtos.length > 0 ? it.produtos : Number(it?.produto_id) > 0 ? [it] : [];
    const vistos = new Set<number>();
    return lista
        .map((x) => ({ produto_id: Number(x?.produto_id) || 0, nome: String(x?.nome || "") }))
        .filter((x) => x.produto_id > 0 && !vistos.has(x.produto_id) && (vistos.add(x.produto_id), true));
}

/** Itens inclusos = regras marcadas "Sim", com os produtos escolhidos nas regras. Tanatopraxia tem preço próprio (abaixo). */
function itensDasRegras(r: RegrasConvenio): LinhaPacote[] {
    const out: LinhaPacote[] = [];
    CATEGORIAS_REGRAS.forEach(([k, cat, rot]) => {
        const it: any = (r as any)[k];
        if (it?.valor !== "Sim") return;
        const rotulo = (k === "ornamentacao" || k === "coroa_flores") && it.tipo ? `${rot} ${String(it.tipo).toLowerCase()}` : rot;
        out.push({ categoria: cat, rotulo, produtos: produtosDaRegra(it) });
    });
    return out;
}

/** Itens gravados numa versão, agrupados por categoria (um valor por categoria). */
function agruparVersao(itens: any[]): { categoria: string; produtos: ProdutoLinha[]; valor: number }[] {
    const m = new Map<string, { categoria: string; produtos: ProdutoLinha[]; valor: number }>();
    (itens || []).forEach((i: any) => {
        const cat = String(i.categoria);
        if (!m.has(cat)) m.set(cat, { categoria: cat, produtos: [], valor: Number(i.valor_item) || 0 });
        m.get(cat)!.produtos.push({ produto_id: Number(i.produto_id) || 0, nome: String(i.produto_nome || "") });
    });
    return Array.from(m.values());
}

function Chips({ produtos, vazio }: { produtos: ProdutoLinha[]; vazio?: React.ReactNode }) {
    if (produtos.length === 0) return <div className="rounded-lg bg-[#FDECEA] px-3 py-2 text-sm text-[#B03A2E]">{vazio || "nenhum produto"}</div>;
    return (
        <div className="flex flex-wrap gap-1.5 rounded-lg bg-[#F4F6F9] px-2 py-1.5">
            {produtos.map((p) => (
                <span key={p.produto_id} className="rounded-md border border-[#E1E5EC] bg-white px-2 py-0.5 text-xs">
                    <b>{p.nome || "produto"}</b> <span className="text-[#6B7488]">#{p.produto_id}</span>
                </span>
            ))}
        </div>
    );
}

function Botao({ children, primario, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primario?: boolean }) {
    return <button type="button" {...p} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 ${primario ? "bg-[#313C55] text-white" : "border border-[#E1E5EC] bg-white text-[#313C55]"} ${p.className || ""}`}>{children}</button>;
}

/* ====================================================================== */

export default function SecaoOS({ convenio, disabled }: { convenio: Convenio; disabled?: boolean }) {
    const [dadosOS, setDadosOS] = useState<any>(null);
    const [tipo, setTipo] = useState<TipoOS>("");
    const [codigoNumero, setCodigoNumero] = useState("");
    const [aditivos, setAditivos] = useState<string[]>([]);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        if (!convenio.id) return;
        try {
            const r = await osGet("convenios_listar");
            const c = (r.dados || []).find((x: any) => x.id === convenio.id) || null;
            setDadosOS(c);
            setTipo((c?.tipo || "") as TipoOS);
            setCodigoNumero(c?.codigo_numero || "");
            setAditivos(c?.aditivos_permitidos || []);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os dados da OS.");
        }
    }, [convenio.id]);
    useEffect(() => { void carregar(); }, [carregar]);

    if (!convenio.id) {
        return (
            <section className="rounded-xl border border-dashed border-[#C9CFD9] bg-white p-4 text-sm text-[#6B7488]">
                <b className="text-[#313C55]">Dados e valores da OS</b> — salve o convênio primeiro; depois defina aqui como ele entra na Ordem de Serviço.
            </section>
        );
    }

    const salvarDados = async () => {
        if (!tipo || salvando) return;
        setSalvando(true);
        setErro("");
        setMsg("");
        try {
            await osPost("convenio_os_definir", { convenio_id: convenio.id, tipo, codigo_numero: tipo === "PREFEITURA" ? codigoNumero : "", aditivos: tipo === "ASSOCIADO" ? aditivos.join(",") : "" });
            setMsg("Dados da OS salvos.");
            await carregar();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar.");
        } finally {
            setSalvando(false);
        }
    };

    const tipoTravado = !!dadosOS?.codigo;
    return (
        <section className="rounded-xl border border-[#E1E5EC] bg-white p-5 text-[#313C55]" style={{ borderTop: "4px solid #00AEEC" }}>
            <div className="mb-1 text-lg font-extrabold">Dados e valores da OS</div>
            <div className="mb-4 text-xs text-[#6B7488]">Os itens inclusos e os produtos aceitos são os das regras acima (itens marcados “Sim”). Quando uma opção tem vários produtos, eles ficam na mesma linha e o valor vale para qualquer um. Valores com vigência; OS já lançadas não mudam.</div>
            {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
            {msg && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}

            <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
                <label><span className={lbl}>Tipo na OS</span>
                    <select className={inputCls} value={tipo} disabled={disabled || tipoTravado} onChange={(e) => setTipo(e.target.value as TipoOS)}>
                        <option value="">Não gera OS</option><option value="PARTICULAR">Particular (Prt)</option>
                        <option value="ASSOCIADO">Plano de associado (Soc + Dif.Soc)</option><option value="PREFEITURA">Prefeitura (Prf + Dif.Prf)</option>
                    </select>
                </label>
                <div>
                    {tipo === "PREFEITURA" && (
                        <label><span className={lbl}>Código no número da OS (3 letras)</span>
                            <input maxLength={3} className={inputCls} disabled={disabled} placeholder="ex.: Bar → 0190-Prf.Bar" value={codigoNumero} onChange={(e) => setCodigoNumero(e.target.value.replace(/[^A-Za-z]/g, ""))} />
                        </label>
                    )}
                    {tipo === "ASSOCIADO" && (
                        <div><span className={lbl}>Aditivos possíveis neste plano</span>
                            {["TRANSLADO", "TANATOPRAXIA"].map((a) => (
                                <label key={a} className="mr-5 text-sm font-semibold"><input type="checkbox" className="mr-1" disabled={disabled} checked={aditivos.includes(a)}
                                    onChange={(e) => setAditivos(e.target.checked ? [...aditivos, a] : aditivos.filter((x) => x !== a))} />{a === "TRANSLADO" ? "Translado (sem limite de km)" : "Tanatopraxia"}</label>
                            ))}
                            {aditivos.length === 0 && <span className="text-xs text-[#6B7488]">nenhum — o plano já cobre tudo</span>}
                        </div>
                    )}
                    {dadosOS?.codigo && <div className="mt-1 text-xs text-[#6B7488]">Código na OS: <b className="text-[#313C55]">{dadosOS.codigo}</b> (usado no atendimento; não muda)</div>}
                </div>
                <Botao primario disabled={disabled || salvando || !tipo} onClick={() => void salvarDados()}>Salvar dados da OS</Botao>
            </div>

            {dadosOS?.codigo && dadosOS.tipo === "PREFEITURA" && <ValoresPrefeitura codigo={dadosOS.codigo} regras={convenio.regras} disabled={disabled} />}
            {dadosOS?.codigo && dadosOS.tipo === "ASSOCIADO" && <ValoresPlano codigo={dadosOS.codigo} nome={dadosOS.nome} disabled={disabled} />}
        </section>
    );
}

/* ====================================================================== */
/* Prefeitura: lista de pacotes (versões) → ver → criar nova versão; preços de tanatopraxia e km */

type Aberto = null | { modo: "ver"; id: number } | { modo: "editar"; baseId: number | null };

function ValoresPrefeitura({ codigo, regras, disabled }: { codigo: string; regras: RegrasConvenio; disabled?: boolean }) {
    const [dados, setDados] = useState<any>(null);
    const [carregando, setCarregando] = useState(true);
    const [aberto, setAberto] = useState<Aberto>(null);
    const [nome, setNome] = useState("Atendimento funerário padrão");
    const [vigencia, setVigencia] = useState(hoje());
    const [valores, setValores] = useState<Record<string, string>>({});
    const [precos, setPrecos] = useState({ TANATOPRAXIA: "", TRANSLADO_KM: "" });
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [salvando, setSalvando] = useState(false);

    const linhas = useMemo(() => itensDasRegras(regras), [regras]);
    const versoes: any[] = dados?.versoes || [];
    const vigenteId: number | null = dados?.vigente?.id ? Number(dados.vigente.id) : null;

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const r = await osGet("convenio_pacotes_listar", { convenio: codigo });
            const d = r.dados;
            setDados(d);
            setPrecos({ TANATOPRAXIA: decBR(d?.precos_avulsos?.TANATOPRAXIA), TRANSLADO_KM: decBR(d?.precos_avulsos?.TRANSLADO_KM) });
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os pacotes.");
        } finally {
            setCarregando(false);
        }
    }, [codigo]);
    useEffect(() => { void carregar(); }, [carregar]);

    const situacao = (v: any) =>
        Number(v.id) === vigenteId ? ["VIGENTE", "bg-[#E8F3D0] text-[#4C6A12]"]
            : String(v.vigente_desde) > hoje() ? ["AGENDADA", "bg-[#DDF3FC] text-[#00799F]"]
                : ["ANTERIOR", "bg-[#F4F6F9] text-[#6B7488]"];

    /** Abre o editor de nova versão; se vier de uma versão, copia nome e valores (por categoria). */
    const abrirEditor = (base: any | null) => {
        setErro("");
        setMsg("");
        setNome(base?.nome || "Atendimento funerário padrão");
        setVigencia(hoje());
        const vals: Record<string, string> = {};
        agruparVersao(base?.itens || []).forEach((g) => (vals[g.categoria] = decBR(g.valor)));
        setValores(vals);
        setAberto({ modo: "editar", baseId: base ? Number(base.id) : null });
    };

    const soma = linhas.reduce((a, l) => a + num(valores[l.categoria]), 0);
    const pendente = linhas.find((l) => l.produtos.length === 0 || num(valores[l.categoria]) <= 0);
    const base = aberto?.modo === "editar" && aberto.baseId ? versoes.find((v) => Number(v.id) === aberto.baseId) : null;
    const foraDasRegras = agruparVersao(base?.itens || []).filter((g) => !linhas.some((l) => l.categoria === g.categoria));

    const executar = async (fn: () => Promise<any>, ok: string, depois?: () => void) => {
        if (salvando) return;
        setSalvando(true);
        setErro("");
        setMsg("");
        try {
            await fn();
            setMsg(ok);
            depois?.();
            await carregar();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar.");
        } finally {
            setSalvando(false);
        }
    };

    const salvarPacote = () => executar(() => osPost("convenio_pacote_salvar", {
        convenio: codigo, nome, valor: soma.toFixed(2), vigente_desde: vigencia,
        // uma linha por produto aceito, todas com o mesmo valor da categoria
        itens: JSON.stringify(linhas.flatMap((l) => l.produtos.map((p) => ({ categoria: l.categoria, produto_id: p.produto_id, valor_item: num(valores[l.categoria]) })))),
    }), `Nova versão do pacote salva (vigente a partir de ${dataBR(vigencia)}).`, () => setAberto(null));

    const salvarPrecos = () => executar(async () => {
        for (const chave of ["TANATOPRAXIA", "TRANSLADO_KM"] as const) {
            if (precos[chave] !== "") await osPost("convenio_regra_definir", { convenio: codigo, chave, valor: num(precos[chave]), vigente_desde: hoje() });
        }
    }, "Preços de contrato salvos.");

    const versaoAberta = aberto?.modo === "ver" ? versoes.find((v) => Number(v.id) === aberto.id) : null;

    return (
        <div className="mt-5 border-t border-[#E1E5EC] pt-5">
            {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
            {msg && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}

            {/* ---------- Lista de pacotes ---------- */}
            {aberto === null && (
                <div className="rounded-xl border border-[#E1E5EC]">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E1E5EC] p-4">
                        <div>
                            <div className="font-extrabold">Pacotes</div>
                            <div className="text-xs text-[#6B7488]">Clique em um pacote para ver os itens e valores. Para alterar, crie uma nova versão a partir dele.</div>
                        </div>
                        <Botao primario disabled={disabled || linhas.length === 0} title={linhas.length === 0 ? "Marque os itens inclusos nas regras acima" : ""}
                            onClick={() => abrirEditor(versoes.find((v) => Number(v.id) === vigenteId) || versoes[0] || null)}>
                            {versoes.length ? "Nova versão" : "Criar pacote"}
                        </Botao>
                    </div>
                    {carregando ? (
                        <div className="p-4 text-sm text-[#6B7488]">Carregando pacotes...</div>
                    ) : versoes.length === 0 ? (
                        <div className="p-4 text-sm text-[#6B7488]">
                            Nenhum pacote criado ainda.{linhas.length === 0 && " Marque os itens inclusos nas regras acima e salve o convênio."}
                        </div>
                    ) : (
                        versoes.map((v) => {
                            const [txt, cls] = situacao(v);
                            const grupos = agruparVersao(v.itens || []);
                            return (
                                <button key={v.id} type="button" onClick={() => { setErro(""); setMsg(""); setAberto({ modo: "ver", id: Number(v.id) }); }}
                                    className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-[#E1E5EC] px-4 py-3 text-left last:border-b-0 hover:bg-[#F4F6F9]">
                                    <span className="min-w-0">
                                        <span className="block font-bold">{v.nome}</span>
                                        <span className="block text-xs text-[#6B7488]">
                                            vigente a partir de {dataBR(String(v.vigente_desde))} · {grupos.length} {grupos.length === 1 ? "item incluso" : "itens inclusos"}
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-3">
                                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${cls}`}>{txt}</span>
                                        <b className="w-28 text-right">{brl(v.valor)}</b>
                                        <span className="text-xs font-bold text-[#00AEEC]">Ver ›</span>
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            )}

            {/* ---------- Ver uma versão ---------- */}
            {versaoAberta && (
                <div className="rounded-xl border border-[#E1E5EC] p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-lg font-extrabold">{versaoAberta.nome}</div>
                            <div className="text-xs text-[#6B7488]">vigente a partir de {dataBR(String(versaoAberta.vigente_desde))} · {situacao(versaoAberta)[0].toLowerCase()}</div>
                        </div>
                        <div className="flex gap-2">
                            <Botao onClick={() => setAberto(null)}>Voltar à lista</Botao>
                            <Botao primario disabled={disabled || linhas.length === 0} onClick={() => abrirEditor(versaoAberta)}>Criar nova versão a partir desta</Botao>
                        </div>
                    </div>
                    <div className="mb-1 grid grid-cols-[170px_1fr_140px] gap-2"><span className={lbl}>Item incluso</span><span className={lbl}>Produtos aceitos</span><span className={`${lbl} text-right`}>Valor no contrato</span></div>
                    {agruparVersao(versaoAberta.itens || []).map((g) => (
                        <div key={g.categoria} className="mb-2 grid grid-cols-[170px_1fr_140px] items-center gap-2">
                            <div className="text-sm font-bold">{ROTULO_CATEGORIA[g.categoria] || g.categoria}</div>
                            <Chips produtos={g.produtos} />
                            <div className="text-right text-sm font-bold">{brl(g.valor)}</div>
                        </div>
                    ))}
                    <div className="mt-2 text-right"><div className={lbl}>Valor do pacote</div><div className="text-2xl font-extrabold">{brl(versaoAberta.valor)}</div></div>
                </div>
            )}

            {/* ---------- Nova versão ---------- */}
            {aberto?.modo === "editar" && (
                <div className="rounded-xl border border-[#00AEEC] p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-lg font-extrabold">{versoes.length ? "Nova versão do pacote" : "Novo pacote"}</div>
                            <div className="text-xs text-[#6B7488]">
                                Itens e produtos vêm das regras acima.{base ? ` Valores copiados de “${base.nome}” (${dataBR(String(base.vigente_desde))}).` : ""}
                            </div>
                        </div>
                        <Botao disabled={salvando} onClick={() => setAberto(null)}>Cancelar</Botao>
                    </div>
                    <div className="mb-3 flex flex-wrap items-end gap-3">
                        <label className="min-w-[240px] flex-1"><span className={lbl}>Nome do pacote</span><input className={inputCls} disabled={disabled} value={nome} onChange={(e) => setNome(e.target.value)} /></label>
                        <label className="w-44"><span className={lbl}>Vigente a partir de</span><input type="date" className={inputCls} disabled={disabled} value={vigencia} onChange={(e) => setVigencia(e.target.value)} /></label>
                    </div>

                    {linhas.length === 0 ? (
                        <div className="rounded-lg bg-[#FFF8E1] p-3 text-sm">Nenhum item marcado “Sim” nas regras acima. Marque os itens inclusos no contrato e salve o convênio.</div>
                    ) : (
                        <>
                            <div className="mb-1 grid grid-cols-[170px_1fr_140px] gap-2"><span className={lbl}>Item incluso</span><span className={lbl}>Produtos aceitos</span><span className={`${lbl} text-right`}>Valor no contrato</span></div>
                            {linhas.map((l) => (
                                <div key={l.categoria} className="mb-2 grid grid-cols-[170px_1fr_140px] items-center gap-2">
                                    <div className="text-sm font-bold">
                                        {l.rotulo}
                                        {l.produtos.length > 1 && <div className="text-[11px] font-semibold text-[#6B7488]">valor vale para qualquer um</div>}
                                    </div>
                                    <Chips produtos={l.produtos} vazio="escolha o item nas regras acima" />
                                    <input inputMode="decimal" className={`${inputCls} text-right`} disabled={disabled} placeholder="0,00" value={valores[l.categoria] ?? ""}
                                        onChange={(e) => setValores({ ...valores, [l.categoria]: e.target.value })} />
                                </div>
                            ))}
                            {foraDasRegras.length > 0 && (
                                <div className="mb-2 rounded-lg bg-[#FFF8E1] p-3 text-xs">
                                    Na versão de origem há itens que não estão mais marcados “Sim” nas regras: {foraDasRegras.map((g) => ROTULO_CATEGORIA[g.categoria] || g.categoria).join(", ")}. Eles não entram na nova versão.
                                </div>
                            )}
                            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                                <div className="max-w-md text-xs text-[#6B7488]">Troca de modelo no atendimento: qualquer produto aceito da linha não gera diferença; outro produto gera diferença = preço do item escolhido − valor do item no contrato. Item fora do pacote vai inteiro para a Dif.Prf. A OS da Prefeitura não tem desconto nem acréscimo.</div>
                                <div className="text-right"><div className={lbl}>Valor do pacote = soma dos itens</div><div className="text-2xl font-extrabold">{brl(soma)}</div></div>
                            </div>
                            <div className="mt-3 flex justify-end">
                                <Botao primario disabled={disabled || salvando || !!pendente}
                                    title={pendente ? `Falta ${pendente.produtos.length ? "o valor" : "o produto"} de ${pendente.rotulo}` : ""}
                                    onClick={() => void salvarPacote()}>
                                    {salvando ? "Salvando..." : versoes.length ? "Salvar nova versão" : "Criar pacote"}
                                </Botao>
                            </div>
                            {pendente && <div className="mt-1 text-right text-xs text-[#B03A2E]">Falta {pendente.produtos.length ? "o valor" : "o produto"} de {pendente.rotulo}.</div>}
                        </>
                    )}
                </div>
            )}

            {/* ---------- Preços de contrato ---------- */}
            <div className="mt-5 rounded-xl border border-[#E1E5EC] p-4 lg:max-w-xl">
                <div className="mb-3 font-extrabold">Serviços com preço de contrato</div>
                {([["TRANSLADO_KM", "Translado", "por km · sem limite"], ["TANATOPRAXIA", "Tanatopraxia", "por atendimento"]] as const).map(([k, r, sub]) => (
                    <div key={k} className="mb-3 flex items-center gap-3">
                        <div className="flex-1"><b>{r}</b><div className="text-xs text-[#6B7488]">{sub}</div></div>
                        <input inputMode="decimal" className={`${inputCls} w-32 text-right`} disabled={disabled} value={precos[k]} placeholder="0,00" onChange={(e) => setPrecos({ ...precos, [k]: e.target.value })} />
                    </div>
                ))}
                <div className="mb-3 text-xs text-[#6B7488]">Valem quando a Prefeitura autoriza no atendimento (vigentes a partir de hoje). Avançada e embalsamamento: a família paga a diferença sobre a tanatopraxia autorizada.</div>
                <div className="flex justify-end"><Botao primario disabled={disabled || salvando} onClick={() => void salvarPrecos()}>Salvar preços</Botao></div>
            </div>
        </div>
    );
}

/* ====================================================================== */
/* Plano de associado: teto da urna, km de translado coberto, tanatopraxia */

function ValoresPlano({ codigo, nome, disabled }: { codigo: string; nome: string; disabled?: boolean }) {
    const vazio = { TETO_URNA: "", TRANSLADO_KM_COBERTO: "", ilimitado: false, TANATOPRAXIA_COBERTA: "0" };
    const [v, setV] = useState(vazio);
    const [orig, setOrig] = useState(vazio);
    const [vigencia, setVigencia] = useState(hoje());
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const r = await osGet("convenio_regras_listar", { convenio: codigo });
            const vig: Record<string, any> = {};
            (r.dados?.vigentes || []).forEach((x: any) => (vig[x.chave] = x));
            const n = {
                TETO_URNA: decBR(vig.TETO_URNA?.valor),
                TRANSLADO_KM_COBERTO: vig.TRANSLADO_KM_COBERTO && vig.TRANSLADO_KM_COBERTO.valor !== null ? String(vig.TRANSLADO_KM_COBERTO.valor) : "",
                ilimitado: !!vig.TRANSLADO_KM_COBERTO && vig.TRANSLADO_KM_COBERTO.valor === null,
                TANATOPRAXIA_COBERTA: String(Number(vig.TANATOPRAXIA_COBERTA?.valor || 0)),
            };
            setV(n);
            setOrig(n);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar o plano.");
        }
    }, [codigo]);
    useEffect(() => { void carregar(); }, [carregar]);

    const salvar = async () => {
        if (salvando) return;
        setSalvando(true);
        setErro("");
        setMsg("");
        try {
            const enviar = (chave: string, valor: string) => osPost("convenio_regra_definir", { convenio: codigo, chave, valor, vigente_desde: vigencia });
            if (v.TETO_URNA !== orig.TETO_URNA) await enviar("TETO_URNA", String(num(v.TETO_URNA)));
            if (v.ilimitado !== orig.ilimitado || v.TRANSLADO_KM_COBERTO !== orig.TRANSLADO_KM_COBERTO) await enviar("TRANSLADO_KM_COBERTO", v.ilimitado ? "ilimitado" : String(num(v.TRANSLADO_KM_COBERTO)));
            if (v.TANATOPRAXIA_COBERTA !== orig.TANATOPRAXIA_COBERTA) await enviar("TANATOPRAXIA_COBERTA", v.TANATOPRAXIA_COBERTA);
            setMsg(`Valores do plano ${nome} salvos (vigentes a partir de ${dataBR(vigencia)}).`);
            await carregar();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar.");
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="mt-5 border-t border-[#E1E5EC] pt-5">
            {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
            {msg && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}
            <div className="grid gap-4 md:grid-cols-4">
                <label><span className={lbl}>Teto da urna (R$)</span><input inputMode="decimal" className={inputCls} disabled={disabled} value={v.TETO_URNA} onChange={(e) => setV({ ...v, TETO_URNA: e.target.value })} /></label>
                <div><span className={lbl}>Translado coberto (km)</span>
                    <input inputMode="numeric" className={inputCls} disabled={disabled || v.ilimitado} placeholder={v.ilimitado ? "ilimitado" : "ex.: 500"} value={v.ilimitado ? "" : v.TRANSLADO_KM_COBERTO} onChange={(e) => setV({ ...v, TRANSLADO_KM_COBERTO: e.target.value })} />
                    <label className="mt-1 block text-xs font-semibold"><input type="checkbox" className="mr-1" disabled={disabled} checked={v.ilimitado} onChange={(e) => setV({ ...v, ilimitado: e.target.checked })} />ilimitado</label>
                </div>
                <label><span className={lbl}>Tanatopraxia coberta</span>
                    <select className={inputCls} disabled={disabled} value={v.TANATOPRAXIA_COBERTA} onChange={(e) => setV({ ...v, TANATOPRAXIA_COBERTA: e.target.value })}><option value="1">Sim</option><option value="0">Não (só com aditivo)</option></select>
                </label>
                <label><span className={lbl}>Vigente a partir de</span><input type="date" className={inputCls} disabled={disabled} value={vigencia} onChange={(e) => setVigencia(e.target.value)} /></label>
            </div>
            <div className="mt-3 rounded-lg bg-[#F4F6F9] p-3 text-xs leading-5 text-[#313C55]">
                Urna acima do teto: o plano cobre até o teto e o restante vai para a <b>Dif.Soc</b> (mesma urna nas duas OS). Translado acima do limite: o excedente vai para a Dif.Soc.
                Itens padrão do plano = itens marcados “Sim” nas regras acima; troca de modelo gera diferença sobre o preço de tabela.
            </div>
            <div className="mt-3 flex justify-end"><Botao primario disabled={disabled || salvando} onClick={() => void salvar()}>Salvar valores do plano</Botao></div>
        </div>
    );
}
