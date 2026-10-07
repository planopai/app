"use client";

/**
 * Configuração da OS do convênio (tela "Dados do convênio").
 * Organização visual revisada:
 * - bloco superior: tipo da OS + identificação/código;
 * - bloco inferior: regras específicas do tipo escolhido;
 * - sem alterar as regras, endpoints ou persistência existentes.
 */

import React, { useCallback, useEffect, useState } from "react";
import { osGet, osPost } from "./api";

const num = (s: any) => Number(String(s ?? "").replace(/\./g, "").replace(",", ".")) || 0;
const decBR = (v: any) =>
    v === null || v === undefined || v === ""
        ? ""
        : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const hoje = () => new Date().toLocaleDateString("sv-SE");
const dataBR = (s: string) => new Date(s + "T12:00").toLocaleDateString("pt-BR");

const inputCls =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500 dark:border-white/25 dark:bg-[#232B3F] dark:text-white dark:focus:ring-[#3D6A99]/60 dark:disabled:bg-[#1C2334] dark:disabled:text-[#AEB9CF]";

const lbl =
    "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-[#AEB9CF]";

type TipoOS = "" | "PARTICULAR" | "ASSOCIADO" | "PREFEITURA";

function Botao({
    children,
    primario,
    ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primario?: boolean }) {
    return (
        <button
            type="button"
            {...p}
            className={[
                "whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                primario
                    ? "bg-slate-800 text-white hover:bg-slate-900"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/25 dark:bg-[#232B3F] dark:text-[#D6DCE8] dark:hover:bg-[#1C2334]",
                p.className || "",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

function Aviso({
    tipo,
    children,
}: {
    tipo: "erro" | "sucesso";
    children: React.ReactNode;
}) {
    const cls =
        tipo === "erro"
            ? "border-red-200 bg-red-50 text-red-800 dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"
            : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#B3CE52]";

    return <div className={`rounded-lg border px-3 py-2.5 text-sm ${cls}`}>{children}</div>;
}

function BlocoRegras({
    titulo,
    descricao,
    children,
}: {
    titulo: string;
    descricao?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 dark:border-white/12 dark:bg-[#1C2334]/60">
            <div className="mb-4">
                <h3 className="text-base font-bold text-slate-800 dark:text-white">{titulo}</h3>
                {descricao && <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-[#AEB9CF]">{descricao}</p>}
            </div>
            {children}
        </div>
    );
}

/* ====================================================================== */

export default function SecaoOS({
    convenio,
    disabled,
}: {
    convenio: { id: number };
    disabled?: boolean;
}) {
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

    useEffect(() => {
        void carregar();
    }, [carregar]);

    if (!convenio.id) {
        return (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 shadow-sm dark:border-white/25 dark:bg-[#232B3F] dark:text-[#AEB9CF]">
                <b className="text-slate-800 dark:text-white">Dados da OS</b>
                <span> — salve o convênio primeiro; depois defina como ele entra na Ordem de Serviço.</span>
            </section>
        );
    }

    const salvarDados = async () => {
        if (!tipo || salvando) return;

        setSalvando(true);
        setErro("");
        setMsg("");

        try {
            await osPost("convenio_os_definir", {
                convenio_id: convenio.id,
                tipo,
                codigo_numero: tipo === "PREFEITURA" ? codigoNumero : "",
                aditivos: tipo === "ASSOCIADO" ? aditivos.join(",") : "",
            });

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
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/12 dark:bg-[#232B3F]">
            <div className="border-t-4 border-t-[#3D6A99] px-5 pb-4 pt-5 sm:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Dados da OS</h2>
                        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-[#AEB9CF]">
                            Defina como este convênio entra na Ordem de Serviço. Itens e valores próprios dos
                            atendimentos continuam organizados nos pacotes.
                        </p>
                    </div>

                    {dadosOS?.codigo && (
                        <div className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-white/10 dark:text-[#AEB9CF]">
                            Código na OS
                            <div className="mt-0.5 font-bold text-slate-800 dark:text-white">{dadosOS.codigo}</div>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
                {erro && <Aviso tipo="erro">{erro}</Aviso>}
                {msg && <Aviso tipo="sucesso">{msg}</Aviso>}

                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-white/12 dark:bg-[#232B3F]">
                    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-end">
                        <label>
                            <span className={lbl}>Tipo na OS</span>
                            <select
                                className={inputCls}
                                value={tipo}
                                disabled={disabled || tipoTravado}
                                onChange={(e) => setTipo(e.target.value as TipoOS)}
                            >
                                <option value="">Não gera OS</option>
                                <option value="PARTICULAR">Particular (Prt)</option>
                                <option value="ASSOCIADO">Plano de associado (Soc + Dif.Soc)</option>
                                <option value="PREFEITURA">Prefeitura (Prf + Dif.Prf)</option>
                            </select>
                        </label>

                        <div className="min-w-0">
                            {tipo === "PREFEITURA" && (
                                <label>
                                    <span className={lbl}>Código no número da OS (3 letras)</span>
                                    <input
                                        maxLength={3}
                                        className={inputCls}
                                        disabled={disabled}
                                        placeholder="Ex.: Bar"
                                        value={codigoNumero}
                                        onChange={(e) =>
                                            setCodigoNumero(e.target.value.replace(/[^A-Za-z]/g, ""))
                                        }
                                    />
                                </label>
                            )}

                            {tipo === "ASSOCIADO" && (
                                <div>
                                    <span className={lbl}>Aditivos possíveis neste plano</span>
                                    <div className="flex min-h-[42px] flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/12 dark:bg-[#1C2334]">
                                        {["TRANSLADO", "TANATOPRAXIA"].map((a) => (
                                            <label
                                                key={a}
                                                className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-[#D6DCE8]"
                                            >
                                                <input
                                                    type="checkbox"
                                                    disabled={disabled}
                                                    checked={aditivos.includes(a)}
                                                    onChange={(e) =>
                                                        setAditivos(
                                                            e.target.checked
                                                                ? [...aditivos, a]
                                                                : aditivos.filter((x) => x !== a),
                                                        )
                                                    }
                                                />
                                                {a === "TRANSLADO" ? "Translado sem limite de km" : "Tanatopraxia"}
                                            </label>
                                        ))}

                                        {aditivos.length === 0 && (
                                            <span className="text-xs text-slate-500 dark:text-[#AEB9CF]">
                                                Nenhum aditivo selecionado.
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {tipo === "PARTICULAR" && (
                                <div className="flex min-h-[42px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 dark:border-white/12 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                    Sem regras adicionais para este tipo.
                                </div>
                            )}

                            {!tipo && (
                                <div className="flex min-h-[42px] items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 text-sm text-slate-500 dark:border-white/25 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                    Selecione um tipo para configurar as regras da OS.
                                </div>
                            )}
                        </div>

                        <Botao
                            primario
                            disabled={disabled || salvando || !tipo}
                            onClick={() => void salvarDados()}
                            className="w-full lg:w-auto"
                        >
                            {salvando ? "Salvando..." : "Salvar dados da OS"}
                        </Botao>
                    </div>
                </div>

                {dadosOS?.codigo && dadosOS.tipo === "PREFEITURA" && (
                    <PrecosPrefeitura codigo={dadosOS.codigo} disabled={disabled} />
                )}

                {dadosOS?.codigo && dadosOS.tipo === "ASSOCIADO" && (
                    <ValoresPlano codigo={dadosOS.codigo} nome={dadosOS.nome} disabled={disabled} />
                )}
            </div>
        </section>
    );
}

/* ====================================================================== */
/* Prefeitura */

function PrecosPrefeitura({
    codigo,
    disabled,
}: {
    codigo: string;
    disabled?: boolean;
}) {
    const [precos, setPrecos] = useState({
        TANATOPRAXIA: "",
        TRANSLADO_KM: "",
    });

    const [vigencia, setVigencia] = useState(hoje());
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const r = await osGet("convenio_regras_listar", { convenio: codigo });
            const vig: Record<string, any> = {};

            (r.dados?.vigentes || []).forEach((x: any) => (vig[x.chave] = x));

            setPrecos({
                TANATOPRAXIA: decBR(vig.TANATOPRAXIA?.valor),
                TRANSLADO_KM: decBR(vig.TRANSLADO_KM?.valor),
            });
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os preços.");
        }
    }, [codigo]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const salvar = async () => {
        if (salvando) return;

        setSalvando(true);
        setErro("");
        setMsg("");

        try {
            for (const chave of ["TANATOPRAXIA", "TRANSLADO_KM"] as const) {
                if (precos[chave] !== "") {
                    await osPost("convenio_regra_definir", {
                        convenio: codigo,
                        chave,
                        valor: num(precos[chave]),
                        vigente_desde: vigencia,
                    });
                }
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
        <BlocoRegras
            titulo="Serviços com preço de contrato"
            descricao="Valores próprios do convênio. Os valores dos demais itens permanecem em cada pacote."
        >
            <div className="space-y-3">
                {erro && <Aviso tipo="erro">{erro}</Aviso>}
                {msg && <Aviso tipo="sucesso">{msg}</Aviso>}

                <div className="grid gap-4 md:grid-cols-3">
                    <label>
                        <span className={lbl}>Translado (R$ por km)</span>
                        <input
                            inputMode="decimal"
                            className={`${inputCls} text-right`}
                            disabled={disabled}
                            value={precos.TRANSLADO_KM}
                            placeholder="0,00"
                            onChange={(e) =>
                                setPrecos({ ...precos, TRANSLADO_KM: e.target.value })
                            }
                        />
                    </label>

                    <label>
                        <span className={lbl}>Tanatopraxia (R$ por atendimento)</span>
                        <input
                            inputMode="decimal"
                            className={`${inputCls} text-right`}
                            disabled={disabled}
                            value={precos.TANATOPRAXIA}
                            placeholder="0,00"
                            onChange={(e) =>
                                setPrecos({ ...precos, TANATOPRAXIA: e.target.value })
                            }
                        />
                    </label>

                    <label>
                        <span className={lbl}>Vigente a partir de</span>
                        <input
                            type="date"
                            className={inputCls}
                            disabled={disabled}
                            value={vigencia}
                            onChange={(e) => setVigencia(e.target.value)}
                        />
                    </label>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/12 dark:bg-[#232B3F]">
                    <p className="max-w-4xl text-xs leading-5 text-slate-500 dark:text-[#AEB9CF]">
                        Os valores são usados quando a Prefeitura autoriza o serviço no atendimento.
                        Avançada e embalsamamento podem gerar diferença sobre a tanatopraxia autorizada.
                    </p>

                    <Botao
                        primario
                        disabled={disabled || salvando}
                        onClick={() => void salvar()}
                        className="w-full sm:w-auto"
                    >
                        {salvando ? "Salvando..." : "Salvar preços"}
                    </Botao>
                </div>
            </div>
        </BlocoRegras>
    );
}

/* ====================================================================== */
/* Plano de associado */

function ValoresPlano({
    codigo,
    nome,
    disabled,
}: {
    codigo: string;
    nome: string;
    disabled?: boolean;
}) {
    const vazio = {
        TETO_URNA: "",
        TRANSLADO_KM_COBERTO: "",
        ilimitado: false,
        TANATOPRAXIA_COBERTA: "0",
    };

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
                TRANSLADO_KM_COBERTO:
                    vig.TRANSLADO_KM_COBERTO &&
                        vig.TRANSLADO_KM_COBERTO.valor !== null
                        ? String(vig.TRANSLADO_KM_COBERTO.valor)
                        : "",
                ilimitado:
                    !!vig.TRANSLADO_KM_COBERTO &&
                    vig.TRANSLADO_KM_COBERTO.valor === null,
                TANATOPRAXIA_COBERTA: String(
                    Number(vig.TANATOPRAXIA_COBERTA?.valor || 0),
                ),
            };

            setV(n);
            setOrig(n);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar o plano.");
        }
    }, [codigo]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const salvar = async () => {
        if (salvando) return;

        setSalvando(true);
        setErro("");
        setMsg("");

        try {
            const enviar = (chave: string, valor: string) =>
                osPost("convenio_regra_definir", {
                    convenio: codigo,
                    chave,
                    valor,
                    vigente_desde: vigencia,
                });

            if (v.TETO_URNA !== orig.TETO_URNA) {
                await enviar("TETO_URNA", String(num(v.TETO_URNA)));
            }

            if (
                v.ilimitado !== orig.ilimitado ||
                v.TRANSLADO_KM_COBERTO !== orig.TRANSLADO_KM_COBERTO
            ) {
                await enviar(
                    "TRANSLADO_KM_COBERTO",
                    v.ilimitado ? "ilimitado" : String(num(v.TRANSLADO_KM_COBERTO)),
                );
            }

            if (v.TANATOPRAXIA_COBERTA !== orig.TANATOPRAXIA_COBERTA) {
                await enviar("TANATOPRAXIA_COBERTA", v.TANATOPRAXIA_COBERTA);
            }

            setMsg(
                `Valores do plano ${nome} salvos (vigentes a partir de ${dataBR(vigencia)}).`,
            );
            await carregar();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar.");
        } finally {
            setSalvando(false);
        }
    };

    return (
        <BlocoRegras
            titulo="Regras do plano"
            descricao="Coberturas e limites utilizados quando este convênio entra como plano de associado."
        >
            <div className="space-y-3">
                {erro && <Aviso tipo="erro">{erro}</Aviso>}
                {msg && <Aviso tipo="sucesso">{msg}</Aviso>}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label>
                        <span className={lbl}>Teto da urna (R$)</span>
                        <input
                            inputMode="decimal"
                            className={inputCls}
                            disabled={disabled}
                            value={v.TETO_URNA}
                            placeholder="0,00"
                            onChange={(e) => setV({ ...v, TETO_URNA: e.target.value })}
                        />
                    </label>

                    <div>
                        <span className={lbl}>Translado coberto (km)</span>
                        <input
                            inputMode="numeric"
                            className={inputCls}
                            disabled={disabled || v.ilimitado}
                            placeholder={v.ilimitado ? "Ilimitado" : "Ex.: 500"}
                            value={v.ilimitado ? "" : v.TRANSLADO_KM_COBERTO}
                            onChange={(e) =>
                                setV({ ...v, TRANSLADO_KM_COBERTO: e.target.value })
                            }
                        />

                        <label className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-[#AEB9CF]">
                            <input
                                type="checkbox"
                                disabled={disabled}
                                checked={v.ilimitado}
                                onChange={(e) => setV({ ...v, ilimitado: e.target.checked })}
                            />
                            Sem limite de km
                        </label>
                    </div>

                    <label>
                        <span className={lbl}>Tanatopraxia coberta</span>
                        <select
                            className={inputCls}
                            disabled={disabled}
                            value={v.TANATOPRAXIA_COBERTA}
                            onChange={(e) =>
                                setV({ ...v, TANATOPRAXIA_COBERTA: e.target.value })
                            }
                        >
                            <option value="1">Sim</option>
                            <option value="0">Não — somente com aditivo</option>
                        </select>
                    </label>

                    <label>
                        <span className={lbl}>Vigente a partir de</span>
                        <input
                            type="date"
                            className={inputCls}
                            disabled={disabled}
                            value={vigencia}
                            onChange={(e) => setVigencia(e.target.value)}
                        />
                    </label>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/12 dark:bg-[#232B3F]">
                    <p className="max-w-4xl text-xs leading-5 text-slate-500 dark:text-[#AEB9CF]">
                        Urna acima do teto: o plano cobre até o limite e o restante vai para
                        Dif.Soc. Translado acima do limite: o excedente também vai para Dif.Soc.
                        Os itens do atendimento permanecem definidos nos pacotes do convênio.
                    </p>

                    <Botao
                        primario
                        disabled={disabled || salvando}
                        onClick={() => void salvar()}
                        className="w-full sm:w-auto"
                    >
                        {salvando ? "Salvando..." : "Salvar valores do plano"}
                    </Botao>
                </div>
            </div>
        </BlocoRegras>
    );
}
