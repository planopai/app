"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Sorteio = {
    id: number;
    titulo: string;
    descricao: string | null;
    scheduled_at: string;
    executed_at: string | null;
    status: "draft" | "scheduled" | "running" | "done" | "canceled";
};

type Premio = { id: number; nome: string; ordem: number; created_at?: string };
type Resultado = {
    id?: number;
    cpf: string;
    nome: string;
    created_at?: string;
    premio_id: number;
    premio_nome: string;
    ordem?: number;
};

type DashboardResp = { ok: boolean; sorteio: Sorteio | null; premios: Premio[]; resultados: Resultado[]; error?: string };

type PoolStatsResp = {
    ok: boolean;
    eligible_total?: number;
    calculated_at?: string;
    took_ms?: number;
    cached_ttl_s?: number;
    diag?: any;
    error?: string;
    detail?: string;
};

type ApiResp<T = any> = { ok: boolean; error?: string } & T;

// ✅ ajuste este caminho para onde você salvou o PHP:
const API_URL =
    process.env.NEXT_PUBLIC_SORTEIOS_API_URL ||
    "https://api.planoassistencialintegrado.com.br/sorteios.php";

function toLocalInputValue(mysqlDatetime: string) {
    if (!mysqlDatetime) return "";
    const [d, t] = mysqlDatetime.split(" ");
    if (!d || !t) return "";
    return `${d}T${t.slice(0, 5)}`;
}

function fromLocalInputValue(v: string) {
    if (!v) return "";
    const [d, t] = v.split("T");
    if (!d || !t) return "";
    return `${d} ${t}:00`;
}

function formatBR(mysqlDatetime?: string | null) {
    if (!mysqlDatetime) return "-";
    const s = mysqlDatetime.replace(" ", "T");
    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) return mysqlDatetime;
    return dt.toLocaleString("pt-BR");
}

async function apiJson<T = any>(url: string, method: "GET" | "POST", body?: any, signal?: AbortSignal): Promise<T> {
    const res = await fetch(url, {
        method,
        signal,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
    });

    const txt = await res.text();
    let data: any;
    try {
        data = JSON.parse(txt);
    } catch {
        data = { ok: false, error: "Resposta inválida do servidor", raw: txt };
    }

    if (!res.ok) throw new Error(data?.error || `Erro HTTP ${res.status}`);
    return data as T;
}

