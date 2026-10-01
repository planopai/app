"use client";

import React, { useCallback, useEffect, useState } from "react";

const API_BASE = "https://api.planoassistencialintegrado.com.br";
const OS_API = `${API_BASE}/os_principal.php`;
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

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
const hoje = () => new Date().toLocaleDateString("sv-SE");
const inputCls = "w-full rounded-lg border border-[#E1E5EC] bg-white px-3 py-2 text-sm font-semibold text-[#313C55] outline-none focus:border-[#00AEEC]";
const TIPOS = [
    { v: "PRT,DIF_SOC,DIF_PRF,COR", r: "Todos (Particular, Dif e Coroa)" }, { v: "PRT", r: "Particular" },
    { v: "DIF_SOC", r: "Dif — Associado" }, { v: "DIF_PRF", r: "Dif — Prefeitura" }, { v: "COR", r: "Coroa" },
];
const ROTULO: Record<string, string> = { PRT: "Particular", DIF_SOC: "Dif — Associado", DIF_PRF: "Dif — Prefeitura", COR: "Coroa" };
const COR_TIPO: Record<string, string> = { PRT: "#313C55", DIF_SOC: "#F2CB3F", DIF_PRF: "#F2CB3F", COR: "#B98BCB" };

export default function RelatorioAtendimentosPage() {
    const [f, setF] = useState({ data_inicio: hoje().slice(0, 8) + "01", data_fim: hoje(), tipo: "PRT,DIF_SOC,DIF_PRF,COR", agente_id: "" });
    const [rel, setRel] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState("");

    const urlCom = (formato: string) => {
        const u = new URL(OS_API);
        u.searchParams.set("financeiro_relatorio", "1");
        Object.entries({ ...f, formato }).forEach(([k, v]) => v && u.searchParams.set(k, String(v)));
        return u.toString();
    };

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro("");
        try {
            const r = await apiJson(urlCom("json") + `&_=${Date.now()}`);
            setRel(r.dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível gerar o relatório.");
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [f]);
    useEffect(() => { void carregar(); }, [carregar]);

    const g = rel?.total_geral;
    return (
        <main className="min-h-screen bg-[#F4F6F9] p-6 text-[#313C55]">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="text-sm text-[#6B7488]">Financeiro › Relatórios · Particular, Dif e Coroa — valores de translado excluídos</div>
                    <h1 className="text-2xl font-extrabold">Relatório de atendimentos</h1>
                </div>
                <div className="flex gap-2">
                    <a href="/os/financeiro" className="rounded-lg border border-[#E1E5EC] bg-white px-4 py-2 text-sm font-bold">Voltar ao financeiro</a>
                    <a href={urlCom("csv")} className="rounded-lg border border-[#E1E5EC] bg-white px-4 py-2 text-sm font-bold">Planilha (Excel)</a>
                    <a href={urlCom("pdf")} target="_blank" rel="noreferrer" className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white">PDF</a>
                </div>
            </div>

            <div className="mb-4 grid gap-3 rounded-xl border border-[#E1E5EC] bg-white p-4 md:grid-cols-[160px_160px_1fr_auto] md:items-end">
                <label className="text-sm"><span className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]">De</span><input type="date" className={inputCls} value={f.data_inicio} onChange={(e) => setF({ ...f, data_inicio: e.target.value })} /></label>
                <label className="text-sm"><span className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]">Até</span><input type="date" className={inputCls} value={f.data_fim} onChange={(e) => setF({ ...f, data_fim: e.target.value })} /></label>
                <label className="text-sm"><span className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]">Tipo</span>
                    <select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{TIPOS.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}</select>
                </label>
                <button type="button" onClick={() => void carregar()} disabled={loading} className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{loading ? "Gerando…" : "Aplicar"}</button>
            </div>

            {erro && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}

            {rel && (
                <>
                    <div className="mb-4 flex flex-col gap-3 lg:flex-row">
                        {Object.entries(rel.totais_por_tipo || {}).map(([t, v]: any) => (
                            <div key={t} className="flex-1 rounded-xl border border-[#E1E5EC] bg-white p-4" style={{ borderTop: `4px solid ${COR_TIPO[t] || "#313C55"}` }}>
                                <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]">{ROTULO[t] || t}</div>
                                <div className="mt-1 whitespace-nowrap text-2xl font-extrabold">{brl(v.valor_sem_translado)}</div>
                                <div className="text-xs text-[#6B7488]">{v.quantidade} OS · sem translado</div>
                            </div>
                        ))}
                        <div className="flex-1 rounded-xl border border-[#E1E5EC] bg-white p-4" style={{ borderTop: "4px solid #C9CFD9" }}>
                            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]">Translado excluído</div>
                            <div className="mt-1 whitespace-nowrap text-2xl font-extrabold">{brl(g?.translado)}</div>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-[#E1E5EC] bg-white p-2">
                        <table className="w-full text-sm">
                            <thead><tr className="border-b border-[#E1E5EC] text-left text-[11px] uppercase tracking-wider text-[#6B7488]">
                                <th className="px-3 py-3">OS</th><th className="px-3">Tipo</th><th className="px-3">Data</th><th className="px-3">Falecido</th><th className="px-3">Agente</th>
                                <th className="px-3 text-right">Total</th><th className="px-3 text-right">Translado</th><th className="px-3 text-right">Sem translado</th>
                            </tr></thead>
                            <tbody>
                                {rel.linhas.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-[#6B7488]">Nenhum atendimento no período.</td></tr>}
                                {rel.linhas.map((l: any) => (
                                    <tr key={l.numero_os} className="border-b border-[#E1E5EC]">
                                        <td className="px-3 py-2.5 font-bold">{l.numero_os}</td><td className="px-3 text-xs">{l.tipo_rotulo}</td>
                                        <td className="px-3">{new Date(l.data + "T12:00").toLocaleDateString("pt-BR")}</td><td className="px-3">{l.falecido || "—"}</td><td className="px-3">{l.agente}</td>
                                        <td className="whitespace-nowrap px-3 text-right">{brl(l.valor_total)}</td>
                                        <td className="whitespace-nowrap px-3 text-right">{l.translado > 0 ? <span className="text-[#B03A2E]">− {brl(l.translado)}</span> : "—"}</td>
                                        <td className="whitespace-nowrap px-3 text-right font-bold">{brl(l.valor_sem_translado)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="flex justify-end px-3 py-3 text-xl font-extrabold">Total sem translado: {brl(g?.valor_sem_translado)}</div>
                    </div>
                </>
            )}
        </main>
    );
}
