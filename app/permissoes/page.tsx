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

type Aba = "paginas" | "conhecimento" | "ferramentas";

const API_URL =
    "https://api.planoassistencialintegrado.com.br/pai_api.php";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

async function safeJsonFetch(input: RequestInfo, init?: RequestInit) {
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
        throw new Error(json?.erro || json?.msg || `HTTP ${r.status}`);
    }

    return json;
}

function SectionHeader({
    title,
    description,
    selected,
    total,
    onMarkAll,
    onClearAll,
    disabled,
}: {
    title: string;
    description: string;
    selected: number;
    total: number;
    onMarkAll: () => void;
    onClearAll: () => void;
    disabled?: boolean;
}) {
    return (
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-950">
                        {title}
                    </h2>

                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {selected} de {total}
                    </span>
                </div>

                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                    {description}
                </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
                <button
                    type="button"
                    onClick={onMarkAll}
                    disabled={disabled || total === 0}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Marcar tudo
                </button>

                <button
                    type="button"
                    onClick={onClearAll}
                    disabled={disabled || total === 0}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Desmarcar tudo
                </button>
            </div>
        </div>
    );
}

function PermissionCard({
    id,
    checked,
    onChange,
    title,
    description,
    badge,
}: {
    id: string;
    checked: boolean;
    onChange: () => void;
    title: string;
    description?: string | null;
    badge?: string | null;
}) {
    return (
        <label
            htmlFor={id}
            className={[
                "group flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition",
                checked
                    ? "border-slate-900 bg-slate-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60",
            ].join(" ")}
        >
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={onChange}
                className="mt-1 h-4 w-4 shrink-0 accent-black"
            />

            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{title}</span>

                    {badge ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            {badge}
                        </span>
                    ) : null}
                </div>

                {description ? (
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                        {description}
                    </p>
                ) : null}
            </div>
        </label>
    );
}

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

