"use client";

/**
 * OS dentro do "Editar registro" (Wizard).
 *
 * Liga o atendimento ao módulo de OS (os_principal.php):
 *  - campos novos da OS no atendimento (convênio/plano, contrato, tipo de procedimento, autorização da Prefeitura, translado);
 *  - "Resumo da OS" e "Visualização da OS" (folha);
 *  - salvarEsincronizarOS(): grava os campos e monta/atualiza as OS depois que o atendimento é salvo.
 *
 * Só o que o atendimento já escolheu vira item da OS; nada de estoque é movimentado por aqui.
 * O valor do contrato da Prefeitura não é mostrado ao agente (o back-end também não envia).
 */

import React, { useCallback, useEffect, useState } from "react";

const API_BASE = "https://api.planoassistencialintegrado.com.br";
const OS_API = `${API_BASE}/os_principal.php`;
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

export type SimNao = "" | "Sim" | "Não";

export type OsCampos = {
    convenio_os: string;
    contrato_numero: string;
    tanato_produto_id: string;
    tanato_autorizado_prefeitura: SimNao;
    translado: SimNao;
    translado_origem: string;
    translado_destino: string;
    translado_km: string;
    translado_autorizado_prefeitura: SimNao;
};

export const OS_CAMPOS_VAZIO: OsCampos = {
    convenio_os: "",
    contrato_numero: "",
    tanato_produto_id: "",
    tanato_autorizado_prefeitura: "",
    translado: "",
    translado_origem: "",
    translado_destino: "",
    translado_km: "",
    translado_autorizado_prefeitura: "",
};

export const PLANOS = ["LIGHT", "FLEX", "PLUS", "MAX"] as const;

export type TipoConvenio = "particular" | "associado" | "prefeitura" | "outro";

export function tipoConvenio(texto?: string | null): TipoConvenio {
    const t = String(texto ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    if (t.includes("prefeitura")) return "prefeitura";
    if (t.includes("associad")) return "associado";
    if (t.includes("particular")) return "particular";
    return "outro";
}

/* ------------------------------------------------------------------ API ------------------------------------------------------------------ */

async function osChamar(flag: string, params: Record<string, string | number | undefined> = {}, post = false) {
    const qs = new URLSearchParams({ [flag]: "1" });
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) qs.set(k, String(v));
    }

    const res = post
        ? await fetch(OS_API, {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: qs,
        })
        : await fetch(`${OS_API}?${qs.toString()}&_=${Date.now()}`, { credentials: "include", cache: "no-store" });

    const json = await res.json().catch(() => null);
    if (res.status === 401 || json?.need_login) {
        if (typeof window !== "undefined") window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }
    if (!res.ok || json?.erro || json?.sucesso === false) {
        throw new Error(json?.msg || `Falha na requisição (${res.status}).`);
    }
    return json;
}

type CamposLidos = { campos: OsCampos; faltando: string[]; convenioTexto: string };

export async function carregarCamposOS(atendimentoId: number | string): Promise<CamposLidos> {
    const r = await osChamar("dados_os_atendimento", { atendimento_id: atendimentoId });
    const c = r.dados?.campos || {};
    const campos: OsCampos = { ...OS_CAMPOS_VAZIO };
    (Object.keys(OS_CAMPOS_VAZIO) as (keyof OsCampos)[]).forEach((k) => {
        const v = c[k];
        (campos as any)[k] = v == null ? "" : String(v).replace(".", k === "translado_km" ? "," : ".");
    });
    return { campos, faltando: r.dados?.colunas_faltando || [], convenioTexto: String(r.dados?.convenio_texto || "") };
}

export async function listarModelosTanato(): Promise<{ produto_id: number; nome: string }[]> {
    const r = await osChamar("tanato_modelos");
    return r.dados?.modelos || [];
}

export type OsResumo = { os_convenio: any | null; os_particular: any | null };

export async function lerOSDoAtendimento(atendimentoId: number | string): Promise<OsResumo> {
    const r = await osChamar("os_do_atendimento", { atendimento_id: atendimentoId });
    return r.dados || { os_convenio: null, os_particular: null };
}

