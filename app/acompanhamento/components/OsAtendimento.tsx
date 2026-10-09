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
import { carregarItensOS } from "@/app/os/components/ItensOSAjuste";
import OSDoAtendimento from "@/app/os/components/OSDoAtendimento";

const API_BASE = "https://api.planoassistencialintegrado.com.br";
const OS_API = `${API_BASE}/os_principal.php`;
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

export type SimNao = "" | "Sim" | "Não";

export type TipoCadastro = "" | "PARTICULAR" | "ASSOCIADO" | "PREFEITURA";

export type OsCampos = {
    /** Vínculo com o cadastro de Convênios (convenio.php): id do convênio e do pacote escolhido. */
    convenio_id: string;
    /** Tipo do convênio no cadastro (vem do cadastro, não é gravado no atendimento). */
    convenio_tipo: TipoCadastro;
    pacote_id: string;
    /** Prefeitura: a Prefeitura autorizou o PACOTE de atendimento? Sem autorização o pacote não cobre nada. */
    pacote_autorizado_prefeitura: SimNao;
    convenio_os: string;
    contrato_numero: string;
    tanato_produto_id: string;
    tanato_autorizado_prefeitura: SimNao;
    /** Adicional à parte do procedimento (só com tanatopraxia = Sim). Sim = entra na OS como serviço adicional. */
    reconstituicao_facial: SimNao;
    translado: SimNao;
    translado_origem: string;
    translado_destino: string;
    translado_km: string;
    translado_autorizado_prefeitura: SimNao;
    /** Prefeitura com pacote de coroa (pacote de Produto): a Prefeitura autorizou a coroa? Vale mesmo sem o pacote de atendimento. */
    coroa_autorizada_prefeitura: SimNao;
    /** "1" quando o convênio escolhido tem pacote de coroa (vem do cadastro, não é gravado no atendimento). */
    pacote_coroa: "" | "1";
};

export const OS_CAMPOS_VAZIO: OsCampos = {
    convenio_id: "",
    convenio_tipo: "",
    pacote_id: "",
    pacote_autorizado_prefeitura: "",
    convenio_os: "",
    contrato_numero: "",
    tanato_produto_id: "",
    tanato_autorizado_prefeitura: "",
    reconstituicao_facial: "",
    translado: "",
    translado_origem: "",
    translado_destino: "",
    translado_km: "",
    translado_autorizado_prefeitura: "",
    coroa_autorizada_prefeitura: "",
    pacote_coroa: "",
};

export const PLANOS = ["LIGHT", "FLEX", "PLUS", "MAX"] as const;

export type TipoConvenio = "particular" | "associado" | "prefeitura" | "outro";

export function tipoConvenio(texto?: string | null, tipoCadastro?: string | null): TipoConvenio {
    const reg = String(tipoCadastro ?? "").toUpperCase();
    if (reg === "PREFEITURA") return "prefeitura";
    if (reg === "ASSOCIADO") return "associado";
    if (reg === "PARTICULAR") return "particular";
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

type CamposLidos = { campos: OsCampos; faltando: string[]; convenioTexto: string; localCerimonia: string };

export async function carregarCamposOS(atendimentoId: number | string): Promise<CamposLidos> {
    const r = await osChamar("dados_os_atendimento", { atendimento_id: atendimentoId });
    const c = r.dados?.campos || {};
    const campos: OsCampos = { ...OS_CAMPOS_VAZIO };
    (Object.keys(OS_CAMPOS_VAZIO) as (keyof OsCampos)[]).forEach((k) => {
        const v = c[k];
        (campos as any)[k] = v == null ? "" : String(v).replace(".", k === "translado_km" ? "," : ".");
    });
    return {
        campos,
        faltando: r.dados?.colunas_faltando || [],
        convenioTexto: String(r.dados?.convenio_texto || ""),
        localCerimonia: String(c.local_cerimonia ?? "").trim(),
    };
}

/** Grava só o Local do velório (sepultamentos.local_cerimonia). Vale para qualquer convênio, com ou sem OS. */
export async function salvarLocalCerimonia(atendimentoId: number | string, local: string): Promise<void> {
    await osChamar("salvar_dados_os_atendimento", { atendimento_id: atendimentoId, local_cerimonia: local.trim() }, true);
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
/** Prefeitura com o pacote de atendimento NÃO autorizado: tudo vai para a família e as perguntas de tanatopraxia e translado somem. */
export function pacoteNegado(c: OsCampos): boolean {
    return !!c.convenio_id && !!c.pacote_id && c.pacote_autorizado_prefeitura === "Não";
}

/** A pergunta "A Prefeitura autorizou a coroa?" aparece: Prefeitura com pacote de coroa e coroa = Sim. */
export function perguntaCoroa(convenioTexto: string, coroaFlores: string, c: OsCampos): boolean {
    return tipoConvenio(convenioTexto, c.convenio_tipo) === "prefeitura" && c.pacote_coroa === "1" && String(coroaFlores).trim().toLowerCase() === "sim";
}

export function validarCamposOS(convenioTexto: string, tanato: string, c: OsCampos, coroaFlores = ""): string | null {
    const tipo = tipoConvenio(convenioTexto, c.convenio_tipo);
    const tanatoSim = String(tanato).trim().toLowerCase() === "sim";
    const negado = pacoteNegado(c);

    if (tipo === "associado" && !c.convenio_os.startsWith("ASSOCIADO_")) {
        return "OS: informe o plano do associado (Itens → Dados da OS).";
    }
    if (tipo === "prefeitura" && c.convenio_id && c.pacote_id && !c.pacote_autorizado_prefeitura) {
        return "OS: informe se a Prefeitura autorizou o pacote de atendimento (aba Atendimento).";
    }
    if (tanatoSim && !c.tanato_produto_id) {
        return "OS: selecione o Tipo de procedimento da conservação.";
    }
    if (tipo === "prefeitura" && !negado && tanatoSim && !c.tanato_autorizado_prefeitura) {
        return "OS: informe se a Prefeitura autorizou a tanatopraxia.";
    }
    if (c.translado === "Sim") {
        if (!c.translado_origem.trim() || !c.translado_destino.trim() || !c.translado_km.trim()) {
            return "OS: informe partida, destino e distância do translado.";
        }
        if (tipo === "prefeitura" && !negado && !c.translado_autorizado_prefeitura) {
            return "OS: informe se a Prefeitura autorizou o translado.";
        }
    }
    if (perguntaCoroa(convenioTexto, coroaFlores, c) && !c.coroa_autorizada_prefeitura) {
        return "OS: informe se a Prefeitura autorizou a coroa (aba Itens, Coroa de flores).";
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
    coroaFlores = "",
): Promise<{ alteracoes: string[]; resumo: OsResumo }> {
    const tipo = tipoConvenio(convenioTexto, c.convenio_tipo);
    const tanatoSim = String(tanato).trim().toLowerCase() === "sim";
    const transladoSim = c.translado === "Sim";
    const negado = pacoteNegado(c);
    // A coluna da coroa só é enviada quando o convênio tem pacote de coroa: sem pacote de coroa nada muda no que é gravado.
    const coroa: Record<string, string> = c.pacote_coroa === "1"
        ? { coroa_autorizada_prefeitura: perguntaCoroa(convenioTexto, coroaFlores, c) ? c.coroa_autorizada_prefeitura : "" }
        : {};

    await osChamar(
        "salvar_dados_os_atendimento",
        {
            ...coroa,
            atendimento_id: atendimentoId,
            convenio_id: c.convenio_id,
            pacote_id: tipo === "particular" || tipo === "outro" ? "" : c.pacote_id,
            pacote_autorizado_prefeitura: tipo === "prefeitura" ? c.pacote_autorizado_prefeitura : "",
            convenio_os: tipo === "associado" ? c.convenio_os : "",
            contrato_numero: tipo === "associado" ? c.contrato_numero : "",
            tanato_produto_id: tanatoSim ? c.tanato_produto_id : "",
            tanato_autorizado_prefeitura: tipo === "prefeitura" && tanatoSim && !negado ? c.tanato_autorizado_prefeitura : "",
            reconstituicao_facial: tanatoSim ? c.reconstituicao_facial : "",
            translado: c.translado,
            translado_origem: transladoSim ? c.translado_origem : "",
            translado_destino: transladoSim ? c.translado_destino : "",
            translado_km: transladoSim ? c.translado_km : "",
            translado_autorizado_prefeitura: tipo === "prefeitura" && transladoSim && !negado ? c.translado_autorizado_prefeitura : "",
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
    "w-full rounded-xl border border-[#E3E8F0] bg-white px-3 py-2.5 text-[16px] text-[#313C55] outline-none focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/30 disabled:opacity-60 dark:border-white/[0.12] dark:bg-[#1C2334] dark:text-white sm:text-sm";
const CARTAO = "rounded-2xl border border-[#E3E8F0] bg-white p-3 dark:border-white/[0.12] dark:bg-[#232B3F]";

/** Marcação do botão escolhido: ✓ no Sim (e nas demais opções), ✕ no Não. */
function IconeMarcado({ valor }: { valor: string }) {
    const nao = valor === "Não";
    return (
        <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {nao ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M5 12.5l4.5 4.5L19 7.5" />}
        </svg>
    );
}

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
                        "inline-flex h-10 min-w-[84px] items-center justify-center gap-1.5 rounded-xl border-[1.5px] px-4 text-sm font-extrabold disabled:opacity-60",
                        valor === v
                            ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]"
                            : "border-[#E3E8F0] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/25 dark:bg-transparent dark:text-white dark:hover:bg-white/10",
                    ].join(" ")}
                >
                    {valor === v ? <IconeMarcado valor={v} /> : null}
                    {v}
                </button>
            ))}
        </span>
    );
}