export default function SorteiosAdminPage() {
    const [loadingDash, setLoadingDash] = useState(true);
    const [busy, setBusy] = useState(false);

    const [dash, setDash] = useState<DashboardResp | null>(null);
    const sorteio = dash?.sorteio ?? null;

    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [stats, setStats] = useState<PoolStatsResp | null>(null);
    const [loadingStats, setLoadingStats] = useState(false);
    const statsAbortRef = useRef<AbortController | null>(null);

    const [titulo, setTitulo] = useState("Sorteio");
    const [descricao, setDescricao] = useState("");
    const [status, setStatus] = useState<Sorteio["status"]>("draft");
    const [scheduledAtInput, setScheduledAtInput] = useState("");
    const [premiosText, setPremiosText] = useState("");

    const premiosList = useMemo(() => {
        return premiosText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
    }, [premiosText]);

    const loadDashboard = useCallback(async () => {
        setLoadingDash(true);
        setErrorMsg(null);

        try {
            const data = await apiJson<DashboardResp>(`${API_URL}?op=admin_dashboard&_=${Date.now()}`, "GET");
            if (!data?.ok) throw new Error(data?.error || "Dashboard retornou ok=false");

            setDash(data);

            if (data?.sorteio) {
                setTitulo(data.sorteio.titulo || "Sorteio");
                setDescricao(data.sorteio.descricao || "");
                setStatus(data.sorteio.status);
                setScheduledAtInput(toLocalInputValue(data.sorteio.scheduled_at || ""));
            } else {
                setTitulo("Sorteio");
                setDescricao("");
                setStatus("draft");
                const in1h = new Date(Date.now() + 60 * 60 * 1000);
                setScheduledAtInput(in1h.toISOString().slice(0, 16));
            }

            const premiosDb = (data?.premios || [])
                .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
                .map((p) => p.nome);

            setPremiosText(premiosDb.join("\n"));
        } catch (e: any) {
            setDash(null);
            setErrorMsg(e?.message || "Falha ao carregar dashboard");
        } finally {
            setLoadingDash(false);
        }
    }, []);

    const loadStats = useCallback(async () => {
        statsAbortRef.current?.abort();
        const ac = new AbortController();
        statsAbortRef.current = ac;

        setLoadingStats(true);
        setErrorMsg(null);

        try {
            const r = await apiJson<PoolStatsResp>(`${API_URL}?op=admin_pool_stats&_=${Date.now()}`, "GET", undefined, ac.signal);

            if (!r?.ok) {
                setStats(r || null);
                setErrorMsg(r?.error || "Falha ao calcular elegíveis");
                return;
            }

            setStats(r);
        } catch (e: any) {
            if (e?.name === "AbortError") return;
            setStats(null);
            setErrorMsg(e?.message || "Falha ao calcular elegíveis");
        } finally {
            setLoadingStats(false);
        }
    }, []);

    useEffect(() => { loadDashboard(); }, [loadDashboard]);
    useEffect(() => { loadStats(); }, [loadStats]);

    async function saveSorteio() {
        setBusy(true);
        setErrorMsg(null);
        try {
            const payload: any = {
                id: sorteio?.id ?? undefined,
                titulo: titulo || "Sorteio",
                descricao: descricao || "",
                scheduled_at: fromLocalInputValue(scheduledAtInput),
                status,
            };

            const r = await apiJson<ApiResp>(`${API_URL}?op=admin_save_sorteio`, "POST", payload);
            if (!r?.ok) throw new Error(r?.error || "Falha ao salvar sorteio");

            await loadDashboard();
        } catch (e: any) {
            setErrorMsg(e?.message || "Falha ao salvar");
        } finally {
            setBusy(false);
        }
    }

    async function savePremios() {
        setBusy(true);
        setErrorMsg(null);

        try {
            if (!sorteio?.id) await saveSorteio();

            const d2 = await apiJson<DashboardResp>(`${API_URL}?op=admin_dashboard&_=${Date.now()}`, "GET");
            if (!d2?.ok) throw new Error(d2?.error || "Falha ao recarregar dashboard");

            setDash(d2);

            const sidFinal = d2?.sorteio?.id ?? 0;
            if (!sidFinal) throw new Error("Crie o sorteio antes de salvar prêmios.");

            const r = await apiJson<ApiResp>(`${API_URL}?op=admin_set_premios`, "POST", {
                sorteio_id: sidFinal,
                premios: premiosList,
            });

            if (!r?.ok) throw new Error(r?.error || "Falha ao salvar prêmios");
            await loadDashboard();
        } catch (e: any) {
            setErrorMsg(e?.message || "Falha ao salvar prêmios");
        } finally {
            setBusy(false);
        }
    }

    async function runNow(force = false) {
        setBusy(true);
        setErrorMsg(null);

        try {
            const sid = sorteio?.id;
            if (!sid) throw new Error("Crie o sorteio antes de sortear.");

            const r = await apiJson<ApiResp>(`${API_URL}?op=admin_run`, "POST", {
                sorteio_id: sid,
                force: force ? 1 : 0,
            });

            if (!r?.ok) throw new Error(r?.error || "Falha ao executar sorteio");

            await loadDashboard();
            loadStats();
        } catch (e: any) {
            setErrorMsg(e?.message || "Falha ao executar");
        } finally {
            setBusy(false);
        }
    }

    if (loadingDash) {
        return (
            <main className="min-h-[70vh] grid place-items-center px-4">
                <div className="text-center">
                    <div className="mb-4 inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-gray-300 border-t-emerald-600" />
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Carregando admin de sorteios…</h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-300">Aguarde um instante.</p>
                </div>
            </main>
        );
    }

    return (
        <div className="p-4 sm:p-6 xl:p-8 font-[Nunito]">
            <div className="mx-auto max-w-5xl space-y-6">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Sorteios (Admin)</h1>
                        <p className="mt-2 text-gray-700 dark:text-gray-200">Cadastre prêmios, agende data/hora e execute o sorteio.</p>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={loadDashboard}
                            disabled={busy}
                            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            Atualizar dashboard
                        </button>
                        <button
                            onClick={loadStats}
                            disabled={busy || loadingStats}
                            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            title="Recalcula (ou pega cache) do total elegível"
                        >
                            {loadingStats ? "Calculando…" : "Atualizar elegíveis"}
                        </button>
                    </div>
                </header>

                {errorMsg ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                        {errorMsg}
                        {stats?.diag ? (
                            <pre className="mt-3 overflow-auto rounded-xl bg-white/60 p-3 text-xs text-gray-800 dark:bg-black/30 dark:text-gray-100">
                                {JSON.stringify(stats.diag, null, 2)}
                            </pre>
                        ) : null}
                    </div>
                ) : null}

                {/* Config */}
                <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Configuração do sorteio</h2>
                    </div>

                    <div className="p-5 space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Título</label>
                                <input
                                    value={titulo}
                                    onChange={(e) => setTitulo(e.target.value)}
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Status</label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as any)}
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                >
                                    <option value="draft">Rascunho</option>
                                    <option value="scheduled">Agendado</option>
                                    <option value="canceled">Cancelado</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Descrição (opcional)</label>
                            <textarea
                                value={descricao}
                                onChange={(e) => setDescricao(e.target.value)}
                                rows={3}
                                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Data/Hora do sorteio</label>
                                <input
                                    type="datetime-local"
                                    value={scheduledAtInput}
                                    onChange={(e) => setScheduledAtInput(e.target.value)}
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                />
                            </div>

                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/30">
                                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">Situação atual</div>
                                <div className="mt-1 text-sm text-gray-900 dark:text-gray-100 space-y-1">
                                    <div><span className="font-semibold">ID:</span> {sorteio?.id ?? "—"}</div>
                                    <div><span className="font-semibold">Status:</span> {sorteio?.status ?? "—"}</div>
                                    <div><span className="font-semibold">Agendado:</span> {formatBR(sorteio?.scheduled_at)}</div>
                                    <div><span className="font-semibold">Executado:</span> {formatBR(sorteio?.executed_at)}</div>

                                    <div className="pt-2">
                                        <span className="font-semibold">Titulares ativos e em dia (agora):</span>{" "}
                                        {loadingStats ? "Calculando…" : (stats?.ok ? (stats.eligible_total ?? "—") : "—")}
                                    </div>

                                    {stats?.ok ? (
                                        <div className="text-xs text-gray-600 dark:text-gray-300">
                                            {stats.calculated_at ? <>Calculado em <b>{new Date(stats.calculated_at).toLocaleString("pt-BR")}</b>. </> : null}
                                            {typeof stats.took_ms === "number" ? <>Tempo: <b>{stats.took_ms}ms</b>. </> : null}
                                            {typeof stats.cached_ttl_s === "number" ? <>Cache TTL: <b>{stats.cached_ttl_s}s</b>.</> : null}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                                onClick={saveSorteio}
                                disabled={busy}
                                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                                {busy ? "Salvando..." : "Salvar sorteio"}
                            </button>

                            <button
                                onClick={() => runNow(false)}
                                disabled={busy || !sorteio?.id}
                                className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Executar agora
                            </button>

                            <button
                                onClick={() => runNow(true)}
                                disabled={busy || !sorteio?.id}
                                className="inline-flex items-center justify-center rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/40 dark:text-red-200 dark:hover:bg-red-950/30"
                            >
                                Re-sortear (FORCE)
                            </button>
                        </div>
                    </div>
                </section>

                {/* Prêmios */}
                <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Prêmios (1 por linha)</h2>
                    </div>

                    <div className="p-5 space-y-3">
                        <textarea
                            value={premiosText}
                            onChange={(e) => setPremiosText(e.target.value)}
                            rows={8}
                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                        />

                        <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-gray-600 dark:text-gray-300">
                                Total: <b>{premiosList.length}</b> prêmio(s)
                            </div>

                            <button
                                onClick={savePremios}
                                disabled={busy}
                                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                                {busy ? "Salvando..." : "Salvar prêmios"}
                            </button>
                        </div>
                    </div>
                </section>

                {/* Resultados */}
                <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Resultados</h2>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">Prêmio</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">Associado(a)</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">CPF</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {(dash?.resultados || []).length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-6 text-sm text-gray-600 dark:text-gray-300">
                                            Nenhum resultado ainda. Execute o sorteio ou aguarde o agendamento.
                                        </td>
                                    </tr>
                                ) : (
                                    (dash?.resultados || []).map((r, idx) => (
                                        <tr key={`${r.premio_id}-${idx}`} className="h-12">
                                            <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{r.premio_nome}</td>
                                            <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{r.nome}</td>
                                            <td className="px-6 py-3 text-sm text-gray-700 dark:text-gray-200">{r.cpf}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">
                        Executado em: <b>{formatBR(sorteio?.executed_at || null)}</b>
                    </div>
                </section>
            </div>
        </div>
    );
}