/** Valida o que a OS precisa antes de salvar o atendimento. Devolve a mensagem de erro ou null. */
export function validarCamposOS(convenioTexto: string, tanato: string, c: OsCampos): string | null {
    const tipo = tipoConvenio(convenioTexto);
    const tanatoSim = String(tanato).trim().toLowerCase() === "sim";

    if (tipo === "associado" && !c.convenio_os.startsWith("ASSOCIADO_")) {
        return "OS: informe o plano do associado (Itens → Dados da OS).";
    }
    if (tanatoSim && !c.tanato_produto_id) {
        return "OS: selecione o Tipo de procedimento da conservação.";
    }
    if (tipo === "prefeitura" && tanatoSim && !c.tanato_autorizado_prefeitura) {
        return "OS: informe se a Prefeitura autorizou a tanatopraxia.";
    }
    if (c.translado === "Sim") {
        if (!c.translado_origem.trim() || !c.translado_destino.trim() || !c.translado_km.trim()) {
            return "OS: informe partida, destino e distância do translado.";
        }
        if (tipo === "prefeitura" && !c.translado_autorizado_prefeitura) {
            return "OS: informe se a Prefeitura autorizou o translado.";
        }
    }
    return null;
}

/**
 * Grava os campos da OS no atendimento e monta/atualiza as OS.
 * Campos que não se aplicam ao convênio ou à etapa atual são limpos (evita OS com dados de uma escolha anterior).
 */
export async function salvarEsincronizarOS(
    atendimentoId: number | string,
    convenioTexto: string,
    tanato: string,
    c: OsCampos,
): Promise<{ alteracoes: string[]; resumo: OsResumo }> {
    const tipo = tipoConvenio(convenioTexto);
    const tanatoSim = String(tanato).trim().toLowerCase() === "sim";
    const transladoSim = c.translado === "Sim";

    await osChamar(
        "salvar_dados_os_atendimento",
        {
            atendimento_id: atendimentoId,
            convenio_os: tipo === "associado" ? c.convenio_os : "",
            contrato_numero: tipo === "associado" ? c.contrato_numero : "",
            tanato_produto_id: tanatoSim ? c.tanato_produto_id : "",
            tanato_autorizado_prefeitura: tipo === "prefeitura" && tanatoSim ? c.tanato_autorizado_prefeitura : "",
            translado: c.translado,
            translado_origem: transladoSim ? c.translado_origem : "",
            translado_destino: transladoSim ? c.translado_destino : "",
            translado_km: transladoSim ? c.translado_km : "",
            translado_autorizado_prefeitura: tipo === "prefeitura" && transladoSim ? c.translado_autorizado_prefeitura : "",
        },
        true,
    );

    const r = await osChamar("sincronizar_os_atendimento", { atendimento_id: atendimentoId }, true);
    return {
        alteracoes: r.dados?.alteracoes || [],
        resumo: { os_convenio: r.dados?.os_convenio ?? null, os_particular: r.dados?.os_particular ?? null },
    };
}

/* ------------------------------------------------------------------ UI ------------------------------------------------------------------ */

const brl = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ROTULO = "mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";
const CAMPO =
    "w-full rounded-xl border border-[#E3E8F0] bg-white px-3 py-2.5 text-[16px] text-[#313C55] outline-none focus:border-[#00AEEC] focus:ring-2 focus:ring-[#00AEEC]/30 disabled:opacity-60 dark:border-white/[0.12] dark:bg-[#1C2334] dark:text-white sm:text-sm";
const CARTAO = "rounded-2xl border border-[#E3E8F0] bg-white p-3 dark:border-white/[0.12] dark:bg-[#232B3F]";

