"use client";

/**
 * Peças para a tela de DESENVOLVIMENTO DO ATENDIMENTO (já existente). Não é uma tela nova.
 *
 * 1) <AutorizacaoPrefeitura>: logo abaixo do Sim/Não de "Tanatopraxia" e de "Translado", só quando o convênio do atendimento
 *    é Prefeitura e a etapa está "Sim". Grava nos campos novos do atendimento (alteracoes_atendimento_sugeridas.sql):
 *      tanato_autorizado_prefeitura / translado_autorizado_prefeitura  ("Sim" | "Não")
 *    No translado, use <TrajetoTranslado> para translado_origem, translado_destino e translado_km.
 *
 * 2) Depois de salvar cada etapa, chame sincronizarOSAtendimento(atendimentoId). A OS (Prt, Soc + Dif.Soc ou Prf + Dif.Prf)
 *    é montada/atualizada sozinha. <ResumoOSAtendimento> mostra o resultado (faturar à Prefeitura / coberto pelo plano /
 *    a pagar pela família) — opcional, no rodapé da etapa.
 *
 * Exemplo:
 *   {ehPrefeitura && form.tanato === "Sim" && (
 *     <AutorizacaoPrefeitura servico="tanatopraxia" valor={form.tanato_autorizado_prefeitura}
 *                            onChange={(v) => setForm({ ...form, tanato_autorizado_prefeitura: v })} />
 *   )}
 *   ...ao salvar:  await salvarEtapa(); await sincronizarOSAtendimento(atendimento.id); setResumoVersao((n) => n + 1);
 *   <ResumoOSAtendimento atendimentoId={atendimento.id} versao={resumoVersao} />
 */

import React, { useEffect, useState } from "react";

const API_BASE = "https://api.planoassistencialintegrado.com.br";
const OS_API = `${API_BASE}/os_principal.php`;
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

type SimNao = "" | "Sim" | "Não";

async function apiJson(url: string, init?: RequestInit) {
    const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
    const json = await res.json().catch(() => null);
    if (res.status === 401 || json?.need_login) {
        window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }
    if (!res.ok || json?.erro) throw new Error(json?.msg || `Falha na requisição (${res.status}).`);
    return json;
}