function Autorizacao({ servico, valor, onChange, disabled }: { servico: "tanatopraxia" | "translado" | "coroa"; valor: SimNao; onChange: (v: SimNao) => void; disabled?: boolean }) {
    return (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-[#F2CB3F] bg-[#FCF3CC] px-4 py-2.5 text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white">
            <div className="min-w-[180px] flex-1 text-sm font-extrabold">
                A Prefeitura autorizou {servico === "translado" ? "o translado" : servico === "coroa" ? "a coroa" : "a tanatopraxia"}?
            </div>
            <SimNaoBotoes valor={valor} onChange={onChange} disabled={disabled} />
            {valor === "Sim" ? <span className="rounded-full bg-[#EEF5D6] px-3 py-1 text-xs font-extrabold text-[#313C55]">entra no contrato</span> : null}
            {valor === "Não" ? <span className="rounded-full bg-[#E9EFF6] px-3 py-1 text-xs font-extrabold text-[#313C55]">{servico === "coroa" ? "vai para a família (preço particular)" : "vai para a diferença da família"}</span> : null}
            {valor === "" ? <span className="text-xs font-extrabold text-[#B42318] dark:text-[#FF9C92]">obrigatório</span> : null}
        </div>
    );
}

/** Cartão compacto do Resumo da OS (coluna lateral): rótulo e número à esquerda, valor à direita, nota curta embaixo. */
function CartaoResumo({ rotulo, os, texto, valor, tom }: { rotulo: string; os: any; texto?: string; valor?: string; tom: "azul" | "verde" | "amarelo" }) {
    const fundo = tom === "azul" ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/20" : tom === "verde" ? "bg-[#EEF5D6] dark:bg-[#B3CE52]/20" : "bg-[#FCF3CC] dark:bg-[#F2CB3F]/15";
    return (
        <div className={["rounded-xl px-3 py-2", fundo].join(" ")}>
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-[10px] font-extrabold uppercase leading-tight tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">{rotulo}</div>
                    <div className="text-xs font-bold leading-tight text-[#313C55] dark:text-white">{os?.numero_os}</div>
                </div>
                {valor ? <div className="whitespace-nowrap text-lg font-extrabold leading-tight text-[#313C55] dark:text-white">{valor}</div> : null}
            </div>
            {texto ? <div className="mt-0.5 text-[11px] leading-snug text-[#5B6478] dark:text-[#AEB9CF]">{texto}</div> : null}
        </div>
    );
}

/* ---------- Tipo de procedimento: 3 opções (a reconstituição facial é um adicional à parte, Sim/Não) ---------- */
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Fica só com Tanatopraxia, Tanatopraxia Avançada e Embalsamamento, nesta ordem (reconstituição não é uma opção do procedimento). */
export function modelosProcedimento(modelos: { produto_id: number; nome: string }[]) {
    const peso = (nome: string) => {
        const n = semAcento(nome);
        if (n.startsWith("embalsam")) return 3;
        if (n.startsWith("tanatopraxia")) return /avanc/.test(n) ? 2 : 1;
        return 0; // reconstituição e qualquer outro: fora da lista
    };
    return modelos.filter((m) => peso(m.nome) > 0).sort((a, b) => peso(a.nome) - peso(b.nome));
}

export function rotuloProcedimento(nome: string): string {
    return nome.trim().toLocaleLowerCase("pt-BR").replace(/(^|\s)(\p{L})/gu, (_m, e: string, c: string) => e + c.toLocaleUpperCase("pt-BR"));
}

const ROTULO_CAMPO = "mb-1.5 block text-[13px] font-bold text-[#313C55] dark:text-white";
const CAMPO_V2 =
    "h-12 w-full rounded-xl border-[1.5px] border-[#C9D1DE] bg-white px-3.5 text-[15px] text-[#313C55] outline-none transition placeholder:text-[#7A8396] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 disabled:opacity-60 dark:border-white/25 dark:bg-[#232B3F] dark:text-white";
const CARTAO_LINHA = "rounded-[14px] border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";

/** Linha de item no padrão do mockup: cartão com o nome e o seletor Sim | Não (igual aos demais itens do assistente). */
function LinhaSimNao({ rotulo, valor, onChange, disabled, children }: { rotulo: string; valor: SimNao; onChange: (v: SimNao) => void; disabled?: boolean; children?: React.ReactNode }) {
    return (
        <div>
            <div className={`flex min-h-[68px] items-center gap-3 px-4 py-2.5 ${CARTAO_LINHA}`} role="group" aria-label={rotulo}>
                <div className="min-w-0 flex-1 text-[15px] font-bold leading-tight text-[#313C55] dark:text-white">{rotulo}</div>
                <div className="inline-flex shrink-0 overflow-hidden rounded-xl border-[1.5px] border-[#C9D1DE] dark:border-white/25">
                    {(["Sim", "Não"] as const).map((v, i) => (
                        <button
                            key={v}
                            type="button"
                            disabled={disabled}
                            aria-pressed={valor === v}
                            aria-label={`${rotulo}: ${v}`}
                            onClick={() => onChange(v)}
                            className={[
                                "inline-flex h-11 min-w-[84px] items-center justify-center gap-1.5 px-3 text-sm font-extrabold transition-colors disabled:cursor-not-allowed",
                                i > 0 ? "border-l-[1.5px] border-[#C9D1DE] dark:border-white/25" : "",
                                valor === v
                                    ? "bg-[#313C55] text-white dark:bg-[#3D6A99] dark:text-white"
                                    : "bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/10",
                            ].join(" ")}
                        >
                            {valor === v ? <IconeMarcado valor={v} /> : null}
                            {v}
                        </button>
                    ))}
                </div>
            </div>
            {children}
        </div>
    );
}

/* =========================================================================================================
   Vínculo com o cadastro de Convênios + prévia da OS em tempo real  (os_principal.php)
   A prévia NÃO grava nada: a OS só entra no banco quando o registro é salvo.
   ========================================================================================================= */

export type ItemPacoteOpcao = { chave: string; rotulo: string; quantidade: number; tipo: string; produtos: { produto_id: number; nome: string }[]; valor_contrato?: number | null };
export type PacoteOpcao = { id: number; nome: string; padrao: boolean; itens: ItemPacoteOpcao[]; realiza_velorio: boolean; realiza_sepultamento: boolean };
/** pacotes = só os pacotes de ATENDIMENTO, na ordem do cadastro. tem_pacote_coroa: Prefeitura com pacote de Produto de coroa. */
export type ConvenioOpcao = { id: number; nome: string; tipo: TipoCadastro; codigo: string; pacotes: PacoteOpcao[]; aditivos_permitidos: string[]; tem_pacote_coroa?: boolean };

/**
 * Convênios/pacotes e prévia da OS pelo os_principal.php (convenios_opcoes / previa_os_atendimento), as mesmas regras do
 * motor que grava a OS. (Antes chamava o os_previa.php, que tinha cópia própria das regras e ficou para trás: mostrava os
 * pacotes de Produto na escolha do pacote e não fazia a pergunta da coroa.)
 */
async function previaChamar(acao: "opcoes" | "previa", corpo?: unknown, signal?: AbortSignal) {
    const res =
        acao === "opcoes"
            ? await fetch(`${OS_API}?convenios_opcoes=1&_=${Date.now()}`, { credentials: "include", cache: "no-store", signal })
            : await fetch(OS_API, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ previa_os_atendimento: "1", rascunho: JSON.stringify(corpo ?? {}) }),
                signal,
            });
    const json = await res.json().catch(() => null);
    if (res.status === 401 || json?.need_login || json?.code === "NEED_LOGIN") {
        if (typeof window !== "undefined") window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }
    if (!res.ok || json?.erro || json?.sucesso === false) throw new Error(json?.msg || `Falha na requisição (${res.status}).`);
    return json.dados ?? json.data;
}

