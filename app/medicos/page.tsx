// src/app/(admin)/consultas/admin/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Nunito } from "next/font/google";

/* ===== Fonte Nunito ===== */
const nunito = Nunito({
    subsets: ["latin"],
    weight: ["400", "600", "700", "800"],
});

/* ================= Tipos compartilhados ================= */
type Categoria =
    | "CARDIOLOGISTA"
    | "FISIOTERAPEUTA"
    | "GINECOLOGISTA"
    | "NUTRICIONISTA"
    | "ODONTOLOGISTA"
    | "OTORRINO"
    | "PEDIATRA"
    | "PSICÓLOGO"
    | "PSICOPEDAGOGO"
    | "PSIQUIATRA"
    | "CLÍNICAS"
    | "LABORATÓRIOS";

const CATEGORIAS: Categoria[] = [
    "CARDIOLOGISTA",
    "FISIOTERAPEUTA",
    "GINECOLOGISTA",
    "NUTRICIONISTA",
    "ODONTOLOGISTA",
    "OTORRINO",
    "PEDIATRA",
    "PSICÓLOGO",
    "PSICOPEDAGOGO",
    "PSIQUIATRA",
    "CLÍNICAS",
    "LABORATÓRIOS",
];

type ApiConsulta = {
    id: number;
    nome: string;
    categoria: Categoria;
    especialidade?: string | null;
    descricao?: string | null;
    unidade?: string | null;
    endereco: string;
    cep?: string | null;
    mapa_url?: string | null;
    whatsapp?: string | null; // só dígitos (ex.: 5511999998888)
    telefone?: string | null; // só dígitos
    instagram?: string | null; // url completa ou @handle
    site?: string | null;
    ativo: 0 | 1 | boolean;
    created_at?: string;
    updated_at?: string;
};

type ApiListOk = { ok: true; items: ApiConsulta[] };
type ApiOk = { ok: true } & Record<string, unknown>;
type ApiErr = { ok: false; error: string };

function isApiConsulta(v: unknown): v is ApiConsulta {
    if (typeof v !== "object" || v === null) return false;
    const o = v as Record<string, unknown>;
    return (
        typeof o.id === "number" &&
        typeof o.nome === "string" &&
        typeof o.endereco === "string" &&
        typeof o.categoria === "string"
    );
}
function isApiListOk(v: unknown): v is ApiListOk {
    if (typeof v !== "object" || v === null) return false;
    const o = v as Record<string, unknown>;
    if (o.ok !== true) return false;
    if (!Array.isArray(o.items)) return false;
    return o.items.every(isApiConsulta);
}

/* ================= Helpers ================= */
function cleanDigits(s: string): string {
    return s.replace(/\D+/g, "");
}

/* ================= Form State ================= */
type FormState = {
    id?: number; // presente somente em edição
    nome: string;
    categoria: Categoria;
    especialidade: string;
    descricao: string;
    unidade: string;
    endereco: string;
    cep: string;
    mapa_url: string;
    whatsapp: string;
    telefone: string;
    instagram: string;
    site: string;
    ativo: boolean;
};

function fromApiToForm(x: ApiConsulta): FormState {
    return {
        id: x.id,
        nome: x.nome ?? "",
        categoria: x.categoria,
        especialidade: x.especialidade ?? "",
        descricao: x.descricao ?? "",
        unidade: x.unidade ?? "",
        endereco: x.endereco ?? "",
        cep: x.cep ?? "",
        mapa_url: x.mapa_url ?? "",
        whatsapp: x.whatsapp ?? "",
        telefone: x.telefone ?? "",
        instagram: x.instagram ?? "",
        site: x.site ?? "",
        ativo: typeof x.ativo === "boolean" ? x.ativo : x.ativo === 1,
    };
}

function emptyForm(): FormState {
    return {
        nome: "",
        categoria: "CLÍNICAS",
        especialidade: "",
        descricao: "",
        unidade: "",
        endereco: "",
        cep: "",
        mapa_url: "",
        whatsapp: "",
        telefone: "",
        instagram: "",
        site: "",
        ativo: true,
    };
}

