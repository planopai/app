"use client";

import React, { useCallback, useEffect, useState } from "react";
import ItensOSAjuste from "../components/ItensOSAjuste";
import OSDoAtendimento, { AssinaturaModal } from "../components/OSDoAtendimento";

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
function osGet(acao: string, params: Record<string, any> = {}) {
    const u = new URL(OS_API);
    u.searchParams.set(acao, "1");
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && u.searchParams.set(k, String(v)));
    u.searchParams.set("_", String(Date.now()));
    return apiJson(u.toString());
}
function osPost(acao: string, params: Record<string, any> = {}) {
    const body = new URLSearchParams({ [acao]: "1" });
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && body.set(k, String(v)));
    return apiJson(OS_API, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
}

const brl = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = () => new Date().toLocaleDateString("sv-SE");
const inputCls = "w-full rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-sm font-semibold text-[#313C55] dark:text-white outline-none focus:border-[#00AEEC] dark:focus:border-[#00AEEC]";

function Tag({ children, bg = "#EEF1F5" }: { children: React.ReactNode; bg?: string }) {
    return <span className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-extrabold text-[#313C55]" style={{ background: bg }}>{children}</span>;
}
function situacao(l: any) {
    if (l.status === "CONVERTIDA") return <Tag>CONVERTIDA</Tag>;
    if (l.status === "FECHADA") return <Tag bg="#E6F0C9">ASSINADA</Tag>;
    if (l.status === "AGUARDANDO_ASSINATURA") return <Tag bg="#FBEFC4">AGUARDANDO ASSINATURA</Tag>;
    return <Tag bg="#FFF8E1">RASCUNHO</Tag>;
}

/* ====================================================================== */

export default function MinhasOSPage() {
    const [f, setF] = useState({ data_inicio: hoje().slice(0, 8) + "01", data_fim: hoje(), tipo: "" });
    const [dados, setDados] = useState<any>(null);
    const [erro, setErro] = useState("");
    const [loading, setLoading] = useState(true);
    const [aberta, setAberta] = useState<number | null>(null);
    /* Janela "Ver OS" do Editar registro: /os/minhas?atendimento=<id> mostra só as OS daquele atendimento. */
    const [atendimentoDaUrl, setAtendimentoDaUrl] = useState<string | null>(null);
    useEffect(() => {
        const a = new URLSearchParams(window.location.search).get("atendimento");
        if (a && /^\d+$/.test(a)) setAtendimentoDaUrl(a);
    }, []);

    const carregar = useCallback(async () => {
        if (new URLSearchParams(window.location.search).get("atendimento")) return;   // janela do atendimento não carrega a lista
        setLoading(true);
        setErro("");
        try {
            setDados((await osGet("minhas_os", f)).dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar suas OS.");
        } finally {
            setLoading(false);
        }
    }, [f]);
    useEffect(() => { void carregar(); }, [carregar]);

    const lista: any[] = dados?.os || [];
    if (atendimentoDaUrl) {
        const avisarJanelaDeOrigem = () => {
            try { window.opener?.postMessage({ pai: "os-atualizada", atendimento_id: atendimentoDaUrl }, window.location.origin); } catch { /* janela fechada */ }
        };
        return <OSDoAtendimento atendimentoId={atendimentoDaUrl} onFechar={() => window.close()} onMudou={avisarJanelaDeOrigem} />;
    }
    const emAberto = lista.filter((l) => l.status === "ABERTA").length;
    const assinadas = lista.filter((l) => l.status === "FECHADA");

    return (
        <main className="min-h-screen bg-[#F4F6F9] dark:bg-[#161C2A] p-6 text-[#313C55] dark:text-white">
            <div className="mb-5">
                <div className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Você vê apenas as OS que abriu</div>
                <h1 className="text-2xl font-extrabold">Minhas OS</h1>
            </div>

            <div className="mb-4 flex flex-col gap-3 lg:flex-row">
                {[
                    { r: "Em aberto", v: String(emAberto), s: "rascunhos a finalizar", c: "#F2CB3F" },
                    { r: "Assinadas no período", v: String(assinadas.length), s: brl(assinadas.reduce((a, l) => a + (Number(l.valor_total) || 0), 0)), c: "#B3CE52" },
                    { r: "Convertidas", v: String(lista.filter((l) => l.status === "CONVERTIDA").length), s: "Particular → Prefeitura", c: "#C9CFD9" },
                ].map((k) => (
                    <div key={k.r} className="flex-1 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4" style={{ borderTop: `4px solid ${k.c}` }}>
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488] dark:text-[#AEB9CF]">{k.r}</div>
                        <div className="mt-1 text-2xl font-extrabold">{k.v}</div>
                        <div className="text-xs text-[#6B7488] dark:text-[#AEB9CF]">{k.s}</div>
                    </div>
                ))}
            </div>

            <div className="mb-4 grid gap-3 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4 md:grid-cols-[160px_160px_1fr] md:items-end">
                <input type="date" className={inputCls} value={f.data_inicio} onChange={(e) => setF({ ...f, data_inicio: e.target.value })} />
                <input type="date" className={inputCls} value={f.data_fim} onChange={(e) => setF({ ...f, data_fim: e.target.value })} />
                <select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                    <option value="">Todos os tipos</option><option value="PRT">Particular</option><option value="SOC">Associado</option><option value="DIF_SOC">Dif.Soc</option>
                    <option value="PRF">Prefeitura</option><option value="DIF_PRF">Dif.Prf</option><option value="COR">Coroa</option>
                </select>
            </div>

            {erro && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}

            <div className="overflow-x-auto rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F]">
                <table className="w-full text-sm">
                    <thead><tr className="border-b border-[#E1E5EC] dark:border-white/[0.12] text-left text-[11px] uppercase tracking-wider text-[#6B7488] dark:text-[#AEB9CF]">
                        <th className="px-3 py-3">OS / falecido</th><th className="px-3">Tipo</th><th className="px-3">Situação</th><th className="px-3 text-right">Total</th><th className="px-3">Acompanhamento</th><th></th>
                    </tr></thead>
                    <tbody>
                        {!loading && lista.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-[#6B7488] dark:text-[#AEB9CF]">Nenhuma OS no período.</td></tr>}
                        {lista.map((l) => (
                            <tr key={l.os_id} className={`border-b border-[#E1E5EC] dark:border-white/[0.12] ${l.status === "ABERTA" ? "bg-[#FFF8E1] dark:bg-[#F2CB3F]/10" : ""}`}>
                                <td className="px-3 py-3"><b>{l.numero_os}</b><div className="text-xs text-[#6B7488] dark:text-[#AEB9CF]">{l.falecido || "—"}</div></td>
                                <td className="px-3 text-xs">{l.tipo_rotulo}</td>
                                <td className="px-3">{situacao(l)}</td>
                                <td className="whitespace-nowrap px-3 text-right">{brl(l.valor_total)}</td>
                                <td className="px-3 text-xs text-[#6B7488] dark:text-[#AEB9CF]">
                                    {l.status === "ABERTA" ? <b className="text-[#313C55] dark:text-white">Confirmar valores e colher assinatura</b>
                                        : l.saldo ? `saldo ${brl(l.saldo)} (financeiro)` : l.nota_promissoria ? `NP ${brl(l.nota_promissoria.valor)}` : "—"}
                                </td>
                                <td className="px-3 text-right">
                                    <button type="button" onClick={() => setAberta(l.os_id)} className={`rounded-lg px-4 py-2 text-sm font-bold ${l.status === "ABERTA" ? "bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]" : "border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F]"}`}>
                                        {l.status === "ABERTA" ? "Continuar" : "Abrir"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {aberta && <OSAgente osId={aberta} onFechar={() => { setAberta(null); void carregar(); }} />}
        </main>
    );
}


/* ====================================================================== */
/* OS do agente: itens (valor e desconto), confirmação e assinatura com pagamento no ato */

function OSAgente({ osId, onFechar }: { osId: number; onFechar: () => void }) {
    const [d, setD] = useState<any>(null);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [assinar, setAssinar] = useState(false);

    const carregar = useCallback(async () => {
        try {
            setD((await osGet("listar", { os_id: osId })).dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível abrir a OS.");
        }
    }, [osId]);
    useEffect(() => { void carregar(); }, [carregar]);

    const run = async (fn: () => Promise<any>) => {
        if (salvando) return;
        setSalvando(true);
        setErro("");
        setMsg("");
        try {
            const r = await fn();
            setMsg(r?.msg || "Salvo.");
            await carregar();
            return true;
        } catch (e: any) {
            setErro(e?.message || "Não foi possível concluir.");
            return false;
        } finally {
            setSalvando(false);
        }
    };

    const os = d?.os;
    const aberta = os?.status === "ABERTA";
    const particular = os?.natureza === "PARTICULAR";
    const confirmada = !!os?.confirmada_em;


    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(49,60,85,0.45)]" onClick={onFechar}>
            <div className="h-full w-full max-w-4xl overflow-y-auto bg-[#F4F6F9] dark:bg-[#161C2A] p-6" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <div className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Minhas OS</div>
                        <h2 className="text-2xl font-extrabold">OS {os?.numero_os || "…"}</h2>
                    </div>
                    <div className="flex gap-2">
                        <a className="rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-4 py-2 text-sm font-bold" target="_blank" rel="noreferrer" href={`${OS_API}?documento_os=1&os_id=${osId}&formato=visualizar`}>Ver folha</a>
                        <a className="rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-4 py-2 text-sm font-bold" target="_blank" rel="noreferrer" href={`${OS_API}?documento_os=1&os_id=${osId}&formato=impressao`}>Imprimir</a>
                        <button type="button" className="rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-4 py-2 text-sm font-bold" onClick={onFechar}>Fechar</button>
                    </div>
                </div>

                {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
                {msg && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}

                <div className="mb-4 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4">
                    {/* Qtd · Valor · Desconto · Final; ajuste pelo ícone (valor só aumenta, desconto em R$) e desconto geral (% ou R$). */}
                    <ItensOSAjuste osId={osId} editavel={aberta && particular} onMudou={() => void carregar()} />
                    {!particular && <div className="mt-3 flex justify-end text-xl font-extrabold">Total: {brl(os?.valor_total)}</div>}
                </div>

                {aberta && particular && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4">
                        <div className="text-sm">{confirmada ? <><b>Valores confirmados.</b> Qualquer alteração desfaz a confirmação.</> : "Confira os itens com a família e confirme os valores antes de assinar."}</div>
                        <div className="flex gap-2">
                            {!confirmada && <button type="button" disabled={salvando} onClick={() => void run(() => osPost("confirmar_os", { os_id: osId }))} className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white dark:bg-[#F2CB3F] dark:text-[#313C55] disabled:opacity-50">Confirmar valores</button>}
                            {confirmada && <button type="button" onClick={() => setAssinar(true)} className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white dark:bg-[#F2CB3F] dark:text-[#313C55]">Colher assinatura</button>}
                        </div>
                    </div>
                )}
                {aberta && !particular && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4">
                        <div className="text-sm">OS de convênio: o responsável assina como ciência{os?.convenio?.startsWith("ASSOCIADO") && !os?.contrato_numero ? " — informe o contrato do titular no atendimento antes." : "."}</div>
                        <button type="button" onClick={() => setAssinar(true)} className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white dark:bg-[#F2CB3F] dark:text-[#313C55]">Colher assinatura</button>
                    </div>
                )}

                {assinar && os && <AssinaturaModal os={os} particular={particular} onFechar={() => setAssinar(false)} onAssinado={() => { setAssinar(false); setMsg("OS assinada."); void carregar(); }} />}
            </div>
        </div>
    );
}