let opcoesEmCache: Promise<ConvenioOpcao[]> | null = null;
export function carregarOpcoesConvenio(forcar = false): Promise<ConvenioOpcao[]> {
    if (!opcoesEmCache || forcar) {
        opcoesEmCache = previaChamar("opcoes")
            .then((d) => (Array.isArray(d?.convenios) ? (d.convenios as ConvenioOpcao[]) : []))
            .catch((e) => {
                opcoesEmCache = null; // tenta de novo na próxima abertura
                throw e;
            });
    }
    return opcoesEmCache;
}

/** Convênios e pacotes cadastrados (uma busca só, compartilhada por todas as telas). */
export function useOpcoesConvenio(ativo = true) {
    const [estado, setEstado] = useState<{ convenios: ConvenioOpcao[]; carregando: boolean; erro: string }>({ convenios: [], carregando: true, erro: "" });
    useEffect(() => {
        if (!ativo) return;
        let vivo = true;
        carregarOpcoesConvenio()
            .then((c) => vivo && setEstado({ convenios: c, carregando: false, erro: "" }))
            .catch((e) => vivo && setEstado({ convenios: [], carregando: false, erro: e?.message || "Não foi possível carregar os convênios." }));
        return () => {
            vivo = false;
        };
    }, [ativo]);
    return estado;
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Acha o convênio pelo id gravado; registros antigos (sem id) são achados pelo nome. */
export function acharConvenio(convenios: ConvenioOpcao[], id: number, nome: string): ConvenioOpcao | null {
    if (id > 0) {
        const porId = convenios.find((c) => c.id === id);
        if (porId) return porId;
    }
    const n = norm(nome || "");
    return n ? convenios.find((c) => norm(c.nome) === n) ?? null : null;
}

function pacoteInicial(conv: ConvenioOpcao, atual?: string): PacoteOpcao | null {
    return conv.pacotes.find((p) => String(p.id) === atual) ?? conv.pacotes.find((p) => p.padrao) ?? conv.pacotes[0] ?? null;
}

/** Campos da OS que faltam acertar com o cadastro (id, tipo, plano e pacote). Devolve null quando já está tudo certo. */
export function resolverVinculo(convenios: ConvenioOpcao[], texto: string, c: OsCampos): Partial<OsCampos> | null {
    const conv = acharConvenio(convenios, Number(c.convenio_id) || 0, texto);
    if (!conv) return null;
    const pac = pacoteInicial(conv, c.pacote_id);
    const novo: Partial<OsCampos> = {
        convenio_id: String(conv.id),
        convenio_tipo: conv.tipo,
        pacote_id: pac ? String(pac.id) : "",
        pacote_coroa: conv.tem_pacote_coroa ? "1" : "",
    };
    if (conv.tipo === "ASSOCIADO" && conv.codigo) novo.convenio_os = conv.codigo;
    const mudou = (Object.keys(novo) as (keyof OsCampos)[]).some((k) => (c as any)[k] !== (novo as any)[k]);
    return mudou ? novo : null;
}

function resumoItensPacote(p: PacoteOpcao): string {
    return p.itens.map((i) => `${i.rotulo}${i.tipo ? ` (${i.tipo})` : ""}${i.quantidade > 1 ? ` ×${i.quantidade}` : ""}`).join(" · ");
}

/**
 * Campo "Convênio" do registro, ligado ao cadastro de Convênios: escolhe o convênio, o pacote e (Prefeitura)
 * responde se a Prefeitura autorizou o pacote. O <select id="wizard-convenio"> continua guardando o NOME do convênio,
 * que é o que o atendimento já gravava.
 */
export function ConvenioVinculo({
    valorTexto,
    valores,
    onChange,
    onTexto,
    obrigatorio,
    disabled,
    nomesAntigos,
}: {
    valorTexto: string;
    valores: OsCampos;
    onChange: (parcial: Partial<OsCampos>) => void;
    onTexto: (nome: string) => void;
    obrigatorio?: boolean;
    disabled?: boolean;
    /** Lista antiga (fixa) usada se o cadastro não puder ser carregado. */
    nomesAntigos: readonly string[];
}) {
    const { convenios, carregando, erro } = useOpcoesConvenio();
    const conv = acharConvenio(convenios, Number(valores.convenio_id) || 0, valorTexto);
    const usaCadastro = convenios.length > 0;
    const pacote = conv ? pacoteInicial(conv, valores.pacote_id) : null;
    const ehPref = conv?.tipo === "PREFEITURA";

    const escolher = (nome: string) => {
        onTexto(nome);
        const c = convenios.find((x) => x.nome === nome) ?? null;
        const pac = c ? pacoteInicial(c) : null;
        onChange({
            convenio_id: c ? String(c.id) : "",
            convenio_tipo: c ? c.tipo : "",
            convenio_os: c && c.tipo === "ASSOCIADO" ? c.codigo : "",
            pacote_id: pac ? String(pac.id) : "",
            pacote_autorizado_prefeitura: "",
            pacote_coroa: c?.tem_pacote_coroa ? "1" : "",
            coroa_autorizada_prefeitura: "",
        });
    };

    const opcoes = usaCadastro ? convenios.map((c) => c.nome) : nomesAntigos.filter(Boolean);
    const forasDoCadastro = valorTexto && !opcoes.some((o) => norm(o) === norm(valorTexto));

    return (
        <div data-os-parte="convenio" className="flex flex-col gap-3">
            <label className="block">
                <span className={ROTULO_CAMPO}>
                    Convênio{obrigatorio ? <span className="text-[#B42318] dark:text-[#FF9C92]"> *</span> : null}
                </span>
                <select id="wizard-convenio" className={CAMPO_V2} disabled={disabled || carregando} value={conv?.nome ?? valorTexto ?? ""} onChange={(e) => escolher(e.target.value)}>
                    <option value="">{carregando ? "Carregando convênios…" : "Selecione"}</option>
                    {forasDoCadastro ? <option value={valorTexto}>{valorTexto} (fora do cadastro)</option> : null}
                    {opcoes.map((n) => (
                        <option key={n} value={n}>
                            {n}
                        </option>
                    ))}
                </select>
            </label>

            {erro ? (
                <p className="rounded-xl border border-[#F2CB3F] bg-[#FCF3CC] px-3 py-2 text-xs font-semibold text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white">
                    Não foi possível carregar os convênios cadastrados ({erro}). Usando a lista antiga; o vínculo com o pacote fica indisponível até corrigir.
                </p>
            ) : null}
            {!erro && !carregando && valorTexto && !conv && usaCadastro ? (
                <p className="rounded-xl border border-[#F2CB3F] bg-[#FCF3CC] px-3 py-2 text-xs font-semibold text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white">
                    Este convênio não está no cadastro de Convênios. Escolha um da lista para vincular o pacote e gerar a OS corretamente.
                </p>
            ) : null}

            {conv && conv.tipo === "" ? (
                <p className="rounded-xl border border-[#F2CB3F] bg-[#FCF3CC] px-3 py-2 text-xs font-semibold text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white">
                    O tipo da OS deste convênio (Particular, Associado ou Prefeitura) ainda não foi definido em Convênios.
                </p>
            ) : null}

            {conv && (conv.tipo === "ASSOCIADO" || conv.tipo === "PREFEITURA") ? (
                conv.pacotes.length === 0 ? (
                    <p className="rounded-xl border border-[#F2CB3F] bg-[#FCF3CC] px-3 py-2 text-xs font-semibold text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white">
                        Este convênio ainda não tem pacote ativo em Convênios. Sem pacote, todos os itens vão para a diferença da família.
                    </p>
                ) : (
                    <div className={`p-4 ${CARTAO_LINHA}`}>
                        <div className="text-[15px] font-bold text-[#313C55] dark:text-white">
                            Pacote de atendimento <span className="text-[#B42318] dark:text-[#FF9C92]">*</span>
                        </div>
                        <div role="radiogroup" aria-label="Pacote de atendimento" className="mt-3 flex flex-wrap gap-2">
                            {conv.pacotes.map((p) => {
                                const marcado = pacote?.id === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={marcado}
                                        disabled={disabled}
                                        onClick={() => onChange({ pacote_id: String(p.id) })}
                                        className={[
                                            "min-h-11 rounded-full border-[1.5px] px-[18px] text-sm font-extrabold transition-colors disabled:opacity-60",
                                            marcado
                                                ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99] dark:text-white"
                                                : "border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/25 dark:bg-transparent dark:text-white dark:hover:bg-white/10",
                                        ].join(" ")}
                                    >
                                        {p.nome}
                                        {p.padrao && conv.pacotes.length > 1 ? " · padrão" : ""}
                                    </button>
                                );
                            })}
                        </div>
                        {pacote ? <p className="mt-2.5 text-xs leading-relaxed text-[#5B6478] dark:text-[#AEB9CF]">Inclui: {resumoItensPacote(pacote) || "—"}</p> : null}
                    </div>
                )
            ) : null}

            {ehPref && conv && conv.pacotes.length > 0 ? (
                <LinhaSimNao
                    rotulo="A Prefeitura autorizou o pacote de atendimento? *"
                    valor={valores.pacote_autorizado_prefeitura}
                    onChange={(v) => onChange({ pacote_autorizado_prefeitura: v })}
                    disabled={disabled}
                >
                    <p className="mt-1.5 px-1 text-xs font-semibold text-[#5B6478] dark:text-[#AEB9CF]">
                        {valores.pacote_autorizado_prefeitura === "Sim"
                            ? "Os itens do pacote entram na OS da Prefeitura; o que passar do pacote vai para a diferença da família."
                            : valores.pacote_autorizado_prefeitura === "Não"
                                ? "Sem a autorização, o pacote não cobre nada: toda a OS fica com a família, pelo preço particular." + (conv.tem_pacote_coroa ? " A coroa segue a pergunta própria." : "")
                                : "Obrigatório: define como a OS é dividida entre a Prefeitura e a família."}
                    </p>
                </LinhaSimNao>
            ) : null}
        </div>
    );
}

