"use client";

import React, { useEffect, useMemo, useState } from "react";

type Sorteio = {
    id: number;
    titulo: string;
    descricao: string | null;
    scheduled_at: string; // "YYYY-MM-DD HH:MM:SS"
    executed_at: string | null;
    status: "draft" | "scheduled" | "running" | "done" | "canceled";
    winners_count?: number | null;
};

type Premio = {
    id: number;
    nome: string;
    ordem: number;
    created_at?: string;
};

type Resultado = {
    id?: number;
    cpf: string;
    nome: string;
    created_at?: string;
    premio_id: number;
    premio_nome: string;
    ordem?: number;
};

type DashboardResp = {
    ok: boolean;
    sorteio: Sorteio | null;
    premios: Premio[];
    resultados: Resultado[];
};

type ApiResp<T = any> = { ok: boolean } & T;

const API_URL = process.env.NEXT_PUBLIC_SORTEIOS_API_URL || "/sorteios.php";

function toLocalInputValue(mysqlDatetime: string) {
    if (!mysqlDatetime) return "";
    const [d, t] = mysqlDatetime.split(" ");
    if (!d || !t) return "";
    const hhmm = t.slice(0, 5);
    return `${d}T${hhmm}`;
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

async function apiJson<T = any>(
    url: string,
    method: "GET" | "POST",
    body?: any
): Promise<T> {
    const res = await fetch(url, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });

    const txt = await res.text();
    let data: any = null;
    try {
        data = JSON.parse(txt);
    } catch {
        data = { ok: false, error: "Resposta inválida do servidor", raw: txt };
    }

    if (!res.ok) {
        throw new Error(data?.error || `Erro HTTP ${res.status}`);
    }
    return data as T;
}