const brl = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Monta/atualiza as OS a partir das etapas salvas do atendimento. Refaz só o que mudou (valor editado e desconto ficam). */
export async function sincronizarOSAtendimento(atendimentoId: number) {
    const body = new URLSearchParams({ sincronizar_os_atendimento: "1", atendimento_id: String(atendimentoId) });
    const r = await apiJson(OS_API, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    return r.dados; // { convenio, alteracoes[], os_convenio, os_particular }
}

function SimNaoBotoes({ valor, onChange, disabled }: { valor: SimNao; onChange: (v: SimNao) => void; disabled?: boolean }) {
    return (
        <span className="inline-flex overflow-hidden rounded-lg text-sm font-extrabold">
            {(["Sim", "Não"] as const).map((v) => (
                <button key={v} type="button" disabled={disabled} onClick={() => onChange(v)}
                        className={`px-4 py-1.5 ${valor === v ? "bg-[#313C55] text-white" : "border border-[#E1E5EC] bg-white text-[#6B7488]"}`}>{v}</button>
            ))}
        </span>
    );
}

/** Caixa "A Prefeitura autorizou?" — aparece quando a etapa é Sim num atendimento de Prefeitura. */
export function AutorizacaoPrefeitura({ servico, valor, onChange, precoContrato, disabled }: {
    servico: "tanatopraxia" | "translado"; valor: SimNao; onChange: (v: SimNao) => void; precoContrato?: string; disabled?: boolean;
}) {
    return (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-[#F2CB3F] bg-[#FFF8E1] px-4 py-2.5 text-[#313C55]">
            <div className="flex-1 font-extrabold">A Prefeitura autorizou {servico === "translado" ? "o translado" : "a tanatopraxia"}?</div>
            <SimNaoBotoes valor={valor} onChange={onChange} disabled={disabled} />
            {valor === "Sim" && precoContrato && <span className="rounded-full bg-[#E6F0C9] px-3 py-1 text-xs font-extrabold">contrato: {precoContrato}</span>}
            {valor === "Não" && <span className="rounded-full bg-[#FDECD8] px-3 py-1 text-xs font-extrabold">vai para a diferença (preço de tabela)</span>}
            {valor === "" && <span className="text-xs font-bold text-[#B03A2E]">obrigatório</span>}
        </div>
    );
}

/** Partida, destino e distância total do translado. */
export function TrajetoTranslado({ origem, destino, km, onChange, disabled }: {
    origem: string; destino: string; km: string; disabled?: boolean;
    onChange: (v: { translado_origem: string; translado_destino: string; translado_km: string }) => void;
}) {
    const cls = "rounded-lg border border-[#E1E5EC] bg-white px-3 py-2 text-sm font-bold text-[#313C55] outline-none focus:border-[#00AEEC]";
    const v = { translado_origem: origem, translado_destino: destino, translado_km: km };
    return (
        <div className="mt-2 flex flex-wrap items-center gap-2">
            <input className={`${cls} w-40`} disabled={disabled} placeholder="Partida" value={origem} onChange={(e) => onChange({ ...v, translado_origem: e.target.value })} />
            <span className="font-bold text-[#6B7488]">→</span>
            <input className={`${cls} w-40`} disabled={disabled} placeholder="Destino" value={destino} onChange={(e) => onChange({ ...v, translado_destino: e.target.value })} />
            <input className={`${cls} w-28`} disabled={disabled} inputMode="decimal" placeholder="km" value={km} onChange={(e) => onChange({ ...v, translado_km: e.target.value.replace(/[^\d,.]/g, "") })} />
            <span className="text-xs text-[#6B7488]">distância total percorrida</span>
        </div>
    );
}

/** Resumo da OS montada para o atendimento (rodapé da etapa). Recarrega quando "versao" muda. */
export function ResumoOSAtendimento({ atendimentoId, versao = 0 }: { atendimentoId: number; versao?: number }) {
    const [d, setD] = useState<any>(null);
    const [erro, setErro] = useState("");

    useEffect(() => {
        let vivo = true;
        sincronizarOSAtendimento(atendimentoId)
            .then((r) => vivo && (setD(r), setErro("")))
            .catch((e) => vivo && setErro(e?.message || "Não foi possível montar a OS."));
        return () => { vivo = false; };
    }, [atendimentoId, versao]);

    if (erro) return <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">OS: {erro}</div>;
    if (!d) return null;
    const conv = d.os_convenio;
    const fam = d.os_particular;
    const ehPref = String(d.convenio || "").startsWith("PREFEITURA");
    return (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
            {conv && (
                <div className="rounded-xl p-4" style={{ background: ehPref ? "#E0F3FA" : "#E6F0C9" }}>
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]">{ehPref ? "Faturar à Prefeitura" : "Coberto pelo plano"}</div>
                    <div className="text-xs font-bold">{conv.numero_os}</div>
                    <div className="mt-1 text-2xl font-extrabold text-[#313C55]">{ehPref ? brl(conv.valor_total) : "Total a pagar R$ 0,00"}</div>
                </div>
            )}
            {fam && (
                <div className="rounded-xl bg-[#FDECD8] p-4">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]">{conv ? "Diferença da família" : "Total da OS"}</div>
                    <div className="text-xs font-bold">{fam.numero_os}</div>
                    <div className="mt-1 text-2xl font-extrabold text-[#313C55]">{brl(fam.valor_total)}</div>
                    <div className="text-xs text-[#6B7488]">confirmar valores e colher a assinatura em Minhas OS</div>
                </div>
            )}
            {(d.alteracoes || []).length > 0 && <div className="text-xs text-[#6B7488] md:col-span-2">Atualizado: {d.alteracoes.join(" · ")}</div>}
        </div>
    );
}
