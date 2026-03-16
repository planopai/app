"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SorteioStatus = "draft" | "running" | "done" | "canceled";

type Sorteio = {
    id: number;
    titulo: string;
    descricao: string | null;
    executed_at: string | null;
    status: SorteioStatus;
    created_at?: string;
};

type Resultado = {
    id?: number;
    cpf: string;
    nome: string;
    premio_id: number;
    premio_nome: string;
};

type DashboardResp = {
    ok: boolean;
    sorteio: Sorteio | null;
    resultados: Resultado[];
};

type PoolStatsResp = {
    ok: boolean;
    eligible_total?: number;
};

type HistoryResp = {
    ok: boolean;
    sorteios: Sorteio[];
};

type ApiResp<T = Record<string, never>> = { ok: boolean; error?: string } & T;

type NewSorteioForm = {
    titulo: string;
    premiosText: string;
};

const API_URL =
    process.env.NEXT_PUBLIC_SORTEIOS_API_URL ||
    "https://api.planoassistencialintegrado.com.br/sorteios.php";

const DEFAULT_TITLE = "Novo Sorteio";

function maskCpf(cpf: string) {
    const digits = cpf.replace(/\D+/g, "");
    if (digits.length !== 11) return cpf;
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

function uniqueTrimmedLines(text: string) {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        if (seen.has(line)) continue;
        seen.add(line);
        lines.push(line);
    }

    return lines;
}

async function apiJson<T>(
    url: string,
    method: "GET" | "POST",
    body?: unknown
): Promise<T> {

    const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store"
    });

    const json = await res.json();

    if (!res.ok) {
        throw new Error(json.error || "Erro API");
    }

    return json;
}

export default function SorteiosAdminPage() {

    const [history, setHistory] = useState<Sorteio[]>([]);
    const [resultados, setResultados] = useState<Resultado[]>([]);
    const [latestSorteio, setLatestSorteio] = useState<Sorteio | null>(null);

    const [loading, setLoading] = useState(true);

    const [modalOpen, setModalOpen] = useState(false);

    const [eligibleTotal, setEligibleTotal] = useState<number | null>(null);

    const [form, setForm] = useState<NewSorteioForm>({
        titulo: DEFAULT_TITLE,
        premiosText: ""
    });

    const premiosList = useMemo(
        () => uniqueTrimmedLines(form.premiosText),
        [form.premiosText]
    );

    const loadDashboard = useCallback(async () => {

        const dash = await apiJson<DashboardResp>(
            `${API_URL}?op=admin_dashboard`,
            "GET"
        );

        const hist = await apiJson<HistoryResp>(
            `${API_URL}?op=admin_history`,
            "GET"
        );

        setLatestSorteio(dash.sorteio);
        setResultados(dash.resultados || []);
        setHistory(hist.sorteios || []);
    }, []);

    const openModal = async () => {

        setModalOpen(true);

        const stats = await apiJson<PoolStatsResp>(
            `${API_URL}?op=admin_pool_stats`,
            "GET"
        );

        setEligibleTotal(stats.eligible_total || 0);
    };

    const createAndRun = async () => {

        const titulo = form.titulo.trim();

        if (!titulo) {
            alert("Informe o nome do sorteio");
            return;
        }

        if (premiosList.length === 0) {
            alert("Informe pelo menos um prêmio");
            return;
        }

        const save = await apiJson<ApiResp<{ id: number }>>(
            `${API_URL}?op=admin_save_sorteio`,
            "POST",
            {
                titulo,
                descricao: "",
                status: "draft"
            }
        );

        const sorteioId = save.id;

        await apiJson(
            `${API_URL}?op=admin_set_premios`,
            "POST",
            {
                sorteio_id: sorteioId,
                premios: premiosList
            }
        );

        await apiJson(
            `${API_URL}?op=admin_run`,
            "POST",
            {
                sorteio_id: sorteioId,
                force: 0
            }
        );

        setModalOpen(false);

        setForm({
            titulo: DEFAULT_TITLE,
            premiosText: ""
        });

        await loadDashboard();
    };

    useEffect(() => {

        loadDashboard().finally(() => {
            setLoading(false);
        });

    }, [loadDashboard]);

    if (loading) {
        return (
            <div style={{ padding: 40 }}>
                Carregando...
            </div>
        );
    }

    return (
        <main style={{ padding: 40 }}>

            <h1>Sorteios (Admin)</h1>

            <button onClick={openModal}>
                Novo Sorteio
            </button>

            <h2>Histórico</h2>

            <table border={1} cellPadding={8}>

                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Sorteio</th>
                        <th>Status</th>
                        <th>Executado</th>
                    </tr>
                </thead>

                <tbody>

                    {history.map(s => (
                        <tr key={s.id}>
                            <td>{s.id}</td>
                            <td>{s.titulo}</td>
                            <td>{s.status}</td>
                            <td>{s.executed_at || "-"}</td>
                        </tr>
                    ))}

                </tbody>

            </table>

            <h2>Últimos ganhadores</h2>

            <table border={1} cellPadding={8}>

                <thead>
                    <tr>
                        <th>Prêmio</th>
                        <th>Associado</th>
                        <th>CPF</th>
                    </tr>
                </thead>

                <tbody>

                    {resultados.map((r, i) => (
                        <tr key={i}>
                            <td>{r.premio_nome}</td>
                            <td>{r.nome}</td>
                            <td>{maskCpf(r.cpf)}</td>
                        </tr>
                    ))}

                </tbody>

            </table>

            {modalOpen && (

                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "#0008",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}>

                    <div style={{
                        background: "#fff",
                        padding: 30,
                        width: 500
                    }}>

                        <h3>Novo Sorteio</h3>

                        {eligibleTotal !== null && (
                            <p>
                                Elegíveis encontrados: <b>{eligibleTotal}</b>
                            </p>
                        )}

                        <input
                            value={form.titulo}
                            onChange={e =>
                                setForm({
                                    ...form,
                                    titulo: e.target.value
                                })
                            }
                            placeholder="Nome do sorteio"
                            style={{ width: "100%", marginBottom: 10 }}
                        />

                        <textarea
                            value={form.premiosText}
                            onChange={e =>
                                setForm({
                                    ...form,
                                    premiosText: e.target.value
                                })
                            }
                            rows={6}
                            placeholder="Prêmios (1 por linha)"
                            style={{ width: "100%" }}
                        />

                        <div style={{ marginTop: 20 }}>

                            <button onClick={() => setModalOpen(false)}>
                                Cancelar
                            </button>

                            <button
                                onClick={createAndRun}
                                style={{ marginLeft: 10 }}
                            >
                                Realizar Sorteio Agora
                            </button>

                        </div>

                    </div>

                </div>

            )}

        </main>
    );
}