/* ---------------------------------------------------------------- rascunho do registro → prévia */

export type RascunhoOS = Record<string, any>;
export const RascunhoOSContext = React.createContext<RascunhoOS | null>(null);

type EstadosSimNao = {
    urnaUso: string; roupaUso: string; veu: string; cordao: string; invol: string; kitLanche: string;
    assistencia: string; tanato: string; ornamentacao: string; coroaFlores: string; realizaVelorio: string; realizaSepultamento: string;
};

/** Monta o rascunho enviado à prévia a partir do que está na tela agora (nada vem do banco). */
export function montarRascunhoOS(wizardData: Record<string, any>, os: OsCampos, s: EstadosSimNao): RascunhoOS {
    const wd = wizardData || {};
    const id = (v: unknown) => Number(v ?? 0) || 0;
    const sim = (v: string) => (String(v).trim().toLowerCase() === "sim" ? "Sim" : "Não");
    const coroas = String(s.coroaFlores).toLowerCase() === "sim" && Array.isArray(wd.coroas_itens)
        ? wd.coroas_itens.map((c: any) => ({ tipo: String(c?.tipo_coroa ?? ""), produto_id: id(c?.produto_id) })).filter((c: any) => c.tipo || c.produto_id)
        : [];
    const roupaPropria = id(wd.roupa_propria) === 1 || /pr[óo]pri/i.test(String(wd.roupa ?? ""));
    return {
        convenio_id: id(os.convenio_id),
        pacote_id: id(os.pacote_id),
        pacote_autorizado_prefeitura: os.pacote_autorizado_prefeitura,
        urna_produto_id: s.urnaUso === "Sim" ? id(wd.urna_produto_id) : 0,
        roupa_propria: s.roupaUso === "Sim" && roupaPropria ? 1 : 0,
        roupa_produto_id: s.roupaUso === "Sim" && !roupaPropria ? id(wd.roupa_produto_id) : 0,
        veu: sim(s.veu), veu_produto_id: id(wd.veu_produto_id),
        cordao: sim(s.cordao), cordao_produto_id: id(wd.cordao_produto_id),
        invol: sim(s.invol), invol_produto_id: id(wd.invol_produto_id),
        coroas,
        assistencia: sim(s.assistencia), kit_lanche: sim(s.kitLanche),
        ornamentacao: sim(s.ornamentacao), ornamentacao_tipo: String(wd.ornamentacao_tipo ?? ""),
        tanato: sim(s.tanato), tanato_produto_id: id(os.tanato_produto_id),
        tanato_autorizado_prefeitura: os.tanato_autorizado_prefeitura,
        reconstituicao_facial: os.reconstituicao_facial || "Não",
        translado: os.translado || "Não", translado_km: os.translado_km,
        translado_autorizado_prefeitura: os.translado_autorizado_prefeitura,
        coroa_autorizada_prefeitura: os.coroa_autorizada_prefeitura,
        realiza_velorio: sim(s.realizaVelorio), realiza_sepultamento: sim(s.realizaSepultamento),
        // Sala do Memorial (produto na OS): só com velório = Sim.
        sala_velorio: sim(s.realizaVelorio) === "Sim" ? String(wd.sala_velorio ?? "").trim() : "",
    };
}

