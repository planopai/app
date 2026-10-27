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

/* 27/10/2026: grupos de usuários (grupos.php). Cada usuário tem UM grupo; as páginas
   marcadas no usuário são extras e só acrescentam. Só quem tem Gestão altera. */
type Grupo = {
    id: number;
    nome: string;
    slug: string;
    descricao: string;
    ativo: boolean;
    paginas: string[];
    membros: number[];
};

type UsuarioGrupo = {
    id: number;
    nome: string;
    usuario: string;
    cargo: string;
    grupo_id: number | null;
    extras: string[];
};

type Modo = "usuarios" | "grupos";

const API_URL =
    "https://api.planoassistencialintegrado.com.br/pai_api.php";

const GRUPOS_URL =
    "https://api.planoassistencialintegrado.com.br/grupos.php";

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
        if (r.status === 401 || json?.need_login) {
            window.location.href = "/login";
        }
        throw new Error(
            (typeof json?.erro === "string" ? json.erro : "") ||
            json?.msg ||
            `HTTP ${r.status}`,
        );
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
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between dark:border-white/12">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                        {title}
                    </h2>

                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-[#AEB9CF]">
                        {selected} de {total}
                    </span>
                </div>

                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-[#AEB9CF]">
                    {description}
                </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
                <button
                    type="button"
                    onClick={onMarkAll}
                    disabled={disabled || total === 0}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/12 dark:bg-[#232B3F] dark:text-[#D6DCE8] dark:hover:bg-[#1C2334]"
                >
                    Marcar tudo
                </button>

                <button
                    type="button"
                    onClick={onClearAll}
                    disabled={disabled || total === 0}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/12 dark:bg-[#232B3F] dark:text-[#D6DCE8] dark:hover:bg-[#1C2334]"
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
    bloqueado,
}: {
    id: string;
    checked: boolean;
    onChange: () => void;
    title: string;
    description?: string | null;
    badge?: string | null;
    bloqueado?: boolean;
}) {
    return (
        <label
            htmlFor={id}
            className={[
                "group flex items-start gap-3 rounded-2xl border p-4 transition",
                bloqueado ? "cursor-default opacity-80" : "cursor-pointer",
                checked
                    ? "border-slate-900 bg-slate-50 shadow-sm dark:bg-[#1C2334]"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60 dark:border-white/12 dark:bg-[#232B3F] dark:hover:border-white/25 dark:hover:bg-[#1C2334]/60",
            ].join(" ")}
        >
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={onChange}
                disabled={bloqueado}
                className="mt-1 h-4 w-4 shrink-0 accent-black"
            />

            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900 dark:text-white">{title}</span>

                    {badge ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:border-white/12 dark:bg-[#232B3F] dark:text-[#AEB9CF]">
                            {badge}
                        </span>
                    ) : null}
                </div>

                {description ? (
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-[#AEB9CF]">
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

    /* Grupos (27/10/2026) */
    const [modo, setModo] = useState<Modo>("usuarios");
    const [grupos, setGrupos] = useState<Grupo[]>([]);
    const [usuariosGrupo, setUsuariosGrupo] = useState<
        Record<number, UsuarioGrupo>
    >({});
    const [podeEditar, setPodeEditar] = useState(false);
    const [grupoUsuario, setGrupoUsuario] = useState<number | null>(null);
    const [grupoSel, setGrupoSel] = useState<number | "novo" | null>(null);
    const [grupoNome, setGrupoNome] = useState("");
    const [grupoDesc, setGrupoDesc] = useState("");
    const [grupoPags, setGrupoPags] = useState<Record<string, boolean>>({});
    const [buscaUsuario, setBuscaUsuario] = useState("");

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

    const fetchPainel = async () => {
        const j = await safeJsonFetch(
            `${GRUPOS_URL}?action=painel&_=${Date.now()}`,
        );
        const d = j?.dados || {};
        setGrupos(Array.isArray(d.grupos) ? (d.grupos as Grupo[]) : []);
        const mapa: Record<number, UsuarioGrupo> = {};
        if (Array.isArray(d.usuarios)) {
            (d.usuarios as UsuarioGrupo[]).forEach((u) => {
                mapa[u.id] = u;
            });
        }
        setUsuariosGrupo(mapa);
        setPodeEditar(!!d.eu?.pode_editar);
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
                        `${API_URL}?action=list_permissions&user_id=${uid}&somente_extras=1&_=${Date.now()}`,
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
            fetchPainel(),
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

    // Grupo atual do usuário escolhido (vem do grupos.php).
    useEffect(() => {
        setGrupoUsuario(
            userId != null ? usuariosGrupo[userId]?.grupo_id ?? null : null,
        );
    }, [userId, usuariosGrupo]);

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
            Object.fromEntries(
                pages
                    .filter((p) => !paginasDoGrupo.has(p.key))
                    .map((p) => [p.key, true]),
            ) as Record<string, boolean>,
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

            // 27/10/2026: grupo + extras pelo grupos.php (só Gestão). Extra que o grupo já dá não é gravado:
            // o pai_api list_permissions (menu e middleware) já soma grupo + extras.
            if (podeEditar) {
                if (grupoUsuario == null) {
                    throw new Error("Escolha o grupo do usuário.");
                }
                await safeJsonFetch(`${GRUPOS_URL}?action=usuario_salvar`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: userId,
                        grupo_id: grupoUsuario,
                        extras: paginasSelecionadas.filter(
                            (k) => !paginasDoGrupo.has(k),
                        ),
                    }),
                });
            }

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
            await fetchPainel().catch(() => undefined);
        } catch (e: any) {
            setError(e?.message || "Erro ao salvar permissões.");
        } finally {
            setLoading(false);
        }
    };

    /* ---------------------------------------------------------------------- */
    /* Grupos                                                                  */
    /* ---------------------------------------------------------------------- */

    const abrirGrupo = (g: Grupo | "novo") => {
        setMsg(null);
        setError(null);
        if (g === "novo") {
            setGrupoSel("novo");
            setGrupoNome("");
            setGrupoDesc("");
            setGrupoPags({});
            return;
        }
        setGrupoSel(g.id);
        setGrupoNome(g.nome);
        setGrupoDesc(g.descricao || "");
        setGrupoPags(
            Object.fromEntries(g.paginas.map((k) => [k, true])) as Record<
                string,
                boolean
            >,
        );
    };

    const salvarGrupo = async () => {
        if (grupoSel == null) return;
        setLoading(true);
        setMsg(null);
        setError(null);
        try {
            const j = await safeJsonFetch(`${GRUPOS_URL}?action=grupo_salvar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: grupoSel === "novo" ? 0 : grupoSel,
                    nome: grupoNome,
                    descricao: grupoDesc,
                    paginas: Object.entries(grupoPags)
                        .filter(([, v]) => v)
                        .map(([k]) => k),
                }),
            });
            const novoId = Number(j?.dados?.id) || null;
            if (novoId) setGrupoSel(novoId);
            setMsg("Grupo salvo com sucesso.");
            await fetchPainel();
        } catch (e: any) {
            setError(e?.message || "Erro ao salvar o grupo.");
        } finally {
            setLoading(false);
        }
    };

    // 27/10/2026: troca o grupo direto na lista de usuários (as extras continuam).
    const mudarGrupo = async (uid: number, gid: number | null) => {
        if (gid == null) return;
        setLoading(true);
        setMsg(null);
        setError(null);
        try {
            await safeJsonFetch(`${GRUPOS_URL}?action=usuario_grupo`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: uid, grupo_id: gid }),
            });
            setMsg("Grupo alterado.");
            await fetchPainel();
        } catch (e: any) {
            setError(e?.message || "Erro ao alterar o grupo.");
        } finally {
            setLoading(false);
        }
    };

    const alternarAtivoGrupo = async (g: Grupo) => {
        setLoading(true);
        setMsg(null);
        setError(null);
        try {
            await safeJsonFetch(`${GRUPOS_URL}?action=grupo_ativo`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: g.id, ativo: !g.ativo }),
            });
            setMsg(g.ativo ? "Grupo desativado." : "Grupo ativado.");
            await fetchPainel();
        } catch (e: any) {
            setError(e?.message || "Erro ao alterar o grupo.");
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

    const paginasDoGrupo = useMemo(() => {
        const g = grupos.find((x) => x.id === grupoUsuario);
        return new Set<string>(g && g.ativo ? g.paginas : []);
    }, [grupos, grupoUsuario]);

    const grupoAtual = useMemo(
        () =>
            typeof grupoSel === "number"
                ? grupos.find((g) => g.id === grupoSel) ?? null
                : null,
        [grupos, grupoSel],
    );

    const usuariosFiltrados = useMemo(() => {
        const q = buscaUsuario
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
        if (!q) return usuarios;
        return usuarios.filter((u) =>
            `${u.nome} ${u.usuario}`
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .includes(q),
        );
    }, [usuarios, buscaUsuario]);

    const nomeGrupo = (gid: number | null | undefined) =>
        grupos.find((g) => g.id === gid)?.nome ?? "Sem grupo";

    const nomeUsuario = (id: number) => {
        const u = usuariosGrupo[id] || usuarios.find((x) => x.id === id);
        return u ? u.nome || u.usuario : `#${id}`;
    };

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
        () =>
            pages.filter((p) => paginasDoGrupo.has(p.key) || allowed[p.key])
                .length,
        [allowed, pages, paginasDoGrupo],
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
        <div className="min-h-screen bg-slate-50 dark:bg-[#1C2334]">
            <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
                {/* Cabeçalho */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl dark:text-white">
                        {modo === "grupos"
                            ? "Permissões por grupo"
                            : "Permissões por usuário"}
                    </h1>

                    <p className="mt-1 text-sm text-slate-500 dark:text-[#AEB9CF]">
                        Cada usuário pertence a um grupo, que libera as páginas do
                        grupo. Páginas extras marcadas no usuário só acrescentam.
                        {podeEditar
                            ? ""
                            : " Só quem tem Gestão altera grupos e páginas."}
                    </p>

                    <div className="mt-4 inline-flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/12 dark:bg-[#232B3F]">
                        {(
                            [
                                ["usuarios", "Usuários"],
                                ["grupos", "Grupos"],
                            ] as Array<[Modo, string]>
                        ).map(([k, label]) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => {
                                    setModo(k);
                                    setMsg(null);
                                    setError(null);
                                }}
                                className={[
                                    "min-h-[44px] rounded-xl px-4 text-sm font-semibold transition",
                                    modo === k
                                        ? "bg-slate-950 text-white shadow-sm dark:bg-[#3D6A99]"
                                        : "text-slate-600 hover:bg-slate-100 dark:text-[#AEB9CF] dark:hover:bg-white/10",
                                ].join(" ")}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>


                {/* Alertas */}
                {msg ? (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#B3CE52]">
                        {msg}
                    </div>
                ) : null}

                {error ? (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                        {error}
                    </div>
                ) : null}

                {modo === "grupos" ? (
                    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/12 dark:bg-[#232B3F]">
                            {podeEditar ? (
                                <button
                                    type="button"
                                    onClick={() => abrirGrupo("novo")}
                                    className="mb-3 min-h-[44px] w-full rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]"
                                >
                                    Novo grupo
                                </button>
                            ) : null}
                            <div className="space-y-2">
                                {grupos.map((g) => (
                                    <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => abrirGrupo(g)}
                                        className={[
                                            "flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
                                            grupoSel === g.id
                                                ? "border-slate-900 bg-slate-50 dark:border-[#3D6A99] dark:bg-[#3D6A99]/20"
                                                : "border-slate-200 hover:bg-slate-50 dark:border-white/12 dark:hover:bg-[#1C2334]",
                                        ].join(" ")}
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate font-semibold text-slate-900 dark:text-white">
                                                {g.nome}
                                            </span>
                                            <span className="block text-xs text-slate-500 dark:text-[#AEB9CF]">
                                                {g.membros.length} membro(s) ·{" "}
                                                {g.paginas.length} página(s)
                                            </span>
                                        </span>
                                        {!g.ativo ? (
                                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-white/10 dark:text-[#AEB9CF]">
                                                Inativo
                                            </span>
                                        ) : null}
                                    </button>
                                ))}
                                {grupos.length === 0 ? (
                                    <p className="px-1 py-4 text-sm text-slate-500 dark:text-[#AEB9CF]">
                                        Nenhum grupo cadastrado.
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        {grupoSel == null ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-white/25 dark:bg-[#232B3F]">
                                <div className="text-base font-semibold text-slate-800 dark:text-white">
                                    Selecione um grupo
                                </div>
                                <p className="mt-1 text-sm text-slate-500 dark:text-[#AEB9CF]">
                                    As páginas e os membros do grupo serão exibidos aqui.
                                </p>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6 dark:border-white/12 dark:bg-[#232B3F]">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-[#D6DCE8]">
                                            Nome do grupo
                                        </label>
                                        <input
                                            value={grupoNome}
                                            onChange={(e) =>
                                                setGrupoNome(e.target.value)
                                            }
                                            disabled={!podeEditar}
                                            maxLength={80}
                                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[16px] text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60 dark:border-white/25 dark:bg-[#232B3F] dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-[#D6DCE8]">
                                            Descrição
                                        </label>
                                        <input
                                            value={grupoDesc}
                                            onChange={(e) =>
                                                setGrupoDesc(e.target.value)
                                            }
                                            disabled={!podeEditar}
                                            maxLength={255}
                                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[16px] text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60 dark:border-white/25 dark:bg-[#232B3F] dark:text-white"
                                        />
                                    </div>
                                </div>

                                {grupoAtual ? (
                                    <div className="mt-5">
                                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-[#AEB9CF]">
                                            Membros ({grupoAtual.membros.length})
                                        </h3>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-[#AEB9CF]">
                                            Para mudar alguém de grupo, use a aba Usuários.
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {grupoAtual.membros.map((id) => (
                                                <span
                                                    key={id}
                                                    className="rounded-full bg-[#E9EFF6] px-3 py-1 text-xs font-medium text-[#313C55] dark:bg-[#3D6A99]/30 dark:text-white"
                                                >
                                                    {nomeUsuario(id)}
                                                </span>
                                            ))}
                                            {grupoAtual.membros.length === 0 ? (
                                                <span className="text-xs text-slate-500 dark:text-[#AEB9CF]">
                                                    Nenhum membro.
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                ) : null}

                                <div className="mt-6">
                                    <SectionHeader
                                        title="Páginas do grupo"
                                        description="Todos os membros do grupo acessam estas páginas. A página Gestão dá o poder de alterar grupos e permissões."
                                        selected={
                                            Object.values(grupoPags).filter(Boolean)
                                                .length
                                        }
                                        total={pages.length}
                                        onMarkAll={() =>
                                            setGrupoPags(
                                                Object.fromEntries(
                                                    pages.map((p) => [p.key, true]),
                                                ) as Record<string, boolean>,
                                            )
                                        }
                                        onClearAll={() => setGrupoPags({})}
                                        disabled={loading || !podeEditar}
                                    />
                                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {pages.map((p) => (
                                            <PermissionCard
                                                key={p.key}
                                                id={`gpg-${p.key}`}
                                                checked={!!grupoPags[p.key]}
                                                onChange={() =>
                                                    setGrupoPags((prev) => ({
                                                        ...prev,
                                                        [p.key]: !prev[p.key],
                                                    }))
                                                }
                                                title={p.label}
                                                bloqueado={!podeEditar}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {podeEditar ? (
                                    <div className="sticky bottom-0 z-20 mt-5 bg-slate-50 py-3 dark:bg-[#1C2334]">
                                        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-end dark:border-white/12 dark:bg-[#232B3F]">
                                            {grupoAtual ? (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        alternarAtivoGrupo(grupoAtual)
                                                    }
                                                    disabled={loading}
                                                    className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/12 dark:bg-[#232B3F] dark:text-[#D6DCE8] dark:hover:bg-[#1C2334]"
                                                >
                                                    {grupoAtual.ativo
                                                        ? "Desativar grupo"
                                                        : "Ativar grupo"}
                                                </button>
                                            ) : null}
                                            <button
                                                type="button"
                                                onClick={salvarGrupo}
                                                disabled={loading}
                                                className="min-h-[44px] rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#3D6A99] dark:hover:bg-[#355D86]"
                                            >
                                                {loading ? "Salvando..." : "Salvar grupo"}
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                        {/* Lista de usuários com o grupo de cada um (27/10/2026) */}
                        <div className="self-start rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/12 dark:bg-[#232B3F]">
                            <input
                                value={buscaUsuario}
                                onChange={(e) => setBuscaUsuario(e.target.value)}
                                placeholder="Buscar usuário"
                                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-[16px] text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 dark:border-white/25 dark:bg-[#1C2334] dark:text-white"
                            />
                            <div className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                                {usuariosFiltrados.map((u) => {
                                    const gid = usuariosGrupo[u.id]?.grupo_id ?? null;
                                    return (
                                        <div
                                            key={u.id}
                                            className={[
                                                "flex items-center gap-2 rounded-xl border px-3 py-2 transition",
                                                userId === u.id
                                                    ? "border-slate-900 bg-slate-50 dark:border-[#3D6A99] dark:bg-[#3D6A99]/20"
                                                    : "border-slate-200 dark:border-white/12",
                                            ].join(" ")}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setUserId(u.id)}
                                                className="min-h-[44px] min-w-0 flex-1 text-left"
                                            >
                                                <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                                                    {u.nome}
                                                </span>
                                                <span className="block truncate text-xs text-slate-500 dark:text-[#AEB9CF]">
                                                    @{u.usuario}
                                                </span>
                                            </button>
                                            <select
                                                aria-label={`Grupo de ${u.nome}`}
                                                value={gid ?? ""}
                                                disabled={!podeEditar || loading}
                                                onChange={(e) =>
                                                    mudarGrupo(
                                                        u.id,
                                                        e.target.value
                                                            ? parseInt(e.target.value, 10)
                                                            : null,
                                                    )
                                                }
                                                className="min-h-[40px] w-40 shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:opacity-60 dark:border-white/25 dark:bg-[#1C2334] dark:text-white"
                                            >
                                                <option value="">Sem grupo</option>
                                                {grupos
                                                    .filter((g) => g.ativo || g.id === gid)
                                                    .map((g) => (
                                                        <option key={g.id} value={g.id}>
                                                            {g.nome}
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>
                                    );
                                })}
                                {usuariosFiltrados.length === 0 ? (
                                    <p className="px-1 py-4 text-sm text-slate-500 dark:text-[#AEB9CF]">
                                        Nenhum usuário encontrado.
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        <div className="min-w-0">
                {!userId ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-white/25 dark:bg-[#232B3F]">
                        <div className="text-base font-semibold text-slate-800 dark:text-white">
                            Selecione um usuário
                        </div>
                        <p className="mt-1 text-sm text-slate-500 dark:text-[#AEB9CF]">
                            As permissões serão exibidas aqui.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-white/12 dark:bg-[#232B3F]">
                            <span className="font-semibold text-slate-900 dark:text-white">
                                {currentUser?.nome}
                            </span>
                            <span className="text-slate-500 dark:text-[#AEB9CF]">
                                {" "}
                                · @{currentUser?.usuario} · Grupo: {nomeGrupo(grupoUsuario)}
                            </span>
                        </div>

                        {/* Navegação */}
                        <div className="mb-4 overflow-x-auto">
                            <div className="inline-flex min-w-full gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm md:min-w-0 dark:border-white/12 dark:bg-[#232B3F]">
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
                                                    : "text-slate-600 hover:bg-slate-100 dark:text-[#AEB9CF] dark:hover:bg-white/10",
                                            ].join(" ")}
                                        >
                                            {item.label}

                                            <span
                                                className={[
                                                    "rounded-full px-2 py-0.5 text-[11px]",
                                                    active
                                                        ? "bg-white/15 text-white"
                                                        : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-[#AEB9CF]",
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
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6 dark:border-white/12 dark:bg-[#232B3F]">
                            {aba === "paginas" ? (
                                <>
                                    <SectionHeader
                                        title="Páginas do sistema"
                                        description="As páginas marcadas como Do grupo vêm do grupo do usuário. As demais marcadas são extras deste usuário e só acrescentam."
                                        selected={paginasMarcadas}
                                        total={pages.length}
                                        onMarkAll={marcarTodasPaginas}
                                        onClearAll={desmarcarTodasPaginas}
                                        disabled={loading || !podeEditar}
                                    />

                                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {pages.map((p) => {
                                            const doGrupo = paginasDoGrupo.has(
                                                p.key,
                                            );
                                            return (
                                                <PermissionCard
                                                    key={p.key}
                                                    id={`pg-${p.key}`}
                                                    checked={
                                                        doGrupo || !!allowed[p.key]
                                                    }
                                                    onChange={() =>
                                                        togglePagina(p.key)
                                                    }
                                                    title={p.label}
                                                    badge={
                                                        doGrupo
                                                            ? "Do grupo"
                                                            : allowed[p.key]
                                                              ? "Extra"
                                                              : null
                                                    }
                                                    bloqueado={
                                                        doGrupo || !podeEditar
                                                    }
                                                />
                                            );
                                        })}
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
                                                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-[#AEB9CF]">
                                                        {grupo}
                                                    </h3>
                                                    <div className="h-px flex-1 bg-slate-200 dark:bg-white/15" />
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
                        <div className="sticky bottom-0 z-20 mt-5 bg-slate-50 py-3 dark:bg-[#1C2334]">
                            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between dark:border-white/12 dark:bg-[#232B3F]">
                                <div className="min-w-0">
                                    <div className="font-semibold text-slate-900 dark:text-white">
                                        {currentUser?.nome}
                                    </div>

                                    <div className="mt-0.5 text-xs text-slate-500 dark:text-[#AEB9CF]">
                                        {paginasMarcadas} páginas ·{" "}
                                        {departamentosMarcados} departamentos IA ·{" "}
                                        {ferramentasMarcadas} funções Aurora
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={save}
                                    disabled={loading}
                                    className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#3D6A99] dark:hover:bg-[#355D86]"
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
                )}
            </div>
        </div>
    );
}
