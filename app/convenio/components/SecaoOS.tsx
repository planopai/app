"use client";

/**
 * Configuração da OS do convênio (tela "Dados do convênio").
 * - Tipo na OS, código no número da OS e aditivos (plano de associado).
 * - Prefeitura: preços de contrato da tanatopraxia e do km de translado.
 * - Plano de associado: teto da urna, km de translado coberto, tanatopraxia coberta.
 * Os ITENS e os valores de cada item ficam nos PACOTES do convênio (tela do pacote), não aqui.
 * Cada valor salvo tem vigência; as OS já lançadas mantêm o valor que usaram.
 * Permissão: página "convenio" (pai_api.php) — a mesma da tela.
 */

import React, { useCallback, useEffect, useState } from "react";
import { osGet, osPost } from "./api";

const num = (s: any) => Number(String(s ?? "").replace(/\./g, "").replace(",", ".")) || 0;
const decBR = (v: any) => (v === null || v === undefined || v === "" ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const hoje = () => new Date().toLocaleDateString("sv-SE");
const dataBR = (s: string) => new Date(s + "T12:00").toLocaleDateString("pt-BR");
const inputCls = "w-full rounded-lg border border-[#E1E5EC] bg-white px-3 py-2 text-sm font-semibold text-[#313C55] outline-none focus:border-[#00AEEC] disabled:bg-[#F4F6F9]";
const lbl = "mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]";

type TipoOS = "" | "PARTICULAR" | "ASSOCIADO" | "PREFEITURA";

function Botao({ children, primario, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primario?: boolean }) {
    return <button type="button" {...p} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 ${primario ? "bg-[#313C55] text-white" : "border border-[#E1E5EC] bg-white text-[#313C55]"} ${p.className || ""}`}>{children}</button>;
}

/* ====================================================================== */

export default function SecaoOS({ convenio, disabled }: { convenio: { id: number }; disabled?: boolean }) {
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
                <b className="text-[#313C55]">Dados da OS</b> — salve o convênio primeiro; depois defina aqui como ele entra na Ordem de Serviço.
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
            <div className="mb-1 text-lg font-extrabold">Dados da OS</div>
            <div className="mb-4 text-xs text-[#6B7488]">Como este convênio entra na Ordem de Serviço. Os itens e os valores de cada item ficam nos pacotes. Valores com vigência; OS já lançadas não mudam.</div>
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

            {dadosOS?.codigo && dadosOS.tipo === "PREFEITURA" && <PrecosPrefeitura codigo={dadosOS.codigo} disabled={disabled} />}
            {dadosOS?.codigo && dadosOS.tipo === "ASSOCIADO" && <ValoresPlano codigo={dadosOS.codigo} nome={dadosOS.nome} disabled={disabled} />}
        </section>
    );
}

/* ====================================================================== */
/* Prefeitura: preços de contrato da tanatopraxia e do km (os itens e valores ficam nos pacotes) */

function PrecosPrefeitura({ codigo, disabled }: { codigo: string; disabled?: boolean }) {
    const [precos, setPrecos] = useState({ TANATOPRAXIA: "", TRANSLADO_KM: "" });
    const [vigencia, setVigencia] = useState(hoje());
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const r = await osGet("convenio_regras_listar", { convenio: codigo });
            const vig: Record<string, any> = {};
            (r.dados?.vigentes || []).forEach((x: any) => (vig[x.chave] = x));
            setPrecos({ TANATOPRAXIA: decBR(vig.TANATOPRAXIA?.valor), TRANSLADO_KM: decBR(vig.TRANSLADO_KM?.valor) });
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os preços.");
        }
    }, [codigo]);
    useEffect(() => { void carregar(); }, [carregar]);

    const salvar = async () => {
        if (salvando) return;
        setSalvando(true);
        setErro("");
        setMsg("");
        try {
            for (const chave of ["TANATOPRAXIA", "TRANSLADO_KM"] as const) {
                if (precos[chave] !== "") await osPost("convenio_regra_definir", { convenio: codigo, chave, valor: num(precos[chave]), vigente_desde: vigencia });
            }
            setMsg(`Preços de contrato salvos (vigentes a partir de ${dataBR(vigencia)}).`);
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
            <div className="mb-3 font-extrabold">Serviços com preço de contrato</div>
            <div className="grid gap-4 md:grid-cols-3">
                {([["TRANSLADO_KM", "Translado (R$ por km)"], ["TANATOPRAXIA", "Tanatopraxia (R$ por atendimento)"]] as const).map(([k, r]) => (
                    <label key={k}><span className={lbl}>{r}</span>
                        <input inputMode="decimal" className={`${inputCls} text-right`} disabled={disabled} value={precos[k]} placeholder="0,00" onChange={(e) => setPrecos({ ...precos, [k]: e.target.value })} />
                    </label>
                ))}
                <label><span className={lbl}>Vigente a partir de</span><input type="date" className={inputCls} disabled={disabled} value={vigencia} onChange={(e) => setVigencia(e.target.value)} /></label>
            </div>
            <div className="mt-3 rounded-lg bg-[#F4F6F9] p-3 text-xs leading-5">
                Valem quando a Prefeitura autoriza no atendimento. Avançada e embalsamamento: a família paga a diferença sobre a tanatopraxia autorizada.
                Os valores de urna, roupa, coroa e demais itens ficam em cada pacote.
            </div>
            <div className="mt-3 flex justify-end"><Botao primario disabled={disabled || salvando} onClick={() => void salvar()}>Salvar preços</Botao></div>
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
                Itens padrão do plano = itens do pacote padrão; troca de modelo gera diferença sobre o preço de tabela.
            </div>
            <div className="mt-3 flex justify-end"><Botao primario disabled={disabled || salvando} onClick={() => void salvar()}>Salvar valores do plano</Botao></div>
        </div>
    );
}