function SimNaoBotoes({ valor, onChange, disabled }: { valor: SimNao; onChange: (v: SimNao) => void; disabled?: boolean }) {
    return (
        <span className="inline-flex gap-2">
            {(["Sim", "Não"] as const).map((v) => (
                <button
                    key={v}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(v)}
                    aria-pressed={valor === v}
                    className={[
                        "h-10 min-w-[64px] rounded-xl border-[1.5px] px-4 text-sm font-extrabold disabled:opacity-60",
                        valor === v
                            ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]"
                            : "border-[#E3E8F0] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/25 dark:bg-transparent dark:text-white dark:hover:bg-white/10",
                    ].join(" ")}
                >
                    {v}
                </button>
            ))}
        </span>
    );
}

function Autorizacao({ servico, valor, onChange, disabled }: { servico: "tanatopraxia" | "translado"; valor: SimNao; onChange: (v: SimNao) => void; disabled?: boolean }) {
    return (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-[#F2CB3F] bg-[#FCF3CC] px-4 py-2.5 text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white">
            <div className="min-w-[180px] flex-1 text-sm font-extrabold">
                A Prefeitura autorizou {servico === "translado" ? "o translado" : "a tanatopraxia"}?
            </div>
            <SimNaoBotoes valor={valor} onChange={onChange} disabled={disabled} />
            {valor === "Sim" ? <span className="rounded-full bg-[#EEF5D6] px-3 py-1 text-xs font-extrabold text-[#313C55]">entra no contrato</span> : null}
            {valor === "Não" ? <span className="rounded-full bg-[#E6F7FE] px-3 py-1 text-xs font-extrabold text-[#313C55]">vai para a diferença da família</span> : null}
            {valor === "" ? <span className="text-xs font-extrabold text-[#B42318] dark:text-[#FF9C92]">obrigatório</span> : null}
        </div>
    );
}

function CartaoResumo({ rotulo, os, texto, valor, tom }: { rotulo: string; os: any; texto?: string; valor?: string; tom: "azul" | "verde" | "amarelo" }) {
    const fundo = tom === "azul" ? "bg-[#E6F7FE] dark:bg-[#00AEEC]/20" : tom === "verde" ? "bg-[#EEF5D6] dark:bg-[#B3CE52]/20" : "bg-[#FCF3CC] dark:bg-[#F2CB3F]/15";
    return (
        <div className={["rounded-2xl p-3.5", fundo].join(" ")}>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">{rotulo}</div>
            <div className="text-xs font-bold text-[#313C55] dark:text-white">{os?.numero_os}</div>
            {valor ? <div className="mt-1 text-2xl font-extrabold text-[#313C55] dark:text-white">{valor}</div> : null}
            {texto ? <div className="mt-1 text-xs text-[#5B6478] dark:text-[#AEB9CF]">{texto}</div> : null}
        </div>
    );
}

export function SecaoOSAtendimento({
    convenio,
    tanato,
    valores,
    onChange,
    colunasFaltando = [],
    atendimentoId,
    versao = 0,
    disabled,
}: {
    convenio: string;
    tanato: string;
    valores: OsCampos;
    onChange: (parcial: Partial<OsCampos>) => void;
    colunasFaltando?: string[];
    atendimentoId?: number | string | null;
    versao?: number;
    disabled?: boolean;
}) {
    const tipo = tipoConvenio(convenio);
    const tanatoSim = String(tanato).trim().toLowerCase() === "sim";
    const plano = valores.convenio_os.startsWith("ASSOCIADO_") ? valores.convenio_os.slice(10) : "";

    const [modelos, setModelos] = useState<{ produto_id: number; nome: string }[]>([]);
    const [modelosErro, setModelosErro] = useState("");
    const [resumo, setResumo] = useState<OsResumo | null>(null);
    const [resumoErro, setResumoErro] = useState("");
    const [folhaAberta, setFolhaAberta] = useState(false);

    useEffect(() => {
        if (!tanatoSim || modelos.length) return;
        let vivo = true;
        listarModelosTanato()
            .then((m) => vivo && (setModelos(m), setModelosErro("")))
            .catch((e) => vivo && setModelosErro(e?.message || "Não foi possível carregar os modelos."));
        return () => {
            vivo = false;
        };
    }, [tanatoSim, modelos.length]);

    const carregarResumo = useCallback(async () => {
        if (atendimentoId == null || atendimentoId === "") return;
        try {
            setResumo(await lerOSDoAtendimento(atendimentoId));
            setResumoErro("");
        } catch (e: any) {
            setResumoErro(e?.message || "Não foi possível carregar a OS.");
        }
    }, [atendimentoId]);

    useEffect(() => {
        void carregarResumo();
    }, [carregarResumo, versao]);

    const os = [resumo?.os_convenio, resumo?.os_particular].filter(Boolean) as any[];
    const ehPref = tipo === "prefeitura";

    return (
        <section aria-label="Dados da OS" className="mt-5 rounded-2xl border border-[#E3E8F0] bg-[#F6F8FB] p-3 dark:border-white/[0.12] dark:bg-[#1C2334] sm:p-4">
            <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:text-[#AEB9CF]">Dados da OS</h3>

            {colunasFaltando.length ? (
                <div className="mt-3 rounded-xl border border-[#F2CB3F] bg-[#FCF3CC] p-3 text-sm font-semibold text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white">
                    Faltam colunas da OS no banco ({colunasFaltando.join(", ")}). Rode o <b>alteracoes_atendimento_sugeridas.sql</b> para poder salvar estes campos.
                </div>
            ) : null}

            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {tipo === "associado" ? (
                    <>
                        <label className="block">
                            <span className={ROTULO}>Plano do associado *</span>
                            <select
                                className={CAMPO}
                                disabled={disabled}
                                value={plano}
                                onChange={(e) => onChange({ convenio_os: e.target.value ? `ASSOCIADO_${e.target.value}` : "" })}
                            >
                                <option value="">Selecione</option>
                                {PLANOS.map((p) => (
                                    <option key={p} value={p}>
                                        {p}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className={ROTULO}>Contrato do titular</span>
                            <input
                                className={CAMPO}
                                disabled={disabled}
                                value={valores.contrato_numero}
                                onChange={(e) => onChange({ contrato_numero: e.target.value })}
                                placeholder="Número do contrato"
                                maxLength={40}
                            />
                        </label>
                    </>
                ) : null}

                {tanatoSim ? (
                    <div className="sm:col-span-2">
                        <label className="block">
                            <span className={ROTULO}>Tipo de procedimento *</span>
                            <select
                                className={CAMPO}
                                disabled={disabled}
                                value={valores.tanato_produto_id}
                                onChange={(e) => onChange({ tanato_produto_id: e.target.value })}
                            >
                                <option value="">Selecione</option>
                                {modelos.map((m) => (
                                    <option key={m.produto_id} value={String(m.produto_id)}>
                                        {m.nome}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {modelosErro ? <p className="mt-1 text-xs font-bold text-[#B42318] dark:text-[#FF9C92]">{modelosErro}</p> : null}
                        {ehPref ? (
                            <Autorizacao servico="tanatopraxia" valor={valores.tanato_autorizado_prefeitura} onChange={(v) => onChange({ tanato_autorizado_prefeitura: v })} disabled={disabled} />
                        ) : null}
                    </div>
                ) : null}

                <div className="sm:col-span-2">
                    <span className={ROTULO}>Translado</span>
                    <SimNaoBotoes valor={valores.translado} onChange={(v) => onChange({ translado: v })} disabled={disabled} />

                    {valores.translado === "Sim" ? (
                        <>
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_140px]">
                                <label className="block">
                                    <span className={ROTULO}>Partida *</span>
                                    <input className={CAMPO} disabled={disabled} value={valores.translado_origem} onChange={(e) => onChange({ translado_origem: e.target.value })} maxLength={100} />
                                </label>
                                <label className="block">
                                    <span className={ROTULO}>Destino *</span>
                                    <input className={CAMPO} disabled={disabled} value={valores.translado_destino} onChange={(e) => onChange({ translado_destino: e.target.value })} maxLength={100} />
                                </label>
                                <label className="block">
                                    <span className={ROTULO}>Distância (km) *</span>
                                    <input
                                        className={CAMPO}
                                        disabled={disabled}
                                        inputMode="decimal"
                                        value={valores.translado_km}
                                        onChange={(e) => onChange({ translado_km: e.target.value.replace(/[^\d,.]/g, "") })}
                                    />
                                </label>
                            </div>
                            {ehPref ? (
                                <Autorizacao servico="translado" valor={valores.translado_autorizado_prefeitura} onChange={(v) => onChange({ translado_autorizado_prefeitura: v })} disabled={disabled} />
                            ) : null}
                        </>
                    ) : null}
                </div>
            </div>

            {/* RESUMO DA OS */}
            <div className="mt-5">
                <div className="flex items-center gap-2">
                    <h3 className="flex-1 text-xs font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:text-[#AEB9CF]">Resumo da OS</h3>
                    {atendimentoId != null && atendimentoId !== "" ? (
                        <button
                            type="button"
                            onClick={() => void carregarResumo()}
                            className="h-9 rounded-xl border-[1.5px] border-[#313C55] px-3 text-xs font-bold text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/40 dark:text-white dark:hover:bg-white/10"
                        >
                            Atualizar
                        </button>
                    ) : null}
                </div>

                {atendimentoId == null || atendimentoId === "" ? (
                    <p className="mt-2 text-sm text-[#5B6478] dark:text-[#AEB9CF]">A OS é montada quando você salvar o registro.</p>
                ) : resumoErro ? (
                    <p className="mt-2 rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-sm font-semibold text-[#B42318] dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">OS: {resumoErro}</p>
                ) : os.length === 0 ? (
                    <p className="mt-2 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Ainda não há OS para este atendimento. Salve o registro para montar.</p>
                ) : (
                    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {resumo?.os_convenio ? (
                            <CartaoResumo
                                rotulo={ehPref ? "Faturar à Prefeitura" : "Coberto pelo plano"}
                                os={resumo.os_convenio}
                                tom={ehPref ? "azul" : "verde"}
                                valor={ehPref ? undefined : "Total a pagar R$ 0,00"}
                                texto={ehPref ? "O valor do contrato fica no financeiro." : undefined}
                            />
                        ) : null}
                        {resumo?.os_particular ? (
                            <CartaoResumo
                                rotulo={resumo?.os_convenio ? "Diferença da família" : "Total da OS"}
                                os={resumo.os_particular}
                                tom="amarelo"
                                valor={brl(resumo.os_particular.valor_total)}
                                texto="Confirme os valores e colha a assinatura em Minhas OS."
                            />
                        ) : null}
                    </div>
                )}
            </div>

            {/* VISUALIZAÇÃO DA OS */}
            {os.length ? (
                <div className="mt-5">
                    <div className="flex items-center gap-2">
                        <h3 className="flex-1 text-xs font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:text-[#AEB9CF]">Visualização da OS</h3>
                        <button
                            type="button"
                            onClick={() => setFolhaAberta((v) => !v)}
                            className="h-9 rounded-xl border-[1.5px] border-[#313C55] px-3 text-xs font-bold text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/40 dark:text-white dark:hover:bg-white/10"
                        >
                            {folhaAberta ? "Ocultar folha" : "Ver folha"}
                        </button>
                    </div>
                    <p className="mt-1 text-xs text-[#5B6478] dark:text-[#AEB9CF]">Rascunho: a folha se monta conforme os itens são lançados.</p>

                    {folhaAberta ? (
                        <div className="mt-2 space-y-3">
                            {os.map((o) => {
                                const url = `${OS_API}?documento_os=1&os_id=${o.id}&formato=visualizar&_=${versao}`;
                                return (
                                    <div key={o.id} className={CARTAO}>
                                        <div className="mb-2 flex items-center gap-2">
                                            <span className="flex-1 text-sm font-extrabold text-[#313C55] dark:text-white">OS nº {o.numero_os}</span>
                                            <a href={url} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#313C55] underline dark:text-white">
                                                Abrir em nova aba
                                            </a>
                                        </div>
                                        <iframe title={`Folha da OS ${o.numero_os}`} src={url} className="h-[420px] w-full rounded-xl border border-[#E3E8F0] bg-white dark:border-white/[0.12]" />
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