export default function SorteiosAdminPage() {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [dash, setDash] = useState<DashboardResp | null>(null);
    const sorteio = dash?.sorteio ?? null;

    // form
    const [titulo, setTitulo] = useState("Sorteio");
    const [descricao, setDescricao] = useState("");
    const [status, setStatus] = useState<Sorteio["status"]>("draft");
    const [scheduledAtInput, setScheduledAtInput] = useState("");
    const [premiosText, setPremiosText] = useState<string>("");

    const premiosList = useMemo(() => {
        return premiosText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
    }, [premiosText]);

    async function loadDashboard() {
        setLoading(true);
        setErrorMsg(null);
        try {
            const data = await apiJson<DashboardResp>(
                `${API_URL}?op=admin_dashboard`,
                "GET"
            );
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
            setErrorMsg(e?.message || "Falha ao carregar");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadDashboard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

            const r = await apiJson<ApiResp>(
                `${API_URL}?op=admin_save_sorteio`,
                "POST",
                payload
            );
            if (!r?.ok) throw new Error((r as any)?.error || "Falha ao salvar sorteio");
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
            // garante sorteio criado
            if (!sorteio?.id) {
                await saveSorteio();
            }

            // recarrega para ter id
            const d2 = await apiJson<DashboardResp>(
                `${API_URL}?op=admin_dashboard`,
                "GET"
            );
            setDash(d2);

            const sidFinal = d2?.sorteio?.id ?? 0;
            if (!sidFinal) throw new Error("Crie o sorteio antes de salvar prêmios.");

            const r = await apiJson<ApiResp>(
                `${API_URL}?op=admin_set_premios`,
                "POST",
                { sorteio_id: sidFinal, premios: premiosList }
            );
            if (!r?.ok) throw new Error((r as any)?.error || "Falha ao salvar prêmios");

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

            const r = await apiJson<ApiResp>(
                `${API_URL}?op=admin_run`,
                "POST",
                { sorteio_id: sid, force: force ? 1 : 0, only_active_text: "ATIVO" }
            );
            if (!r?.ok) throw new Error((r as any)?.error || "Falha ao executar sorteio");
            await loadDashboard();
        } catch (e: any) {
            setErrorMsg(e?.message || "Falha ao executar");
        } finally {
            setBusy(false);
        }
    }

    if (loading) {
        return (
            <main className="min-h-[70vh] grid place-items-center px-4">
                <div className="text-center">
                    <div className="mb-4 inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-gray-300 border-t-emerald-600" />
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Carregando admin de sorteios…
                    </h1>
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
                        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                            Sorteios (Admin)
                        </h1>
                        <p className="mt-2 text-gray-700 dark:text-gray-200">
                            Cadastre prêmios, agende data/hora e execute o sorteio.
                        </p>
                    </div>

                    <button
                        onClick={loadDashboard}
                        disabled={busy}
                        className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        Atualizar
                    </button>
                </header>

                {errorMsg ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                        {errorMsg}
                    </div>
                ) : null}

                {/* Config */}
                <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                            Configuração do sorteio
                        </h2>
                    </div>

                    <div className="p-5 space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Título
                                </label>
                                <input
                                    value={titulo}
                                    onChange={(e) => setTitulo(e.target.value)}
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                    placeholder="Ex: Sorteio de Março"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Status
                                </label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as any)}
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                >
                                    <option value="draft">Rascunho</option>
                                    <option value="scheduled">Agendado</option>
                                    <option value="canceled">Cancelado</option>
                                </select>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Dica: use <b>Agendado</b> para o CRON executar automaticamente.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                Descrição (opcional)
                            </label>
                            <textarea
                                value={descricao}
                                onChange={(e) => setDescricao(e.target.value)}
                                rows={3}
                                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Data/Hora do sorteio
                                </label>
                                <input
                                    type="datetime-local"
                                    value={scheduledAtInput}
                                    onChange={(e) => setScheduledAtInput(e.target.value)}
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                />
                            </div>

                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/30">
                                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                    Situação atual
                                </div>
                                <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                    <div>
                                        <span className="font-semibold">ID:</span> {sorteio?.id ?? "—"}
                                    </div>
                                    <div>
                                        <span className="font-semibold">Status:</span> {sorteio?.status ?? "—"}
                                    </div>
                                    <div>
                                        <span className="font-semibold">Agendado:</span> {formatBR(sorteio?.scheduled_at)}
                                    </div>
                                    <div>
                                        <span className="font-semibold">Executado:</span> {formatBR(sorteio?.executed_at)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                                onClick={saveSorteio}
                                disabled={busy}
                                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {busy ? "Salvando..." : "Salvar sorteio"}
                            </button>

                            <button
                                onClick={() => runNow(false)}
                                disabled={busy || !sorteio?.id}
                                className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Executar agora
                            </button>

                            <button
                                onClick={() => runNow(true)}
                                disabled={busy || !sorteio?.id}
                                className="inline-flex items-center justify-center rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:text-red-200 dark:hover:bg-red-950/30"
                                title="Apaga resultados e sorteia novamente"
                            >
                                Re-sortear (FORCE)
                            </button>
                        </div>
                    </div>
                </section>

                {/* Prêmios */}
                <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                            Prêmios (1 por linha)
                        </h2>
                    </div>

                    <div className="p-5 space-y-3">
                        <textarea
                            value={premiosText}
                            onChange={(e) => setPremiosText(e.target.value)}
                            rows={8}
                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                            placeholder={'Ex:\nTV 50"\nAirfryer\nVale-compras R$ 200'}
                        />

                        <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-gray-600 dark:text-gray-300">
                                Total: <b>{premiosList.length}</b> prêmio(s)
                            </div>

                            <button
                                onClick={savePremios}
                                disabled={busy}
                                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {busy ? "Salvando..." : "Salvar prêmios"}
                            </button>
                        </div>
                    </div>
                </section>

                {/* Resultados */}
                <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                            Resultados
                        </h2>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                        Prêmio
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                        Associado(a)
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                        CPF
                                    </th>
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
                                            <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                                                {r.premio_nome}
                                            </td>
                                            <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                                                {r.nome}
                                            </td>
                                            <td className="px-6 py-3 text-sm text-gray-700 dark:text-gray-200">
                                                {r.cpf}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">
                        Exibido em: <b>{formatBR(sorteio?.executed_at || null)}</b> (quando executado)
                    </div>
                </section>
            </div>
        </div>
    );
}