/* ================== Modal de Form (Create/Update) ================== */
function EditModal({
    initial,
    onCancel,
    onSaved,
}: {
    initial: FormState;
    onCancel: () => void;
    onSaved: () => void;
}) {
    const [model, setModel] = useState<FormState>(initial);
    const [saving, setSaving] = useState(false);
    const isEdit = typeof initial.id === "number";

    function set<K extends keyof FormState>(key: K, val: FormState[K]) {
        setModel((m) => ({ ...m, [key]: val }));
    }

    const canSave = useMemo(() => {
        return (
            model.nome.trim() !== "" &&
            model.endereco.trim() !== "" &&
            CATEGORIAS.includes(model.categoria)
        );
    }, [model]);

    async function save() {
        if (!canSave || saving) return;
        setSaving(true);
        try {
            const payload = {
                nome: model.nome.trim(),
                categoria: model.categoria,
                especialidade: model.especialidade.trim() || null,
                descricao: model.descricao.trim() || null,
                unidade: model.unidade.trim() || null,
                endereco: model.endereco.trim(),
                cep: model.cep.trim() || null,
                mapa_url: model.mapa_url.trim() || null,
                whatsapp: model.whatsapp ? cleanDigits(model.whatsapp) : null,
                telefone: model.telefone ? cleanDigits(model.telefone) : null,
                instagram: model.instagram.trim() || null,
                site: model.site.trim() || null,
                ativo: model.ativo ? 1 : 0,
            };

            const url = isEdit ? `/api/consultas?id=${model.id}` : "/api/consultas";
            const method = isEdit ? "PUT" : "POST";

            const r = await fetch(url, {
                method,
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            });
            const raw: unknown = await r.json();
            if (!r.ok) {
                const msg = (raw as ApiErr | undefined)?.error || "Falha ao salvar.";
                throw new Error(msg);
            }
            const ok = (raw as ApiOk).ok === true;
            if (!ok) {
                const msg =
                    (raw as ApiErr | undefined)?.error || "Resposta inválida do servidor.";
                throw new Error(msg);
            }
            onSaved();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    async function removeInsideModal() {
        if (!isEdit || !model.id) return;
        const ok = confirm("Tem certeza que deseja excluir este registro?");
        if (!ok) return;
        try {
            setSaving(true);
            const r = await fetch(`/api/consultas?id=${model.id}`, { method: "DELETE" });
            const raw: unknown = await r.json();
            if (!r.ok || (raw as ApiOk).ok !== true) {
                const msg = (raw as ApiErr | undefined)?.error || "Falha ao excluir.";
                throw new Error(msg);
            }
            onSaved(); // fecha no pai e recarrega
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    // Fechar com ESC e click fora
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onCancel]);

    return (
        <div
            className="fixed inset-0 z-[100] grid place-items-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => {
                if (e.target === e.currentTarget) onCancel();
            }}
            role="dialog"
            aria-modal="true"
        >
            <div
                className={`w-full max-w-3xl rounded-2xl border border-gray-200/70 bg-white/95 p-6 shadow-2xl dark:border-gray-800/60 dark:bg-gray-900/90 ${nunito.className}`}
            >
                <div className="mb-4 flex items-start justify-between gap-3">
                    <h2 className="text-lg font-extrabold text-gray-900 dark:text-gray-100">
                        {isEdit ? "Editar consulta" : "Nova consulta"}
                    </h2>
                    <div className="flex gap-2">
                        <button
                            onClick={onCancel}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            disabled={saving}
                        >
                            Fechar
                        </button>
                        <button
                            onClick={save}
                            disabled={!canSave || saving}
                            className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white ${canSave
                                    ? "bg-emerald-600 hover:brightness-110"
                                    : "bg-emerald-400 cursor-not-allowed opacity-70"
                                }`}
                        >
                            {saving ? "Salvando…" : "Salvar"}
                        </button>
                        {isEdit && (
                            <button
                                onClick={removeInsideModal}
                                disabled={saving}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
                            >
                                Excluir
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {/* Nome */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                            Nome *
                        </label>
                        <input
                            value={model.nome}
                            onChange={(e) => set("nome", e.target.value)}
                            className="w-full rounded-xl border border-gray-200/70 bg-white/90 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                            placeholder="Nome do profissional/clinica"
                        />
                    </div>
                    {/* Categoria */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                            Categoria *
                        </label>
                        <select
                            value={model.categoria}
                            onChange={(e) => set("categoria", e.target.value as Categoria)}
                            className="w-full rounded-xl border border-gray-200/70 bg-white/90 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                        >
                            {CATEGORIAS.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>
                    {/* Especialidade */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                            Especialidade
                        </label>
                        <input
                            value={model.especialidade}
                            onChange={(e) => set("especialidade", e.target.value)}
                            className="w-full rounded-xl border border-gray-200/70 bg-white/90 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                            placeholder="Ex.: Cardiologia Clínica"
                        />
                    </div>
                    {/* Unidade */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                            Unidade
                        </label>
                        <input
                            value={model.unidade}
                            onChange={(e) => set("unidade", e.target.value)}
                            className="w-full rounded-xl border border-gray-200/70 bg-white/90 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                            placeholder="Ex.: Unidade Centro"
                        />
                    </div>
                    {/* Endereço */}
                    <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                            Endereço *
                        </label>
                        <input
                            value={model.endereco}
                            onChange={(e) => set("endereco", e.target.value)}
                            className="w-full rounded-xl border border-gray-200/70 bg-white/90 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                            placeholder="Rua, número, complemento, bairro"
                        />
                    </div>
                    {/* CEP */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                            CEP
                        </label>
                        <input
                            value={model.cep}
                            onChange={(e) => set("cep", e.target.value)}
                            className="w-full rounded-xl border border-gray-200/70 bg-white/90 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                            placeholder="00000-000"
                        />
                    </div>
                    {/* Mapa URL */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                            URL do Mapa
                        </label>
                        <input
                            value={model.mapa_url}
                            onChange={(e) => set("mapa_url", e.target.value)}
                            className="w-full rounded-xl border border-gray-200/70 bg-white/90 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                            placeholder="https://www.google.com/maps/…"
                        />
                    </div>
                    {/* WhatsApp */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                            WhatsApp (só dígitos)
                        </label>
                        <input
                            value={model.whatsapp}
                            onChange={(e) => set("whatsapp", cleanDigits(e.target.value))}
                            className="w-full rounded-xl border border-gray-200/70 bg-white/90 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                            placeholder="5511999998888"
                        />
                    </div>
                    {/* Telefone */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                            Telefone (só dígitos)
                        </label>
                        <input
                            value={model.telefone}
                            onChange={(e) => set("telefone", cleanDigits(e.target.value))}
                            className="w-full rounded-xl border border-gray-200/70 bg-white/90 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                            placeholder="1130012002"
                        />
                    </div>
                    {/* Instagram */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                            Instagram (URL ou @)
                        </label>
                        <input
                            value={model.instagram}
                            onChange={(e) => set("instagram", e.target.value)}
                            className="w-full rounded-xl border border-gray-200/70 bg-white/90 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                            placeholder="https://instagram.com/usuario ou @usuario"
                        />
                    </div>
                    {/* Site */}
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                            Site
                        </label>
                        <input
                            value={model.site}
                            onChange={(e) => set("site", e.target.value)}
                            className="w-full rounded-xl border border-gray-200/70 bg-white/90 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                            placeholder="https://exemplo.com"
                        />
                    </div>

                    {/* Ativo + Descrição (largas) */}
                    <div className="flex items-center gap-3">
                        <input
                            id="ativo"
                            type="checkbox"
                            checked={model.ativo}
                            onChange={(e) => set("ativo", e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <label htmlFor="ativo" className="text-sm text-gray-700 dark:text-gray-200">
                            Ativo
                        </label>
                    </div>

                    <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                            Descrição
                        </label>
                        <textarea
                            value={model.descricao}
                            onChange={(e) => set("descricao", e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-gray-200/70 bg-white/90 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                            placeholder="Breve descrição para uso interno/apoio"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ================== Página Admin ================== */
export default function AdminConsultasPage() {
    const [q, setQ] = useState("");
    const [cat, setCat] = useState<"TODAS" | Categoria>("TODAS");
    const [ativos, setAtivos] = useState<"todos" | "apenasAtivos">("apenasAtivos");

    const [rows, setRows] = useState<ApiConsulta[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // Modal
    const [editing, setEditing] = useState<FormState | null>(null);

    // Busca com debounce
    const [debouncedQ, setDebouncedQ] = useState(q);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQ(q), 300);
        return () => clearTimeout(t);
    }, [q]);

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            const params = new URLSearchParams();
            params.set("list", "1");
            params.set("limit", "500");
            if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
            if (cat !== "TODAS") params.set("categoria", cat);
            if (ativos === "apenasAtivos") params.set("ativos", "1");

            const r = await fetch(`/api/consultas?${params.toString()}`, {
                cache: "no-store",
            });
            const raw: unknown = await r.json();
            if (!r.ok) {
                const msg = (raw as ApiErr | undefined)?.error || "Falha ao carregar.";
                throw new Error(msg);
            }
            if (!isApiListOk(raw)) {
                const msg =
                    (raw as ApiErr | undefined)?.error || "Resposta inválida do servidor.";
                throw new Error(msg);
            }
            setRows(raw.items);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
            setRows([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQ, cat, ativos]);

    function openCreate() {
        setEditing(emptyForm());
    }
    function openEdit(x: ApiConsulta) {
        setEditing(fromApiToForm(x));
    }

    const filtered = useMemo(() => {
        // o backend já filtra por q/categoria/ativo, mas mantemos ordenação estável aqui
        return [...rows].sort((a, b) => a.nome.localeCompare(b.nome));
    }, [rows]);

    return (
        <main className={`${nunito.className} px-4 py-6 md:px-8`}>
            <div className="mx-auto w-full max-w-6xl">
                <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
                            Admin • Consultas
                        </h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Gerencie os registros de consultas: criar, editar, excluir e
                            filtrar.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={openCreate}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                        >
                            + Nova consulta
                        </button>
                        <button
                            onClick={load}
                            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            Recarregar
                        </button>
                    </div>
                </header>

                {/* Filtros */}
                <section className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="relative">
                        <input
                            type="text"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Buscar por nome, especialidade, endereço…"
                            className="w-full rounded-2xl border border-gray-200/70 bg-white/80 px-4 py-3 pr-10 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                                <path
                                    d="M21 21l-4.2-4.2M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z"
                                    stroke="currentColor"
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                />
                            </svg>
                        </span>
                    </div>

                    <div>
                        <select
                            value={cat}
                            onChange={(e) => setCat(e.target.value as "TODAS" | Categoria)}
                            className="w-full rounded-2xl border border-gray-200/70 bg-white/80 px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                        >
                            <option value="TODAS">Todas as categorias</option>
                            {CATEGORIAS.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <select
                            value={ativos}
                            onChange={(e) => setAtivos(e.target.value as "todos" | "apenasAtivos")}
                            className="w-full rounded-2xl border border-gray-200/70 bg-white/80 px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                        >
                            <option value="apenasAtivos">Apenas ativos</option>
                            <option value="todos">Todos (ativos e inativos)</option>
                        </select>
                    </div>
                </section>

                {/* Estados de carregamento/erro */}
                {loading && (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                        Carregando…
                    </div>
                )}
                {err && !loading && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 dark:border-red-900/50 dark:bg-red-900/20">
                        {err}
                    </div>
                )}

                {/* Tabela */}
                {!loading && !err && (
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-800">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    {/* ID – escondido no mobile */}
                                    <th className="px-4 py-3 hidden md:table-cell">ID</th>

                                    {/* Nome – sempre visível */}
                                    <th className="px-4 py-3">Nome</th>

                                    {/* Categoria – sempre visível */}
                                    <th className="px-4 py-3">Categoria</th>

                                    {/* Especialidade – escondido no mobile */}
                                    <th className="px-4 py-3 hidden md:table-cell">Especialidade</th>

                                    {/* Endereço – escondido no mobile */}
                                    <th className="px-4 py-3 hidden md:table-cell">Endereço</th>

                                    {/* WhatsApp – escondido no mobile */}
                                    <th className="px-4 py-3 hidden md:table-cell">WhatsApp</th>

                                    {/* Telefone – escondido no mobile */}
                                    <th className="px-4 py-3 hidden md:table-cell">Telefone</th>

                                    {/* Ativo – escondido no mobile */}
                                    <th className="px-4 py-3 hidden md:table-cell">Ativo</th>

                                    {/* Ações – sempre visível (somente Editar) */}
                                    <th className="px-4 py-3 text-right">Ações</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {filtered.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={9}
                                            className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                                        >
                                            Nenhum registro encontrado.
                                        </td>
                                    </tr>
                                )}

                                {filtered.map((r) => (
                                    <tr key={r.id} className="bg-white/80 dark:bg-gray-900/60">
                                        {/* ID – escondido no mobile */}
                                        <td className="px-4 py-3 hidden md:table-cell">{r.id}</td>

                                        {/* Nome – sempre visível */}
                                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">
                                            {r.nome}
                                        </td>

                                        {/* Categoria – sempre visível */}
                                        <td className="px-4 py-3">{r.categoria}</td>

                                        {/* Especialidade – escondido no mobile */}
                                        <td className="px-4 py-3 hidden md:table-cell">
                                            {r.especialidade || "—"}
                                        </td>

                                        {/* Endereço – escondido no mobile */}
                                        <td className="px-4 py-3 hidden md:table-cell">{r.endereco}</td>

                                        {/* WhatsApp – escondido no mobile */}
                                        <td className="px-4 py-3 hidden md:table-cell">
                                            {r.whatsapp || "—"}
                                        </td>

                                        {/* Telefone – escondido no mobile */}
                                        <td className="px-4 py-3 hidden md:table-cell">{r.telefone || "—"}</td>

                                        {/* Ativo – escondido no mobile */}
                                        <td className="px-4 py-3 hidden md:table-cell">
                                            {(typeof r.ativo === "boolean" ? r.ativo : r.ativo === 1) ? "Sim" : "Não"}
                                        </td>

                                        {/* Ações – apenas Editar (Excluir foi para o modal) */}
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={() => openEdit(r)}
                                                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                                >
                                                    Editar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Modal de edição/criação */}
                {editing && (
                    <EditModal
                        initial={editing}
                        onCancel={() => setEditing(null)}
                        onSaved={async () => {
                            setEditing(null);
                            await load();
                        }}
                    />
                )}
            </div>
        </main>
    );
}
