"use client";

/**
 * Seção "Dados e valores da OS" do convênio (dentro do formulário da tela de convênios).
 * - Os itens inclusos e o produto padrão vêm das REGRAS desta mesma tela (itens marcados "Sim").
 * - Aqui ficam só os dados que a OS precisa: tipo, código do número, aditivos, valores de contrato e regras do plano.
 * - Cada valor salvo tem vigência; as OS já lançadas mantêm o valor que usaram (preços congelados).
 * Permissão: página "convenio" (pai_api.php) — a mesma da tela.
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
type ItemPacote = { categoria: string; rotulo: string; produto_id: number; nome: string; servico: boolean; valor_item: string };

/** Itens inclusos = regras marcadas "Sim" (produtos com o modelo padrão; serviços pedem o código do produto de serviço). */
function itensDasRegras(r: RegrasConvenio): Omit<ItemPacote, "valor_item">[] {
    const out: Omit<ItemPacote, "valor_item">[] = [];
    const prod: [keyof RegrasConvenio, string, string][] = [["urna", "URNA", "Urna"], ["roupa", "ROUPA", "Roupa"], ["invol", "INVOLUCRO", "Invol"],
        ["veu", "VEU", "Véu"], ["cordao", "CORDAO", "Cordão"], ["coroa_flores", "COROA", "Coroa de flores"]];
    prod.forEach(([k, cat, rot]) => {
        const it: any = r[k];
        if (it?.valor === "Sim") out.push({ categoria: cat, rotulo: rot, produto_id: Number(it.produto_id) || 0, nome: it.nome || "", servico: false });
    });
    if (r.ornamentacao?.valor === "Sim") out.push({ categoria: "ORNAMENTACAO", rotulo: `Ornamentação ${r.ornamentacao.tipo ? r.ornamentacao.tipo.toLowerCase() : ""}`.trim(), produto_id: 0, nome: "", servico: true });
    if (r.assistencia?.valor === "Sim") out.push({ categoria: "ASSISTENCIA", rotulo: "Assistência", produto_id: 0, nome: "", servico: true });
    if (r.kit_lanche?.valor === "Sim") out.push({ categoria: "KIT_LANCHE", rotulo: "Kit lanche", produto_id: 0, nome: "", servico: true });
    return out;
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
            <div className="mb-4 text-xs text-[#6B7488]">Os itens inclusos e o modelo padrão são os das regras acima (itens marcados “Sim”). Aqui ficam só os valores e regras que a Ordem de Serviço usa. Valores com vigência; OS já lançadas não mudam.</div>
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
/* Prefeitura: valor no contrato de cada item incluso, preços de tanatopraxia e km, vigência e versões */

function ValoresPrefeitura({ codigo, regras, disabled }: { codigo: string; regras: RegrasConvenio; disabled?: boolean }) {
    const [dados, setDados] = useState<any>(null);
    const [nome, setNome] = useState("Atendimento funerário padrão");
    const [vigencia, setVigencia] = useState(hoje());
    const [itens, setItens] = useState<ItemPacote[]>([]);
    const [precos, setPrecos] = useState({ TANATOPRAXIA: "", TRANSLADO_KM: "" });
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [salvando, setSalvando] = useState(false);

    const base = useMemo(() => itensDasRegras(regras), [regras]);

    const carregar = useCallback(async () => {
        try {
            const r = await osGet("convenio_pacotes_listar", { convenio: codigo });
            const d = r.dados;
            setDados(d);
            const vig = d?.vigente;
            if (vig?.nome) setNome(vig.nome);
            const anterior: Record<string, any> = {};
            (vig?.itens || []).forEach((i: any) => (anterior[i.categoria] = i));
            setItens(base.map((b) => ({
                ...b,
                produto_id: b.servico ? Number(anterior[b.categoria]?.produto_id || 0) : b.produto_id,
                valor_item: decBR(anterior[b.categoria]?.valor_item),
            })));
            setPrecos({ TANATOPRAXIA: decBR(d?.precos_avulsos?.TANATOPRAXIA), TRANSLADO_KM: decBR(d?.precos_avulsos?.TRANSLADO_KM) });
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar o pacote.");
        }
    }, [codigo, base]);
    useEffect(() => { void carregar(); }, [carregar]);

    const soma = itens.reduce((a, i) => a + num(i.valor_item), 0);
    const pendente = itens.find((i) => !i.produto_id || num(i.valor_item) <= 0);
    const foraDasRegras = (dados?.vigente?.itens || []).filter((i: any) => !base.some((b) => b.categoria === i.categoria));

    const executar = async (fn: () => Promise<any>, ok: string) => {
        if (salvando) return;
        setSalvando(true);
        setErro("");
        setMsg("");
        try {
            await fn();
            setMsg(ok);
            await carregar();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar.");
        } finally {
            setSalvando(false);
        }
    };

    const salvarPacote = () => executar(() => osPost("convenio_pacote_salvar", {
        convenio: codigo, nome, valor: soma.toFixed(2), vigente_desde: vigencia,
        itens: JSON.stringify(itens.map((i) => ({ categoria: i.categoria, produto_id: i.produto_id, valor_item: num(i.valor_item) }))),
    }), `Nova versão do pacote salva (vigente a partir de ${dataBR(vigencia)}).`);

    const salvarPrecos = () => executar(async () => {
        for (const chave of ["TANATOPRAXIA", "TRANSLADO_KM"] as const) {
            if (precos[chave] !== "") await osPost("convenio_regra_definir", { convenio: codigo, chave, valor: num(precos[chave]), vigente_desde: vigencia });
        }
    }, "Preços de contrato salvos.");

    return (
        <div className="mt-5 border-t border-[#E1E5EC] pt-5">
            {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
            {msg && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}
            <div className="mb-3 flex flex-wrap items-end gap-3">
                <label className="min-w-[240px] flex-1"><span className={lbl}>Nome do pacote</span><input className={inputCls} disabled={disabled} value={nome} onChange={(e) => setNome(e.target.value)} /></label>
                <label className="w-44"><span className={lbl}>Vigente a partir de</span><input type="date" className={inputCls} disabled={disabled} value={vigencia} onChange={(e) => setVigencia(e.target.value)} /></label>
                {!dados?.vigente && <span className="rounded-full bg-[#FBEFC4] px-3 py-1 text-xs font-extrabold">PACOTE AINDA NÃO CRIADO</span>}
            </div>

            {base.length === 0 ? (
                <div className="rounded-lg bg-[#FFF8E1] p-3 text-sm">Nenhum item marcado “Sim” nas regras acima. Marque os itens inclusos no contrato e salve o convênio.</div>
            ) : (
                <>
                    <div className="mb-1 grid grid-cols-[170px_1fr_140px] gap-2"><span className={lbl}>Item incluso</span><span className={lbl}>Produto padrão</span><span className={`${lbl} text-right`}>Valor no contrato</span></div>
                    {itens.map((it, i) => (
                        <div key={it.categoria} className="mb-2 grid grid-cols-[170px_1fr_140px] items-center gap-2">
                            <div className="text-sm font-bold">{it.rotulo}</div>
                            {it.servico ? (
                                <input inputMode="numeric" className={inputCls} disabled={disabled} placeholder="código do produto de serviço"
                                       value={it.produto_id || ""} onChange={(e) => setItens(itens.map((x, k) => (k === i ? { ...x, produto_id: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))} />
                            ) : (
                                <div className="truncate rounded-lg bg-[#F4F6F9] px-3 py-2 text-sm">{it.produto_id ? <><b>{it.nome || "produto"}</b> · #{it.produto_id}</> : <span className="text-[#B03A2E]">escolha o modelo padrão nas regras acima</span>}</div>
                            )}
                            <input inputMode="decimal" className={`${inputCls} text-right`} disabled={disabled} placeholder="0,00" value={it.valor_item}
                                   onChange={(e) => setItens(itens.map((x, k) => (k === i ? { ...x, valor_item: e.target.value } : x)))} />
                        </div>
                    ))}
                    {foraDasRegras.length > 0 && (
                        <div className="mb-2 rounded-lg bg-[#FFF8E1] p-3 text-xs">Na versão vigente há itens que não estão mais marcados “Sim” nas regras: {foraDasRegras.map((i: any) => i.categoria).join(", ")}. Ao salvar a nova versão, eles saem do pacote.</div>
                    )}
                    <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                        <div className="max-w-md text-xs text-[#6B7488]">Troca de modelo no atendimento: diferença = preço do item escolhido − valor do item no contrato. Item fora do pacote vai inteiro para a Dif.Prf. A OS da Prefeitura não tem desconto nem acréscimo.</div>
                        <div className="text-right"><div className={lbl}>Valor do pacote = soma dos itens</div><div className="text-2xl font-extrabold">{brl(soma)}</div></div>
                    </div>
                    <div className="mt-3 flex justify-end"><Botao primario disabled={disabled || salvando || !!pendente} title={pendente ? `Falta ${pendente.produto_id ? "o valor" : "o produto"} de ${pendente.rotulo}` : ""} onClick={() => void salvarPacote()}>Salvar nova versão do pacote</Botao></div>
                </>
            )}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-[#E1E5EC] p-4">
                    <div className="mb-3 font-extrabold">Serviços com preço de contrato</div>
                    {([["TRANSLADO_KM", "Translado", "por km · sem limite"], ["TANATOPRAXIA", "Tanatopraxia", "por atendimento"]] as const).map(([k, r, s]) => (
                        <div key={k} className="mb-3 flex items-center gap-3">
                            <div className="flex-1"><b>{r}</b><div className="text-xs text-[#6B7488]">{s}</div></div>
                            <input inputMode="decimal" className={`${inputCls} w-32 text-right`} disabled={disabled} value={precos[k]} placeholder="0,00" onChange={(e) => setPrecos({ ...precos, [k]: e.target.value })} />
                        </div>
                    ))}
                    <div className="mb-3 text-xs text-[#6B7488]">Valem quando a Prefeitura autoriza no atendimento. Avançada e embalsamamento: a família paga a diferença sobre a tanatopraxia autorizada.</div>
                    <div className="flex justify-end"><Botao primario disabled={disabled || salvando} onClick={() => void salvarPrecos()}>Salvar preços</Botao></div>
                </div>
                <div className="rounded-xl border border-[#E1E5EC] p-4">
                    <div className="mb-3 font-extrabold">Versões do pacote</div>
                    {(dados?.versoes || []).length === 0 && <div className="text-sm text-[#6B7488]">Nenhuma versão ainda.</div>}
                    {(dados?.versoes || []).map((v: any) => (
                        <div key={v.id} className="flex justify-between border-b border-[#E1E5EC] py-2 text-sm last:border-b-0">
                            <span><b>{dataBR(v.vigente_desde)}</b> · {brl(v.valor)} {v.id === dados?.vigente?.id ? "— vigente" : v.vigente_desde > hoje() ? "— agendada" : ""}</span>
                            <span className="text-[#6B7488]">{v.nome}</span>
                        </div>
                    ))}
                </div>
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