export default function PermissoesPage() {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [pages, setPages] = useState<Pagina[]>([]);
    const [departamentos, setDepartamentos] = useState<DepartamentoIA[]>([]);
    const [ferramentas, setFerramentas] = useState<FerramentaIA[]>([]);

    const [userId, setUserId] = useState<number | null>(null);
    const [aba, setAba] = useState<Aba>("paginas");

    const [allowed, setAllowed] = useState<Record<string, boolean>>({});
    const [allowedDepartamentos, setAllowedDepartamentos] = useState<
        Record<number, boolean>
    >({});
    const [allowedFerramentas, setAllowedFerramentas] = useState<
        Record<string, boolean>
    >({});

    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    /* ---------------------------------------------------------------------- */
    /* Carregamento inicial                                                   */
    /* ---------------------------------------------------------------------- */

    const fetchUsuarios = async () => {
        const j = await safeJsonFetch(
            `${API_URL}?action=list_users&_=${Date.now()}`,
        );
        setUsuarios(Array.isArray(j) ? (j as Usuario[]) : []);
    };

    const fetchPages = async () => {
        const j = await safeJsonFetch(
            `${API_URL}?action=list_pages&_=${Date.now()}`,
        );
        setPages(Array.isArray(j) ? (j as Pagina[]) : []);
    };

    const fetchDepartamentos = async () => {
        const j = await safeJsonFetch(
            `${API_URL}?action=list_ia_departamentos&_=${Date.now()}`,
        );
        setDepartamentos(Array.isArray(j) ? (j as DepartamentoIA[]) : []);
    };

    const fetchFerramentas = async () => {
        const j = await safeJsonFetch(
            `${API_URL}?action=list_ia_ferramentas&_=${Date.now()}`,
        );
        setFerramentas(Array.isArray(j) ? (j as FerramentaIA[]) : []);
    };

    const fetchPermsUsuario = async (uid: number) => {
        setLoading(true);
        setError(null);
        setMsg(null);

        try {
            const [paginasJson, departamentosJson, ferramentasJson] =
                await Promise.all([
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

            const paginasSet: Record<string, boolean> = {};
            if (Array.isArray(paginasJson)) {
                paginasJson.forEach((key: unknown) => {
                    if (typeof key === "string") paginasSet[key] = true;
                });
            }

            const departamentosSet: Record<number, boolean> = {};
            if (Array.isArray(departamentosJson)) {
                departamentosJson.forEach((id: unknown) => {
                    const n = Number(id);
                    if (Number.isFinite(n) && n > 0) {
                        departamentosSet[n] = true;
                    }
                });
            }

            const ferramentasSet: Record<string, boolean> = {};
            if (Array.isArray(ferramentasJson)) {
                ferramentasJson.forEach((key: unknown) => {
                    if (typeof key === "string") ferramentasSet[key] = true;
                });
            }

            setAllowed(paginasSet);
            setAllowedDepartamentos(departamentosSet);
            setAllowedFerramentas(ferramentasSet);
        } catch (e: any) {
            setAllowed({});
            setAllowedDepartamentos({});
            setAllowedFerramentas({});
            setError(
                e?.message || "Erro ao carregar permissões do usuário.",
            );
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
        ])
            .catch((e: any) => {
                setError(
                    e?.message || "Erro ao carregar dados de permissões.",
                );
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (userId != null) {
            void fetchPermsUsuario(userId);
        } else {
            setAllowed({});
            setAllowedDepartamentos({});
            setAllowedFerramentas({});
            setMsg(null);
            setError(null);
        }
    }, [userId]);

    /* ---------------------------------------------------------------------- */
    /* Ações                                                                   */
    /* ---------------------------------------------------------------------- */

    const togglePagina = (key: string) => {
        setAllowed((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleDepartamento = (id: number) => {
        setAllowedDepartamentos((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const toggleFerramenta = (key: string) => {
        setAllowedFerramentas((prev) => ({
            ...prev,
            [key]: !prev[key],
        }));
    };

    const marcarTodasPaginas = () => {
        setAllowed(
            Object.fromEntries(pages.map((p) => [p.key, true])) as Record<
                string,
                boolean
            >,
        );
    };

    const desmarcarTodasPaginas = () => {
        setAllowed({});
    };

    const marcarTodosDepartamentos = () => {
        setAllowedDepartamentos(
            Object.fromEntries(
                departamentos.map((dep) => [dep.id, true]),
            ) as Record<number, boolean>,
        );
    };

    const desmarcarTodosDepartamentos = () => {
        setAllowedDepartamentos({});
    };

    const marcarTodasFerramentas = () => {
        setAllowedFerramentas(
            Object.fromEntries(
                ferramentas.map((tool) => [tool.key, true]),
            ) as Record<string, boolean>,
        );
    };

    const desmarcarTodasFerramentas = () => {
        setAllowedFerramentas({});
    };

    const save = async () => {
        if (userId == null) return;

        setLoading(true);
        setMsg(null);
        setError(null);

        try {
            const paginasSelecionadas = Object.entries(allowed)
                .filter(([, value]) => value)
                .map(([key]) => key);

            const departamentosSelecionados = Object.entries(
                allowedDepartamentos,
            )
                .filter(([, value]) => value)
                .map(([id]) => Number(id))
                .filter((id) => Number.isFinite(id) && id > 0);

            const ferramentasSelecionadas = Object.entries(allowedFerramentas)
                .filter(([, value]) => value)
                .map(([key]) => key);

            await safeJsonFetch(`${API_URL}?action=save_permissions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    permissions: paginasSelecionadas,
                }),
            });

            await safeJsonFetch(
                `${API_URL}?action=save_user_ia_departamentos`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: userId,
                        departamentos: departamentosSelecionados,
                    }),
                },
            );

            await safeJsonFetch(
                `${API_URL}?action=save_user_ia_ferramentas`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: userId,
                        ferramentas: ferramentasSelecionadas,
                    }),
                },
            );

            setMsg("Permissões salvas com sucesso.");
        } catch (e: any) {
            setError(e?.message || "Erro ao salvar permissões.");
        } finally {
            setLoading(false);
        }
    };

    /* ---------------------------------------------------------------------- */
    /* Dados derivados                                                         */
    /* ---------------------------------------------------------------------- */

    const currentUser = useMemo(
        () => usuarios.find((u) => u.id === userId),
        [userId, usuarios],
    );

    const ferramentasPorGrupo = useMemo(() => {
        const groups: Record<string, FerramentaIA[]> = {};

        for (const tool of ferramentas) {
            const group = String(tool.grupo || "Outros").trim() || "Outros";
            if (!groups[group]) groups[group] = [];
            groups[group].push(tool);
        }

        return groups;
    }, [ferramentas]);

    const paginasMarcadas = useMemo(
        () => Object.values(allowed).filter(Boolean).length,
        [allowed],
    );

    const departamentosMarcados = useMemo(
        () => Object.values(allowedDepartamentos).filter(Boolean).length,
        [allowedDepartamentos],
    );

    const ferramentasMarcadas = useMemo(
        () => Object.values(allowedFerramentas).filter(Boolean).length,
        [allowedFerramentas],
    );

    const abas: Array<{
        key: Aba;
        label: string;
        count: number;
        total: number;
    }> = [
            {
                key: "paginas",
                label: "Páginas",
                count: paginasMarcadas,
                total: pages.length,
            },
            {
                key: "conhecimento",
                label: "Conhecimento IA",
                count: departamentosMarcados,
                total: departamentos.length,
            },
            {
                key: "ferramentas",
                label: "Funções Aurora",
                count: ferramentasMarcadas,
                total: ferramentas.length,
            },
        ];

    /* ---------------------------------------------------------------------- */
    /* Render                                                                  */
    /* ---------------------------------------------------------------------- */

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
                {/* Cabeçalho */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
                        Permissões por usuário
                    </h1>

                    <p className="mt-1 text-sm text-slate-500">
                        Controle o acesso ao sistema, ao conhecimento da Aurora e
                        às funções disponíveis no chat.
                    </p>
                </div>

                {/* Usuário */}
                <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="w-full max-w-xl">
                            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                                Usuário
                            </label>

                            <select
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                                value={userId ?? ""}
                                onChange={(e) =>
                                    setUserId(
                                        e.target.value
                                            ? parseInt(e.target.value, 10)
                                            : null,
                                    )
                                }
                            >
                                <option value="">Selecione um usuário...</option>

                                {usuarios.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        #{u.id} — {u.nome} ({u.usuario})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {currentUser ? (
                            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                                <div className="font-semibold text-slate-900">
                                    {currentUser.nome}
                                </div>
                                <div className="text-slate-500">
                                    @{currentUser.usuario} · ID #{currentUser.id}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Alertas */}
                {msg ? (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                        {msg}
                    </div>
                ) : null}

                {error ? (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                ) : null}

                {!userId ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
                        <div className="text-base font-semibold text-slate-800">
                            Selecione um usuário
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                            As permissões serão exibidas aqui.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Navegação */}
                        <div className="mb-4 overflow-x-auto">
                            <div className="inline-flex min-w-full gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm md:min-w-0">
                                {abas.map((item) => {
                                    const active = aba === item.key;

                                    return (
                                        <button
                                            key={item.key}
                                            type="button"
                                            onClick={() => setAba(item.key)}
                                            className={[
                                                "flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                                                active
                                                    ? "bg-slate-950 text-white shadow-sm"
                                                    : "text-slate-600 hover:bg-slate-100",
                                            ].join(" ")}
                                        >
                                            {item.label}

                                            <span
                                                className={[
                                                    "rounded-full px-2 py-0.5 text-[11px]",
                                                    active
                                                        ? "bg-white/15 text-white"
                                                        : "bg-slate-100 text-slate-500",
                                                ].join(" ")}
                                            >
                                                {item.count}/{item.total}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Conteúdo */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
                            {aba === "paginas" ? (
                                <>
                                    <SectionHeader
                                        title="Páginas do sistema"
                                        description="Defina quais páginas este usuário poderá acessar no painel."
                                        selected={paginasMarcadas}
                                        total={pages.length}
                                        onMarkAll={marcarTodasPaginas}
                                        onClearAll={desmarcarTodasPaginas}
                                        disabled={loading}
                                    />

                                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {pages.map((p) => (
                                            <PermissionCard
                                                key={p.key}
                                                id={`pg-${p.key}`}
                                                checked={!!allowed[p.key]}
                                                onChange={() =>
                                                    togglePagina(p.key)
                                                }
                                                title={p.label}
                                            />
                                        ))}
                                    </div>
                                </>
                            ) : null}

                            {aba === "conhecimento" ? (
                                <>
                                    <SectionHeader
                                        title="Conhecimento da Aurora"
                                        description="Selecione quais departamentos da Base de Conhecimento podem ser utilizados nas respostas deste usuário."
                                        selected={departamentosMarcados}
                                        total={departamentos.length}
                                        onMarkAll={marcarTodosDepartamentos}
                                        onClearAll={
                                            desmarcarTodosDepartamentos
                                        }
                                        disabled={loading}
                                    />

                                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {departamentos.map((dep) => (
                                            <PermissionCard
                                                key={dep.id}
                                                id={`dep-${dep.id}`}
                                                checked={
                                                    !!allowedDepartamentos[
                                                    dep.id
                                                    ]
                                                }
                                                onChange={() =>
                                                    toggleDepartamento(dep.id)
                                                }
                                                title={dep.nome}
                                                description={dep.descricao}
                                                badge="Conhecimento"
                                            />
                                        ))}
                                    </div>
                                </>
                            ) : null}

                            {aba === "ferramentas" ? (
                                <>
                                    <SectionHeader
                                        title="Funções da Aurora"
                                        description="Defina quais consultas e ações a Aurora poderá executar para este usuário."
                                        selected={ferramentasMarcadas}
                                        total={ferramentas.length}
                                        onMarkAll={marcarTodasFerramentas}
                                        onClearAll={
                                            desmarcarTodasFerramentas
                                        }
                                        disabled={loading}
                                    />

                                    <div className="mt-5 space-y-6">
                                        {Object.entries(
                                            ferramentasPorGrupo,
                                        ).map(([grupo, tools]) => (
                                            <div key={grupo}>
                                                <div className="mb-3 flex items-center gap-2">
                                                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                                                        {grupo}
                                                    </h3>
                                                    <div className="h-px flex-1 bg-slate-200" />
                                                </div>

                                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                                    {tools.map((tool) => (
                                                        <PermissionCard
                                                            key={tool.key}
                                                            id={`tool-${tool.key}`}
                                                            checked={
                                                                !!allowedFerramentas[
                                                                tool.key
                                                                ]
                                                            }
                                                            onChange={() =>
                                                                toggleFerramenta(
                                                                    tool.key,
                                                                )
                                                            }
                                                            title={tool.label}
                                                            badge={
                                                                tool.tipo ===
                                                                    "acao"
                                                                    ? "Ação"
                                                                    : "Consulta"
                                                            }
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : null}
                        </div>

                        {/* Rodapé fixo */}
                        <div className="sticky bottom-3 z-20 mt-5">
                            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur md:flex-row md:items-center md:justify-between">
                                <div className="min-w-0">
                                    <div className="font-semibold text-slate-900">
                                        {currentUser?.nome}
                                    </div>

                                    <div className="mt-0.5 text-xs text-slate-500">
                                        {paginasMarcadas} páginas ·{" "}
                                        {departamentosMarcados} departamentos IA ·{" "}
                                        {ferramentasMarcadas} funções Aurora
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={save}
                                    disabled={loading}
                                    className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {loading
                                        ? "Salvando..."
                                        : "Salvar permissões"}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
