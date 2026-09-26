"use client";

import React, { useEffect, useMemo, useState } from "react";

type Usuario = {
    id: number;
    nome: string;
    usuario: string;
};

type Pagina = {
    key: string;
    label: string;
};

type DepartamentoIA = {
    id: number;
    nome: string;
    slug?: string | null;
    descricao?: string | null;
    ordem?: number;
    ativo?: number;
};

type FerramentaIA = {
    key: string;
    label: string;
    grupo?: string | null;
    tipo?: "consulta" | "acao" | string;
};

const API_URL =
    "https://api.planoassistencialintegrado.com.br/pai_api.php";

/* ---------------- parser robusto (tolera BOM/HTML) ---------------- */
async function safeJsonFetch(
    input: RequestInfo,
    init?: RequestInit,
) {
    const r = await fetch(input, {
        cache: "no-store",
        credentials: "include",
        ...init,
    });

    const txt = await r.text();
    const cleaned = txt.replace(/^\uFEFF/, "").trim();

    let json: any = null;

    if (!cleaned.startsWith("<")) {
        try {
            json = JSON.parse(cleaned);
        } catch {
            const objectMatch = cleaned.match(/\{[\s\S]*\}$/m);
            const arrayMatch = cleaned.match(/\[[\s\S]*\]$/m);

            if (objectMatch) {
                json = JSON.parse(objectMatch[0]);
            } else if (arrayMatch) {
                json = JSON.parse(arrayMatch[0]);
            }
        }
    }

    if (json == null) {
        throw new Error(
            `Resposta não-JSON do backend:\n${cleaned.slice(0, 300)}${cleaned.length > 300 ? "…" : ""
            }`,
        );
    }

    if (!r.ok || json?.erro) {
        throw new Error(
            json?.erro ||
            json?.msg ||
            `HTTP ${r.status}`,
        );
    }

    return json;
}

