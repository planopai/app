'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Cargo = {
    id: number;
    nome: string;
    slug: string;
    descricao?: string | null;
    ativo: number;
};

type Pagina = {
    key: string;
    label: string;
};

const API_URL = 'https://api.planoassistencialintegrado.com.br/pai_api.php';

/* ---------------- parser robusto (tolera BOM/HTML) ---------------- */
async function safeJsonFetch(input: RequestInfo, init?: RequestInit) {
    const r = await fetch(input, { cache: 'no-store', ...init });
    const txt = await r.text();
    const cleaned = txt.replace(/^\uFEFF/, '').trim();
    let json: any = null;

    if (!cleaned.startsWith('<')) {
        try {
            json = JSON.parse(cleaned);
        } catch {
            const m = cleaned.match(/\{[\s\S]*\}$/m);
            if (m) json = JSON.parse(m[0]);
        }
    }

    if (json == null) {
        throw new Error(
            `Resposta não-JSON do backend:\n${cleaned.slice(0, 300)}${cleaned.length > 300 ? '…' : ''}`
        );
    }

    if (!r.ok || json?.erro) {
        throw new Error(json?.erro || json?.msg || `HTTP ${r.status}`);
    }

    return json;
}

export default function PermissoesPage() {
    const [cargos, setCargos] = useState<Cargo[]>([]);
    const [pages, setPages] = useState<Pagina[]>([]);
    const [cargoId, setCargoId] = useState<number | null>(null);
    const [allowed, setAllowed] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(false);
    const [loadingBase, setLoadingBase] = useState(true);
    const [msg, setMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    /* ---------------- fetchers ---------------- */
    const fetchCargos = async () => {
        try {
            const j = await safeJsonFetch(`${API_URL}?action=list_cargos&_=${Date.now()}`);
            setCargos(Array.isArray(j) ? (j as Cargo[]) : []);
        } catch (e: any) {
            setCargos([]);
            throw new Error(e?.message || 'Erro ao carregar cargos.');
        }
    };

    const fetchPages = async () => {
        try {
            const j = await safeJsonFetch(`${API_URL}?action=list_pages&_=${Date.now()}`);
            setPages(Array.isArray(j) ? (j as Pagina[]) : []);
        } catch (e: any) {
            setPages([]);
            throw new Error(e?.message || 'Erro ao carregar páginas.');
        }
    };

    const fetchPerms = async (cid: number) => {
        setLoading(true);
        setError(null);
        setMsg(null);

        try {
            const j = await safeJsonFetch(
                `${API_URL}?action=list_cargo_permissions&cargo_id=${cid}&_=${Date.now()}`
            );

            const next: Record<string, boolean> = {};

            (Array.isArray(j) ? (j as string[]) : []).forEach((key) => {
                next[key] = true;
            });

            setAllowed(next);
        } catch (e: any) {
            setAllowed({});
            setError(e?.message || 'Erro ao carregar permissões do cargo.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let alive = true;

        (async () => {
            setLoadingBase(true);
            setError(null);

            try {
                await Promise.all([fetchCargos(), fetchPages()]);
            } catch (e: any) {
                if (alive) {
                    setError(e?.message || 'Erro ao carregar dados.');
                }
            } finally {
                if (alive) setLoadingBase(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        if (cargoId != null) {
            fetchPerms(cargoId);
        } else {
            setAllowed({});
            setMsg(null);
        }
    }, [cargoId]);

    /* ---------------- ações ---------------- */
    const toggle = (key: string) => {
        setMsg(null);
        setAllowed((prev) => ({
            ...prev,
            [key]: !prev[key],
        }));
    };

    const marcarTudo = () => {
        setMsg(null);

        setAllowed((prev) => {
            const next: Record<string, boolean> = { ...prev };

            for (const p of pages) {
                next[p.key] = true;
            }

            return next;
        });
    };

    const desmarcarTudo = () => {
        setMsg(null);

        setAllowed((prev) => {
            const next: Record<string, boolean> = { ...prev };

            for (const p of pages) {
                next[p.key] = false;
            }

            return next;
        });
    };

    const save = async () => {
        if (cargoId == null) return;

        setLoading(true);
        setMsg(null);
        setError(null);

        try {
            const selecionadas = pages
                .filter((p) => !!allowed[p.key])
                .map((p) => p.key);

            await safeJsonFetch(`${API_URL}?action=save_cargo_permissions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cargo_id: cargoId,
                    permissions: selecionadas,
                }),
            });

            setMsg('Permissões do cargo salvas!');
        } catch (e: any) {
            setError(e?.message || 'Erro ao salvar permissões do cargo.');
        } finally {
            setLoading(false);
        }
    };

    const currentCargo = useMemo(
        () => cargos.find((c) => c.id === cargoId) ?? null,
        [cargoId, cargos]
    );

    const totalSelecionadas = useMemo(
        () => pages.filter((p) => !!allowed[p.key]).length,
        [allowed, pages]
    );

    /* ---------------- render ---------------- */
    return (
        <div className="w-full px-3 sm:px-6 lg:px-10 pt-10 pb-14 md:pt-12 md:pb-16 lg:pt-16 lg:pb-24 font-[var(--font-nunito,_inherit)]">
            <div className="mb-6 md:mb-8">
                <h1 className="text-2xl md:text-3xl font-semibold">
                    Permissões por cargo
                </h1>

                <p className="mt-1 text-sm text-gray-500">
                    Defina quais páginas do sistema ficam disponíveis para cada cargo.
                </p>
            </div>

            {error && !cargoId && (
                <p className="text-red-600 mb-4">{error}</p>
            )}

            <div className="rounded-2xl shadow p-4 mb-6">
                <label className="block text-sm mb-1">Cargo</label>

                <select
                    className="border rounded-lg px-3 py-2 w-full sm:w-96 bg-white"
                    value={cargoId ?? ''}
                    onChange={(e) =>
                        setCargoId(
                            e.target.value ? Number(e.target.value) : null
                        )
                    }
                    disabled={loadingBase}
                >
                    <option value="">
                        {loadingBase ? 'Carregando cargos...' : 'Selecione...'}
                    </option>

                    {cargos.map((cargo) => (
                        <option key={cargo.id} value={cargo.id}>
                            {cargo.nome}
                        </option>
                    ))}
                </select>

                {cargos.length === 0 && !loadingBase && (
                    <p className="mt-2 text-sm text-gray-500">
                        Nenhum cargo ativo encontrado.
                    </p>
                )}
            </div>

            {cargoId != null && (
                <div className="rounded-2xl shadow p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="text-lg font-medium">
                                Páginas liberadas para {currentCargo?.nome ?? 'cargo'}
                            </h2>

                            <p className="mt-1 text-sm text-gray-500">
                                {totalSelecionadas} de {pages.length} páginas selecionadas
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={marcarTudo}
                                className="px-3 py-2 rounded-xl border text-sm"
                                disabled={loading || pages.length === 0}
                                title="Marcar todas as páginas"
                            >
                                Marcar tudo
                            </button>

                            <button
                                onClick={desmarcarTudo}
                                className="px-3 py-2 rounded-xl border text-sm"
                                disabled={loading || pages.length === 0}
                                title="Desmarcar todas as páginas"
                            >
                                Desmarcar tudo
                            </button>
                        </div>
                    </div>

                    {msg && (
                        <p className="text-green-700 mt-3">{msg}</p>
                    )}

                    {error && (
                        <p className="text-red-600 mt-3">{error}</p>
                    )}

                    {loading && pages.length > 0 && (
                        <p className="text-sm text-gray-500 mt-3">
                            Carregando...
                        </p>
                    )}

                    <ul className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {pages.map((p) => (
                            <li
                                key={p.key}
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50"
                            >
                                <input
                                    id={`pg-${p.key}`}
                                    type="checkbox"
                                    checked={!!allowed[p.key]}
                                    onChange={() => toggle(p.key)}
                                    disabled={loading}
                                />

                                <label
                                    htmlFor={`pg-${p.key}`}
                                    className="cursor-pointer select-none"
                                >
                                    {p.label}
                                </label>
                            </li>
                        ))}

                        {pages.length === 0 && !loadingBase && (
                            <li className="text-sm text-muted-foreground col-span-full">
                                Nenhuma página disponível.
                            </li>
                        )}
                    </ul>

                    <div className="mt-5 flex items-center gap-3">
                        <button
                            onClick={save}
                            disabled={loading || cargoId == null}
                            className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
                        >
                            {loading ? 'Salvando...' : 'Salvar permissões'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