function rascunhoTemConteudo(r: RascunhoOS | null): boolean {
    if (!r) return false;
    if (Number(r.convenio_id) > 0) return true;
    return !!(r.urna_produto_id || r.roupa_produto_id || r.roupa_propria || r.veu === "Sim" || r.cordao === "Sim" || r.invol === "Sim" ||
        (r.coroas && r.coroas.length) || r.assistencia === "Sim" || r.kit_lanche === "Sim" || r.ornamentacao === "Sim" || r.tanato === "Sim" || r.translado === "Sim" || !!r.sala_velorio);
}

type LinhaPrevia = { chave: string; rotulo: string; nome: string; qtd: number; destino: "CONVENIO" | "FAMILIA" | "SEM_COBRANCA"; motivo: string; valor: number | null; valor_oculto: boolean; valor_pendente: boolean };

/**
 * Cálculo da OS com o que está na tela agora (os_principal.php?previa_os_atendimento; nada é gravado).
 * Alimenta o "Resumo da OS": os valores mudam conforme os itens, o pacote e a autorização são marcados.
 * A OS só é gravada (e o resumo passa a bater com a OS salva) quando o registro é salvo.
 */
export function usePreviaOS(ativo = true) {
    const rascunho = React.useContext(RascunhoOSContext);
    const [s, setS] = useState<{ carregando: boolean; erro: string; d: any | null }>({ carregando: false, erro: "", d: null });
    const temBase = rascunhoTemConteudo(rascunho);
    const chave = JSON.stringify(rascunho ?? null);

    useEffect(() => {
        if (!ativo || !rascunho || !temBase) {
            setS({ carregando: false, erro: "", d: null });
            return;
        }
        const ctl = new AbortController();
        const h = window.setTimeout(async () => {
            setS((x) => ({ ...x, carregando: true }));
            try {
                const d = await previaChamar("previa", rascunho, ctl.signal);
                setS({ carregando: false, erro: "", d });
            } catch (e: any) {
                if (ctl.signal.aborted) return;
                setS({ carregando: false, erro: e?.message || "Cálculo da OS indisponível.", d: null });
            }
        }, 450);
        return () => {
            window.clearTimeout(h);
            ctl.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chave, temBase, ativo]);

    return { ...s, temBase };
}

export type ParteOS = "tudo" | "procedimento" | "translado" | "resumo" | "coroa" | "lateral";

/**
 * Seção da OS no "Editar registro". Pode ser desenhada em partes, cada uma no seu lugar do assistente:
 *  - "procedimento": Tipo de procedimento (logo depois de Tanatopraxia, quando Sim) + Reconstituição facial (Sim/Não);
 *  - "translado": item Translado (entre Invol e Velório);
 *  - "resumo": plano do associado e aviso de colunas faltando (no fim do formulário);
 *  - "lateral": Resumo da OS (Prefeitura e família) e o botão "Ver OS", na coluna fixa ao lado, abaixo dos Documentos;
 *  - "coroa": "A Prefeitura autorizou a coroa?" (logo abaixo da Coroa de flores; só Prefeitura com pacote de coroa);
 *  - "tudo" (padrão): procedimento, translado e resumo em sequência.
 */
export function SecaoOSAtendimento({
    convenio,
    tanato,
    valores,
    onChange,
    colunasFaltando = [],
    atendimentoId,
    versao = 0,
    disabled,
    parte = "tudo",
    coroaFlores = "",
    onAtualizarOS,
    atualizando = false,
}: {
    convenio: string;
    tanato: string;
    coroaFlores?: string;
    valores: OsCampos;
    onChange: (parcial: Partial<OsCampos>) => void;
    colunasFaltando?: string[];
    atendimentoId?: number | string | null;
    versao?: number;
    disabled?: boolean;
    parte?: ParteOS;
    /** "Atualizar OS": grava o registro sem fechar a tela e refaz as OS (a folha passa a mostrar o que está na tela). */
    onAtualizarOS?: () => Promise<void> | void;
    atualizando?: boolean;
}) {
    const tipo = tipoConvenio(convenio, valores.convenio_tipo);
    const tanatoSim = String(tanato).trim().toLowerCase() === "sim";
    const plano = valores.convenio_os.startsWith("ASSOCIADO_") ? valores.convenio_os.slice(10) : "";
    // Convênio do cadastro já traz o plano (código da OS): a escolha manual do plano só vale para registros antigos.
    const planoDoCadastro = !!valores.convenio_id && valores.convenio_os.startsWith("ASSOCIADO_");
    const mostraProc = parte === "tudo" || parte === "procedimento";
    const mostraTransl = parte === "tudo" || parte === "translado";
    const mostraDados = parte === "tudo" || parte === "resumo";
    /** Resumo da OS e "Ver OS" (coluna lateral). */
    const mostraResumo = parte === "tudo" || parte === "lateral";
    const negado = pacoteNegado(valores);

    const [modelos, setModelos] = useState<{ produto_id: number; nome: string }[]>([]);
    const [modelosErro, setModelosErro] = useState("");
    const [resumo, setResumo] = useState<OsResumo | null>(null);
    const [resumoErro, setResumoErro] = useState("");
    /** Recarrega o resumo quando a janela "Ver OS" avisa que ajustou valores ou colheu assinatura. */
    const [recarga, setRecarga] = useState(0);
    /** Ajustes já gravados na OS da família (acréscimos − descontos): somados ao valor calculado com a tela. */
    const [ajusteFamilia, setAjusteFamilia] = useState(0);

    useEffect(() => {
        if (!mostraProc || !tanatoSim || modelos.length) return;
        let vivo = true;
        listarModelosTanato()
            .then((m) => vivo && (setModelos(m), setModelosErro("")))
            .catch((e) => vivo && setModelosErro(e?.message || "Não foi possível carregar os modelos."));
        return () => {
            vivo = false;
        };
    }, [mostraProc, tanatoSim, modelos.length]);

    const carregarResumo = useCallback(async () => {
        if (!mostraResumo) return;
        if (atendimentoId == null || atendimentoId === "") return;
        try {
            setResumo(await lerOSDoAtendimento(atendimentoId));
            setResumoErro("");
        } catch (e: any) {
            setResumoErro(e?.message || "Não foi possível carregar a OS.");
        }
    }, [atendimentoId, mostraResumo]);

    useEffect(() => {
        void carregarResumo();
    }, [carregarResumo, versao, recarga]);

    /** "Ver OS": as folhas das OS do atendimento por cima desta tela, com ajuste de valores, conclusão da venda e assinatura. */
    const [verOS, setVerOS] = useState(false);
    const abrirJanelaOS = () => {
        if (atendimentoId == null || atendimentoId === "") return;
        setVerOS(true);
    };
    useEffect(() => {
        if (!mostraResumo) return;
        const ouvir = (e: MessageEvent) => {
            if (e.origin === window.location.origin && e.data?.pai === "os-atualizada" && String(e.data?.atendimento_id) === String(atendimentoId)) {
                setRecarga((n) => n + 1);
            }
        };
        window.addEventListener("message", ouvir);
        return () => window.removeEventListener("message", ouvir);
    }, [mostraResumo, atendimentoId]);

    const os = [resumo?.os_convenio, resumo?.os_particular].filter(Boolean) as any[];
    const ehPref = tipo === "prefeitura";
    const osPartId = resumo?.os_particular?.id ?? null;

    const calcularAjuste = useCallback((dd: { itens: any[]; resumo: any } | null) => {
        if (!dd) return setAjusteFamilia(0);
        const tabela = dd.itens.filter((i) => !i.referencia_apenas).reduce((s, i) => s + Number(i.valor_tabela_unitario) * Number(i.quantidade), 0);
        setAjusteFamilia(Math.round((Number(dd.resumo.bruto) - tabela - Number(dd.resumo.reducao)) * 100) / 100);
    }, []);
    useEffect(() => {
        if (!mostraResumo || !osPartId) return setAjusteFamilia(0);
        let vivo = true;
        carregarItensOS(osPartId)
            .then((dd) => vivo && calcularAjuste(dd))
            .catch(() => vivo && setAjusteFamilia(0));
        return () => {
            vivo = false;
        };
    }, [mostraResumo, osPartId, versao, recarga, calcularAjuste]);
    const opcoes = modelosProcedimento(modelos);

    /* Resumo da OS: valores do cálculo com a tela atual; sem cálculo, os valores da OS salva. */
    const previa = usePreviaOS(mostraResumo);
    const dp = previa.d;
    const linhasPrevia: LinhaPrevia[] = dp?.linhas ?? [];
    const temConvenioAgora = dp ? linhasPrevia.some((l) => l.destino === "CONVENIO") : !!resumo?.os_convenio;
    const prefAgora = dp ? dp.convenio?.tipo === "PREFEITURA" : ehPref;
    const familiaAgora: number | null = dp ? Math.max(0, Number(dp.totais?.familia ?? 0) + (osPartId ? ajusteFamilia : 0)) : null;
    const pendFamilia = Number(dp?.totais?.familia_valores_pendentes ?? 0);
    const salvoFamilia: number | null = resumo?.os_particular ? Number(resumo.os_particular.valor_total) || 0 : null;
    const temFamiliaAgora = dp ? linhasPrevia.some((l) => l.destino === "FAMILIA") : salvoFamilia != null;
    const familiaMostrar: number | null = temFamiliaAgora ? (familiaAgora ?? salvoFamilia) : null;
    const familiaDiverge = familiaAgora != null && salvoFamilia != null && Math.abs(familiaAgora - salvoFamilia) > 0.005;
    const pendenteDeSalvar =
        !!dp &&
        (familiaDiverge ||
            (temFamiliaAgora && !resumo?.os_particular) ||
            (temConvenioAgora && !resumo?.os_convenio) ||
            (!temConvenioAgora && !!resumo?.os_convenio));

    return (
        <>
            {/* ---------------- TIPO DE PROCEDIMENTO + RECONSTITUIÇÃO FACIAL ---------------- */}
            {mostraProc && tanatoSim ? (
                <div data-os-parte="procedimento" className="flex flex-col gap-3">
                    <div className={`p-4 ${CARTAO_LINHA}`}>
                        <div className="text-[15px] font-bold text-[#313C55] dark:text-white">
                            Tipo de procedimento <span className="text-[#B42318] dark:text-[#FF9C92]">*</span>
                        </div>
                        <div role="radiogroup" aria-label="Tipo de procedimento" className="mt-3 flex flex-wrap gap-2">
                            {opcoes.map((m) => {
                                const marcado = valores.tanato_produto_id === String(m.produto_id);
                                return (
                                    <button
                                        key={m.produto_id}
                                        type="button"
                                        role="radio"
                                        aria-checked={marcado}
                                        disabled={disabled}
                                        onClick={() => onChange({ tanato_produto_id: String(m.produto_id) })}
                                        className={[
                                            "min-h-11 rounded-full border-[1.5px] px-[18px] text-sm font-extrabold transition-colors disabled:opacity-60",
                                            marcado
                                                ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99] dark:text-white"
                                                : "border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/25 dark:bg-transparent dark:text-white dark:hover:bg-white/10",
                                        ].join(" ")}
                                    >
                                        {rotuloProcedimento(m.nome)}
                                    </button>
                                );
                            })}
                            {opcoes.length === 0 && !modelosErro ? <span className="py-2 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Carregando as opções…</span> : null}
                        </div>
                        {modelosErro ? <p className="mt-2 text-xs font-bold text-[#B42318] dark:text-[#FF9C92]">{modelosErro}</p> : null}
                        {ehPref && !negado ? (
                            <Autorizacao servico="tanatopraxia" valor={valores.tanato_autorizado_prefeitura} onChange={(v) => onChange({ tanato_autorizado_prefeitura: v })} disabled={disabled} />
                        ) : null}
                    </div>

                    <LinhaSimNao rotulo="Reconstituição facial" valor={valores.reconstituicao_facial} onChange={(v) => onChange({ reconstituicao_facial: v })} disabled={disabled}>
                        {valores.reconstituicao_facial === "Sim" ? (
                            <p className="mt-1.5 px-1 text-xs font-semibold text-[#5B6478] dark:text-[#AEB9CF]">Serviço adicional: entra na OS junto com o procedimento.</p>
                        ) : null}
                    </LinhaSimNao>
                </div>
            ) : null}

            {/* ---------------- COROA DA PREFEITURA (pacote de produto; vale mesmo sem o pacote de atendimento) ---------------- */}
            {parte === "coroa" && perguntaCoroa(convenio, coroaFlores, valores) ? (
                <div data-os-parte="coroa">
                    <Autorizacao servico="coroa" valor={valores.coroa_autorizada_prefeitura} onChange={(v) => onChange({ coroa_autorizada_prefeitura: v })} disabled={disabled} />
                </div>
            ) : null}

            {/* ---------------- TRANSLADO (item, entre Invol e Velório) ---------------- */}
            {mostraTransl ? (
                <div data-os-parte="translado">
                    <LinhaSimNao rotulo="Translado" valor={valores.translado} onChange={(v) => onChange({ translado: v })} disabled={disabled}>
                        {valores.translado === "Sim" ? (
                            <div className="mt-2 rounded-[14px] border border-[#E3E8F0] bg-[#F6F8FB] p-4 dark:border-white/[0.12] dark:bg-[#1C2334]">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_160px]">
                                    <label className="block">
                                        <span className={ROTULO_CAMPO}>Partida *</span>
                                        <input className={CAMPO_V2} disabled={disabled} value={valores.translado_origem} onChange={(e) => onChange({ translado_origem: e.target.value })} maxLength={100} placeholder="Local de partida" />
                                    </label>
                                    <label className="block">
                                        <span className={ROTULO_CAMPO}>Destino *</span>
                                        <input className={CAMPO_V2} disabled={disabled} value={valores.translado_destino} onChange={(e) => onChange({ translado_destino: e.target.value })} maxLength={100} placeholder="Local de destino" />
                                    </label>
                                    <label className="block">
                                        <span className={ROTULO_CAMPO}>Distância (km) *</span>
                                        <input
                                            className={CAMPO_V2}
                                            disabled={disabled}
                                            inputMode="decimal"
                                            value={valores.translado_km}
                                            placeholder="0"
                                            onChange={(e) => onChange({ translado_km: e.target.value.replace(/[^\d,.]/g, "") })}
                                        />
                                    </label>
                                </div>
                                {ehPref && !negado ? (
                                    <Autorizacao servico="translado" valor={valores.translado_autorizado_prefeitura} onChange={(v) => onChange({ translado_autorizado_prefeitura: v })} disabled={disabled} />
                                ) : null}
                            </div>
                        ) : null}
                    </LinhaSimNao>
                </div>
            ) : null}

            {/* ---------------- PLANO DO ASSOCIADO + AVISO DE COLUNAS (fim do formulário) ---------------- */}
            {mostraDados && (tipo === "associado" || colunasFaltando.length > 0) ? (
                <section aria-label="Dados da OS" className="mt-5 rounded-2xl border border-[#E3E8F0] bg-[#F6F8FB] p-3 dark:border-white/[0.12] dark:bg-[#1C2334] sm:p-4">
                    {(tipo === "associado" && !planoDoCadastro) || colunasFaltando.length ? (
                        <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:text-[#AEB9CF]">Dados da OS</h3>
                    ) : null}

                    {colunasFaltando.length ? (
                        <div role="alert" className="mt-3 rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-sm font-semibold text-[#B42318] dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                            Faltam colunas da OS no banco ({colunasFaltando.join(", ")}). Enquanto isso, o pacote, a autorização da Prefeitura e a OS não são gravados ao salvar.
                            Rode o <b>alteracoes_atendimento_sugeridas.sql</b> no banco.
                        </div>
                    ) : null}

                    {tipo === "associado" ? (
                        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {planoDoCadastro ? null : (
                                <label className="block">
                                    <span className={ROTULO_CAMPO}>Plano do associado *</span>
                                    <select className={CAMPO_V2} disabled={disabled} value={plano} onChange={(e) => onChange({ convenio_os: e.target.value ? `ASSOCIADO_${e.target.value}` : "" })}>
                                        <option value="">Selecione</option>
                                        {PLANOS.map((p) => (
                                            <option key={p} value={p}>
                                                {p}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            <label className="block">
                                <span className={ROTULO_CAMPO}>Contrato do titular</span>
                                <input className={CAMPO_V2} disabled={disabled} value={valores.contrato_numero} onChange={(e) => onChange({ contrato_numero: e.target.value })} placeholder="Número do contrato" maxLength={40} />
                            </label>
                        </div>
                    ) : null}

                </section>
            ) : null}

            {/* ---------------- RESUMO DA OS + VER OS (coluna lateral, abaixo dos Documentos) ---------------- */}
            {mostraResumo && ((atendimentoId != null && atendimentoId !== "") || previa.temBase) ? (
                <section aria-label="Resumo da OS" className="rounded-[18px] border border-[#E3E8F0] bg-white px-4 py-3 dark:border-white/[0.12] dark:bg-[#232B3F]">
                    {/* RESUMO DA OS: valores calculados com o que está na tela; a OS é gravada ao salvar o registro */}
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="flex-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:text-[#AEB9CF]">Resumo da OS</h3>
                            {previa.carregando ? (
                                <span className="text-[11px] font-bold text-[#5B6478] dark:text-[#AEB9CF]">atualizando…</span>
                            ) : pendenteDeSalvar ? (
                                <span className="rounded-full bg-[#FCF3CC] px-2.5 py-0.5 text-[11px] font-extrabold text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white">alterado · grava ao salvar</span>
                            ) : os.length ? (
                                <span className="rounded-full bg-[#EEF5D6] px-2.5 py-0.5 text-[11px] font-extrabold text-[#313C55] dark:bg-[#B3CE52]/20 dark:text-white">OS salva e em dia</span>
                            ) : null}
                        </div>

                        {resumoErro ? (
                            <p className="mt-2 rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-sm font-semibold text-[#B42318] dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">OS: {resumoErro}</p>
                        ) : null}
                        {previa.erro ? (
                            <p className="mt-2 text-xs font-semibold text-[#5B6478] dark:text-[#AEB9CF]">Não foi possível recalcular agora ({previa.erro}). Mostrando a OS salva.</p>
                        ) : null}

                        {!temConvenioAgora && familiaAgora == null && os.length === 0 ? (
                            <p className="mt-2 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Escolha o convênio e os itens: os valores da OS aparecem aqui.</p>
                        ) : (
                            <div className="mt-2 grid grid-cols-1 gap-1.5">
                                {temConvenioAgora ? (
                                    <CartaoResumo
                                        rotulo={prefAgora ? "Faturar à Prefeitura" : "Coberto pelo plano"}
                                        os={resumo?.os_convenio ?? { numero_os: "Nova OS ao salvar" }}
                                        tom={prefAgora ? "azul" : "verde"}
                                        valor={prefAgora ? undefined : brl(0)}
                                        texto={prefAgora ? "O valor do contrato fica no financeiro." : "Total a pagar pela família."}
                                    />
                                ) : null}
                                {familiaMostrar != null ? (
                                    <CartaoResumo
                                        rotulo={temConvenioAgora ? "Diferença da família" : "Total da família"}
                                        os={resumo?.os_particular ?? { numero_os: "Nova OS ao salvar" }}
                                        tom="amarelo"
                                        valor={brl(familiaMostrar)}
                                        texto={
                                            (pendFamilia > 0 ? `+ ${pendFamilia} ${pendFamilia === 1 ? "item" : "itens"} com valor definido ao salvar. ` : "") +
                                            (familiaDiverge && salvoFamilia != null
                                                ? `OS salva: ${brl(salvoFamilia)} — salve o registro para atualizar.`
                                                : "Confira e colha a assinatura em Ver OS.")
                                        }
                                    />
                                ) : null}
                            </div>
                        )}
                    </div>
                    {os.length || onAtualizarOS ? (
                        <div className={`mt-2 grid gap-2 ${os.length && onAtualizarOS ? "grid-cols-2" : "grid-cols-1"}`}>
                            {onAtualizarOS ? (
                                <button
                                    type="button"
                                    disabled={atualizando || disabled}
                                    onClick={() => void onAtualizarOS()}
                                    title="Grava o registro sem fechar a tela e atualiza a folha da OS"
                                    className={[
                                        "flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-extrabold disabled:opacity-60",
                                        pendenteDeSalvar
                                            ? "bg-[#F2CB3F] text-[#313C55] hover:bg-[#E4BC30]"
                                            : "border-[1.5px] border-[#313C55] text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/40 dark:text-white dark:hover:bg-white/10",
                                    ].join(" ")}
                                >
                                    <svg viewBox="0 0 24 24" className={`size-4 ${atualizando ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" />
                                    </svg>
                                    {atualizando ? "Atualizando…" : "Atualizar OS"}
                                </button>
                            ) : null}
                            {os.length ? (
                                <button
                                    type="button"
                                    onClick={() => abrirJanelaOS()}
                                    className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-[#313C55] text-sm font-extrabold text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/40 dark:text-white dark:hover:bg-white/10"
                                >
                                    {/* Conclusão da venda (09/10/2026): aberta → concluir; concluída sem assinatura → assinar */}
                                    {os.some((o) => o?.status === "ABERTA")
                                        ? "Ver OS e concluir"
                                        : os.some((o) => o?.status === "FECHADA" && !o?.assinada_em)
                                            ? "Ver OS e assinar"
                                            : "Ver OS"}
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                    {verOS && atendimentoId != null && atendimentoId !== "" ? (
                        <OSDoAtendimento sobreposto atendimentoId={atendimentoId} onFechar={() => setVerOS(false)} onMudou={() => setRecarga((n) => n + 1)} />
                    ) : null}
                </section>
            ) : null}
        </>
    );
}