export default function PermissoesPage() {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [pages, setPages] = useState<Pagina[]>([]);

    const [departamentos, setDepartamentos] = useState<
        DepartamentoIA[]
    >([]);

    const [ferramentas, setFerramentas] = useState<
        FerramentaIA[]
    >([]);

    const [userId, setUserId] = useState<number | null>(
        null,
    );

    /* páginas normais */
    const [allowed, setAllowed] = useState<
        Record<string, boolean>
    >({});

    /* departamentos da base de conhecimento */
    const [
        allowedDepartamentos,
        setAllowedDepartamentos,
    ] = useState<Record<number, boolean>>({});

    /* ferramentas / funções da Aurora */
    const [
        allowedFerramentas,
        setAllowedFerramentas,
    ] = useState<Record<string, boolean>>({});

    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(
        null,
    );

    /* ============================================================
       CARREGAMENTO INICIAL
       ============================================================ */

    const fetchUsuarios = async () => {
        try {
            const j = await safeJsonFetch(
                `${API_URL}?action=list_users&_=${Date.now()}`,
            );

            setUsuarios(
                Array.isArray(j) ? (j as Usuario[]) : [],
            );
        } catch (e: any) {
            setError(
                e?.message ||
                "Erro ao carregar usuários.",
            );
        }
    };

    const fetchPages = async () => {
        try {
            const j = await safeJsonFetch(
                `${API_URL}?action=list_pages&_=${Date.now()}`,
            );

            setPages(
                Array.isArray(j) ? (j as Pagina[]) : [],
            );
        } catch {
            setPages([]);
        }
    };

    const fetchDepartamentos = async () => {
        try {
            const j = await safeJsonFetch(
                `${API_URL}?action=list_ia_departamentos&_=${Date.now()}`,
            );

            setDepartamentos(
                Array.isArray(j)
                    ? (j as DepartamentoIA[])
                    : [],
            );
        } catch (e: any) {
            setDepartamentos([]);
            setError(
                e?.message ||
                "Erro ao carregar departamentos da IA.",
            );
        }
    };

    const fetchFerramentas = async () => {
        try {
            const j = await safeJsonFetch(
                `${API_URL}?action=list_ia_ferramentas&_=${Date.now()}`,
            );

            setFerramentas(
                Array.isArray(j)
                    ? (j as FerramentaIA[])
                    : [],
            );
        } catch (e: any) {
            setFerramentas([]);
            setError(
                e?.message ||
                "Erro ao carregar funções da Aurora.",
            );
        }
    };

    /* ============================================================
       PERMISSÕES DO USUÁRIO SELECIONADO
       ============================================================ */

    const fetchPermsUsuario = async (uid: number) => {
        setLoading(true);
        setError(null);
        setMsg(null);

        try {
            const [
                paginasJson,
                departamentosJson,
                ferramentasJson,
            ] = await Promise.all([
                safeJsonFetch(
                    `${API_URL}?action=list_permissions&user_id=${uid}&_=${Date.now()}`,
                ),
                safeJsonFetch(
                    `${API_URL}?action=list_user_ia_departamentos&user_id=${uid}&_=${Date.now()}`,
                ),
                safeJsonFetch(
                    `${API_URL}?action=list_user_ia_ferramentas&user_id=${uid}&_=${Date.now()}`,
                ),
            ]);

            const paginasSet: Record<string, boolean> =
                {};
            if (Array.isArray(paginasJson)) {
                paginasJson.forEach((key: unknown) => {
                    if (typeof key === "string") {
                        paginasSet[key] = true;
                    }
                });
            }
            setAllowed(paginasSet);

            const departamentosSet: Record<
                number,
                boolean
            > = {};
            if (Array.isArray(departamentosJson)) {
                departamentosJson.forEach(
                    (id: unknown) => {
                        const n = Number(id);
                        if (
                            Number.isFinite(n) &&
                            n > 0
                        ) {
                            departamentosSet[n] = true;
                        }
                    },
                );
            }
            setAllowedDepartamentos(
                departamentosSet,
            );

            const ferramentasSet: Record<
                string,
                boolean
            > = {};
            if (Array.isArray(ferramentasJson)) {
                ferramentasJson.forEach(
                    (key: unknown) => {
                        if (typeof key === "string") {
                            ferramentasSet[key] = true;
                        }
                    },
                );
            }
            setAllowedFerramentas(ferramentasSet);
        } catch (e: any) {
            setError(
                e?.message ||
                "Erro ao carregar permissões do usuário.",
            );

            setAllowed({});
            setAllowedDepartamentos({});
            setAllowedFerramentas({});
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        setError(null);

        Promise.all([
            fetchUsuarios(),
            fetchPages(),
            fetchDepartamentos(),
            fetchFerramentas(),
        ]).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (userId != null) {
            void fetchPermsUsuario(userId);
        } else {
            setAllowed({});
            setAllowedDepartamentos({});
            setAllowedFerramentas({});
            setMsg(null);
        }
    }, [userId]);

    /* ============================================================
       AÇÕES - PÁGINAS
       ============================================================ */

    const togglePagina = (key: string) => {
        setAllowed((prev) => ({
            ...prev,
            [key]: !prev[key],
        }));
    };

    const marcarTodasPaginas = () => {
        setAllowed((prev) => {
            const next = { ...prev };

            for (const p of pages) {
                next[p.key] = true;
            }

            return next;
        });
    };

    const desmarcarTodasPaginas = () => {
        setAllowed((prev) => {
            const next = { ...prev };

            for (const p of pages) {
                next[p.key] = false;
            }

            return next;
        });
    };

    /* ============================================================
       AÇÕES - DEPARTAMENTOS IA
       ============================================================ */

    const toggleDepartamento = (id: number) => {
        setAllowedDepartamentos((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const marcarTodosDepartamentos = () => {
        setAllowedDepartamentos((prev) => {
            const next = { ...prev };

            for (const dep of departamentos) {
                next[dep.id] = true;
            }

            return next;
        });
    };

    const desmarcarTodosDepartamentos = () => {
        setAllowedDepartamentos((prev) => {
            const next = { ...prev };

            for (const dep of departamentos) {
                next[dep.id] = false;
            }

            return next;
        });
    };

    /* ============================================================
       AÇÕES - FERRAMENTAS IA
       ============================================================ */

    const toggleFerramenta = (key: string) => {
        setAllowedFerramentas((prev) => ({
            ...prev,
            [key]: !prev[key],
        }));
    };

    const marcarTodasFerramentas = () => {
        setAllowedFerramentas((prev) => {
            const next = { ...prev };

            for (const tool of ferramentas) {
                next[tool.key] = true;
            }

            return next;
        });
    };

    const desmarcarTodasFerramentas = () => {
        setAllowedFerramentas((prev) => {
            const next = { ...prev };

            for (const tool of ferramentas) {
                next[tool.key] = false;
            }

            return next;
        });
    };

    /* ============================================================
       SALVAR TUDO
       ============================================================ */

    const save = async () => {
        if (userId == null) return;

        setLoading(true);
        setMsg(null);
        setError(null);

        try {
            const paginasSelecionadas =
                Object.entries(allowed)
                    .filter(([, value]) => value)
                    .map(([key]) => key);

            const departamentosSelecionados =
                Object.entries(allowedDepartamentos)
                    .filter(([, value]) => value)
                    .map(([id]) => Number(id))
                    .filter(
                        (id) =>
                            Number.isFinite(id) &&
                            id > 0,
                    );

            const ferramentasSelecionadas =
                Object.entries(allowedFerramentas)
                    .filter(([, value]) => value)
                    .map(([key]) => key);

            /*
             * Mantemos os três salvamentos independentes.
             * Se um deles falhar, o erro aparece e o usuário
             * pode tentar novamente.
             */
            await safeJsonFetch(
                `${API_URL}?action=save_permissions`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        user_id: userId,
                        permissions:
                            paginasSelecionadas,
                    }),
                },
            );

            await safeJsonFetch(
                `${API_URL}?action=save_user_ia_departamentos`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        user_id: userId,
                        departamentos:
                            departamentosSelecionados,
                    }),
                },
            );

            await safeJsonFetch(
                `${API_URL}?action=save_user_ia_ferramentas`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        user_id: userId,
                        ferramentas:
                            ferramentasSelecionadas,
                    }),
                },
            );

            setMsg(
                "Permissões do sistema e da Aurora salvas!",
            );
        } catch (e: any) {
            setError(
                e?.message ||
                "Erro ao salvar permissões.",
            );
        } finally {
            setLoading(false);
        }
    };

    const currentUser = useMemo(
        () =>
            usuarios.find(
                (u) => u.id === userId,
            ),
        [userId, usuarios],
    );

    const ferramentasPorGrupo = useMemo(() => {
        const groups: Record<
            string,
            FerramentaIA[]
        > = {};

        for (const tool of ferramentas) {
            const group =
                String(tool.grupo || "Outros").trim() ||
                "Outros";

            if (!groups[group]) {
                groups[group] = [];
            }

            groups[group].push(tool);
        }

        return groups;
    }, [ferramentas]);

    /* ============================================================
       RENDER
       ============================================================ */

    return (
        <div className="w-full px-3 sm:px-6 lg:px-10 pt-10 pb-14 md:pt-12 md:pb-16 lg:pt-16 lg:pb-24 font-[var(--font-nunito,_inherit)]">
            <h1 className="text-2xl md:text-3xl font-semibold mb-6 md:mb-8">
                Permissões por usuário
            </h1>

            <div className="rounded-2xl shadow p-4 mb-6">
                <label className="block text-sm mb-1">
                    Usuário
                </label>

                <select
                    className="border rounded-lg px-3 py-2 w-full sm:w-96"
                    value={userId ?? ""}
                    onChange={(e) =>
                        setUserId(
                            e.target.value
                                ? parseInt(
                                    e.target.value,
                                    10,
                                )
                                : null,
                        )
                    }
                >
                    <option value="">
                        Selecione...
                    </option>

                    {usuarios.map((u) => (
                        <option
                            key={u.id}
                            value={u.id}
                        >
                            #{u.id} – {u.nome} (
                            {u.usuario})
                        </option>
                    ))}
                </select>
            </div>

            {userId != null && (
                <div className="space-y-6">
                    {msg && (
                        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">
                            {msg}
                        </div>
                    )}

                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                            {error}
                        </div>
                    )}

                    {/* ====================================================
                        PÁGINAS DO SISTEMA
                        ==================================================== */}
                    <section className="rounded-2xl shadow p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h2 className="text-lg font-medium">
                                    Páginas liberadas
                                </h2>

                                <p className="text-sm text-muted-foreground">
                                    {currentUser?.nome} (
                                    {currentUser?.usuario})
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={
                                        marcarTodasPaginas
                                    }
                                    className="px-3 py-2 rounded-xl border text-sm"
                                    disabled={
                                        loading ||
                                        pages.length === 0
                                    }
                                >
                                    Marcar tudo
                                </button>

                                <button
                                    type="button"
                                    onClick={
                                        desmarcarTodasPaginas
                                    }
                                    className="px-3 py-2 rounded-xl border text-sm"
                                    disabled={
                                        loading ||
                                        pages.length === 0
                                    }
                                >
                                    Desmarcar tudo
                                </button>
                            </div>
                        </div>

                        <ul className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {pages.map((p) => (
                                <li
                                    key={p.key}
                                    className="flex items-center gap-2"
                                >
                                    <input
                                        id={`pg-${p.key}`}
                                        type="checkbox"
                                        checked={
                                            !!allowed[
                                            p.key
                                            ]
                                        }
                                        onChange={() =>
                                            togglePagina(
                                                p.key,
                                            )
                                        }
                                    />

                                    <label
                                        htmlFor={`pg-${p.key}`}
                                    >
                                        {p.label}
                                    </label>
                                </li>
                            ))}

                            {pages.length === 0 && (
                                <li className="text-sm text-muted-foreground col-span-full">
                                    Nenhuma página
                                    disponível.
                                </li>
                            )}
                        </ul>
                    </section>

                    {/* ====================================================
                        CONHECIMENTO DA IA
                        ==================================================== */}
                    <section className="rounded-2xl shadow p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h2 className="text-lg font-medium">
                                    Conhecimento da Aurora
                                </h2>

                                <p className="text-sm text-muted-foreground mt-1">
                                    Marque os
                                    departamentos da Base
                                    de Conhecimento que a
                                    Aurora poderá consultar
                                    para este usuário.
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={
                                        marcarTodosDepartamentos
                                    }
                                    className="px-3 py-2 rounded-xl border text-sm"
                                    disabled={
                                        loading ||
                                        departamentos.length ===
                                        0
                                    }
                                >
                                    Marcar tudo
                                </button>

                                <button
                                    type="button"
                                    onClick={
                                        desmarcarTodosDepartamentos
                                    }
                                    className="px-3 py-2 rounded-xl border text-sm"
                                    disabled={
                                        loading ||
                                        departamentos.length ===
                                        0
                                    }
                                >
                                    Desmarcar tudo
                                </button>
                            </div>
                        </div>

                        <ul className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {departamentos.map(
                                (dep) => (
                                    <li
                                        key={dep.id}
                                        className="rounded-xl border p-3"
                                    >
                                        <div className="flex items-start gap-2">
                                            <input
                                                id={`dep-${dep.id}`}
                                                type="checkbox"
                                                className="mt-1"
                                                checked={
                                                    !!allowedDepartamentos[
                                                    dep.id
                                                    ]
                                                }
                                                onChange={() =>
                                                    toggleDepartamento(
                                                        dep.id,
                                                    )
                                                }
                                            />

                                            <label
                                                htmlFor={`dep-${dep.id}`}
                                                className="cursor-pointer"
                                            >
                                                <span className="block font-medium">
                                                    {
                                                        dep.nome
                                                    }
                                                </span>

                                                {dep.descricao && (
                                                    <span className="block mt-1 text-xs text-muted-foreground">
                                                        {
                                                            dep.descricao
                                                        }
                                                    </span>
                                                )}
                                            </label>
                                        </div>
                                    </li>
                                ),
                            )}

                            {departamentos.length ===
                                0 && (
                                    <li className="text-sm text-muted-foreground col-span-full">
                                        Nenhum departamento da
                                        IA disponível.
                                    </li>
                                )}
                        </ul>
                    </section>

                    {/* ====================================================
                        FUNÇÕES / FERRAMENTAS DA AURORA
                        ==================================================== */}
                    <section className="rounded-2xl shadow p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h2 className="text-lg font-medium">
                                    Funções da Aurora
                                </h2>

                                <p className="text-sm text-muted-foreground mt-1">
                                    Controle quais
                                    consultas e ações a
                                    Aurora poderá executar
                                    para este usuário.
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={
                                        marcarTodasFerramentas
                                    }
                                    className="px-3 py-2 rounded-xl border text-sm"
                                    disabled={
                                        loading ||
                                        ferramentas.length ===
                                        0
                                    }
                                >
                                    Marcar tudo
                                </button>

                                <button
                                    type="button"
                                    onClick={
                                        desmarcarTodasFerramentas
                                    }
                                    className="px-3 py-2 rounded-xl border text-sm"
                                    disabled={
                                        loading ||
                                        ferramentas.length ===
                                        0
                                    }
                                >
                                    Desmarcar tudo
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 space-y-5">
                            {Object.entries(
                                ferramentasPorGrupo,
                            ).map(
                                ([
                                    grupo,
                                    tools,
                                ]) => (
                                    <div key={grupo}>
                                        <h3 className="text-sm font-semibold mb-2">
                                            {grupo}
                                        </h3>

                                        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                            {tools.map(
                                                (
                                                    tool,
                                                ) => (
                                                    <li
                                                        key={
                                                            tool.key
                                                        }
                                                        className="rounded-xl border p-3"
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            <input
                                                                id={`tool-${tool.key}`}
                                                                type="checkbox"
                                                                className="mt-1"
                                                                checked={
                                                                    !!allowedFerramentas[
                                                                    tool
                                                                        .key
                                                                    ]
                                                                }
                                                                onChange={() =>
                                                                    toggleFerramenta(
                                                                        tool.key,
                                                                    )
                                                                }
                                                            />

                                                            <label
                                                                htmlFor={`tool-${tool.key}`}
                                                                className="cursor-pointer"
                                                            >
                                                                <span className="block font-medium">
                                                                    {
                                                                        tool.label
                                                                    }
                                                                </span>

                                                                <span className="mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                                                                    {tool.tipo ===
                                                                        "acao"
                                                                        ? "Ação"
                                                                        : "Consulta"}
                                                                </span>
                                                            </label>
                                                        </div>
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    </div>
                                ),
                            )}

                            {ferramentas.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    Nenhuma função da
                                    Aurora disponível.
                                </p>
                            )}
                        </div>
                    </section>

                    {/* ====================================================
                        SALVAR
                        ==================================================== */}
                    <div className="sticky bottom-3 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="font-medium">
                                    Salvar permissões de{" "}
                                    {currentUser?.nome}
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    Páginas, conhecimento
                                    da IA e funções da
                                    Aurora.
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={save}
                                disabled={loading}
                                className="px-5 py-2.5 rounded-xl bg-black text-white disabled:opacity-50"
                            >
                                {loading
                                    ? "Salvando..."
                                    : "Salvar permissões"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
