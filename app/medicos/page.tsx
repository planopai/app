// src/app/(admin)/consultas/admin/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Nunito } from "next/font/google";

/* ===== Fonte Nunito ===== */
const nunito = Nunito({
    subsets: ["latin"],
    weight: ["400", "600", "700", "800"],
});

/* ================= Tipos ================= */
type LookupItem = {
    id: number;
    nome: string;
    ativo: 0 | 1 | boolean;
    created_at?: string;
    updated_at?: string;
};

type ApiConsulta = {
    id: number;
    nome: string;
    categorias: LookupItem[];
    especialidades: LookupItem[];
    descricao?: string | null;
    unidade?: string | null;
    endereco: string;
    cep?: string | null;
    mapa_url?: string | null;
    whatsapp?: string | null;
    telefone?: string | null;
    instagram?: string | null;
    site?: string | null;
    ativo: 0 | 1 | boolean;
    created_at?: string;
    updated_at?: string;
};

type ApiListOk<T> = { ok: true; items: T[] };
type ApiOk = { ok: true } & Record<string, unknown>;
type ApiErr = { ok: false; error: string };

type FormState = {
    id?: number;
    nome: string;
    categoria_ids: number[];
    especialidade_ids: number[];
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

/* ================= Guards ================= */
function isLookupItem(v: unknown): v is LookupItem {
    if (typeof v !== "object" || v === null) return false;
    const o = v as Record<string, unknown>;
    return typeof o.id === "number" && typeof o.nome === "string";
}

function isApiConsulta(v: unknown): v is ApiConsulta {
    if (typeof v !== "object" || v === null) return false;
    const o = v as Record<string, unknown>;
    return (
        typeof o.id === "number" &&
        typeof o.nome === "string" &&
        typeof o.endereco === "string" &&
        Array.isArray(o.categorias) &&
        o.categorias.every(isLookupItem) &&
        Array.isArray(o.especialidades) &&
        o.especialidades.every(isLookupItem)
    );
}

function isApiListOk<T>(
    v: unknown,
    itemGuard: (x: unknown) => x is T,
): v is ApiListOk<T> {
    if (typeof v !== "object" || v === null) return false;
    const o = v as Record<string, unknown>;
    return o.ok === true && Array.isArray(o.items) && o.items.every(itemGuard);
}

/* ================= Helpers ================= */
function cleanDigits(s: string): string {
    return s.replace(/\D+/g, "");
}

function isActive(v: 0 | 1 | boolean | undefined): boolean {
    return typeof v === "boolean" ? v : v === 1;
}

function joinNames(items?: LookupItem[] | null): string {
    if (!items?.length) return "—";
    return items.map((x) => x.nome).join(", ");
}

function fromApiToForm(x: ApiConsulta): FormState {
    return {
        id: x.id,
        nome: x.nome ?? "",
        categoria_ids: x.categorias?.map((c) => c.id) ?? [],
        especialidade_ids: x.especialidades?.map((e) => e.id) ?? [],
        descricao: x.descricao ?? "",
        unidade: x.unidade ?? "",
        endereco: x.endereco ?? "",
        cep: x.cep ?? "",
        mapa_url: x.mapa_url ?? "",
        whatsapp: x.whatsapp ?? "",
        telefone: x.telefone ?? "",
        instagram: x.instagram ?? "",
        site: x.site ?? "",
        ativo: isActive(x.ativo),
    };
}

function emptyForm(): FormState {
    return {
        nome: "",
        categoria_ids: [],
        especialidade_ids: [],
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

async function safeJson(res: Response) {
    const text = await res.text();
    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new Error(text || "Resposta inválida do servidor.");
    }
}

/* ================= Submodal de cadastro de lookup ================= */
function LookupManagerModal({
    title,
    endpoint,
    items,
    onClose,
    onChanged,
}: {
    title: string;
    endpoint: "categorias" | "especialidades";
    items: LookupItem[];
    onClose: () => void;
    onChanged: () => Promise<void> | void;
}) {
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<number | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    async function createItem() {
        const nome = name.trim();
        if (!nome || saving) return;

        try {
            setSaving(true);
            const r = await fetch(`/api/consultas?${endpoint}=1`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ nome, ativo: 1 }),
            });
            const raw = await safeJson(r);
            if (!r.ok || (raw as ApiOk).ok !== true) {
                throw new Error(
                    (raw as ApiErr | undefined)?.error || `Falha ao criar ${title.toLowerCase()}.`,
                );
            }
            setName("");
            await onChanged();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    async function toggleActive(item: LookupItem) {
        try {
            setBusyId(item.id);
            const r = await fetch(`/api/consultas?${endpoint}=1&id=${item.id}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ ativo: isActive(item.ativo) ? 0 : 1 }),
            });
            const raw = await safeJson(r);
            if (!r.ok || (raw as ApiOk).ok !== true) {
                throw new Error((raw as ApiErr | undefined)?.error || "Falha ao atualizar.");
            }
            await onChanged();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setBusyId(null);
        }
    }

    async function removeItem(item: LookupItem) {
        const ok = confirm(`Deseja excluir "${item.nome}"?`);
        if (!ok) return;

        try {
            setBusyId(item.id);
            const r = await fetch(`/api/consultas?${endpoint}=1&id=${item.id}`, {
                method: "DELETE",
            });
            const raw = await safeJson(r);
            if (!r.ok || (raw as ApiOk).ok !== true) {
                throw new Error((raw as ApiErr | undefined)?.error || "Falha ao excluir.");
            }
            await onChanged();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div
            className="fixed inset-0 z-[120] grid place-items-center bg-black/40 p-3 sm:p-4 backdrop-blur-sm"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            role="dialog"
            aria-modal="true"
        >
            <div
                className={`w-full max-w-2xl rounded-2xl border border-gray-200/70 bg-white/95 p-4 shadow-2xl dark:border-gray-800/60 dark:bg-gray-900/90 sm:p-6 ${nunito.className}`}
            >
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <h3 className="text-lg font-extrabold text-gray-900 dark:text-gray-100">
                            {title}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Cadastre, ative, inative ou exclua itens.
                        </p>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 sm:w-auto"
                    >
                        Fechar
                    </button>
                </div>

                <div className="mb-5 flex flex-col gap-3 sm:flex-row">
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void createItem();
                        }}
                        placeholder={`Nova ${title.toLowerCase().slice(0, -1)}`}
                        className="w-full rounded-xl border border-gray-200/70 bg-white/90 px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                    />
                    <button
                        onClick={createItem}
                        disabled={!name.trim() || saving}
                        className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:min-w-[140px]"
                    >
                        {saving ? "Adicionando…" : "Adicionar"}
                    </button>
                </div>

                {/* Mobile */}
                <div className="space-y-3 md:hidden">
                    <div className="max-h-[50vh] overflow-y-auto space-y-3 rounded-2xl border border-gray-200 p-3 dark:border-gray-800">
                        {items.length === 0 && (
                            <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                Nenhum item cadastrado.
                            </div>
                        )}

                        {items.map((item) => (
                            <div
                                key={item.id}
                                className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/60"
                            >
                                <div className="min-w-0">
                                    <div className="break-words text-sm font-semibold text-gray-900 dark:text-gray-100">
                                        {item.nome}
                                    </div>
                                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        Status: {isActive(item.ativo) ? "Ativo" : "Inativo"}
                                    </div>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => void toggleActive(item)}
                                        disabled={busyId === item.id}
                                        className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                    >
                                        {busyId === item.id
                                            ? "Salvando…"
                                            : isActive(item.ativo)
                                                ? "Inativar"
                                                : "Ativar"}
                                    </button>

                                    <button
                                        onClick={() => void removeItem(item)}
                                        disabled={busyId === item.id}
                                        className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
                                    >
                                        Excluir
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Desktop */}
                <div className="hidden max-h-[50vh] overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-800 md:block">
                    <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                <th className="px-4 py-3">Nome</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 text-right">Ações</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {items.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={3}
                                        className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                                    >
                                        Nenhum item cadastrado.
                                    </td>
                                </tr>
                            )}

                            {items.map((item) => (
                                <tr key={item.id} className="bg-white/80 dark:bg-gray-900/60">
                                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">
                                        {item.nome}
                                    </td>
                                    <td className="px-4 py-3">
                                        {isActive(item.ativo) ? "Ativo" : "Inativo"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => void toggleActive(item)}
                                                disabled={busyId === item.id}
                                                className="whitespace-nowrap rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                            >
                                                {busyId === item.id
                                                    ? "Salvando…"
                                                    : isActive(item.ativo)
                                                        ? "Inativar"
                                                        : "Ativar"}
                                            </button>
                                            <button
                                                onClick={() => void removeItem(item)}
                                                disabled={busyId === item.id}
                                                className="whitespace-nowrap rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
                                            >
                                                Excluir
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/* ================= Dropdown multi-select compacto ================= */
function MultiSelectDropdown({
    label,
    items,
    selectedIds,
    onToggle,
    onClear,
    onManage,
    placeholder,
    emptyText,
}: {
    label: string;
    items: LookupItem[];
    selectedIds: number[];
    onToggle: (id: number) => void;
    onClear: () => void;
    onManage: () => void;
    placeholder: string;
    emptyText: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const boxRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        function handleOutside(e: MouseEvent) {
            if (!boxRef.current) return;
            if (!boxRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, []);

    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter((item) => item.nome.toLowerCase().includes(q));
    }, [items, search]);

    const selectedItems = useMemo(() => {
        const ids = new Set(selectedIds);
        return items.filter((item) => ids.has(item.id));
    }, [items, selectedIds]);

    const buttonLabel =
        selectedItems.length === 0
            ? placeholder
            : selectedItems.length <= 2
                ? selectedItems.map((x) => x.nome).join(", ")
                : `${selectedItems.length} selecionadas`;

    return (
        <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
                {label}
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div ref={boxRef} className="relative min-w-0 flex-1">
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200/70 bg-white/90 px-4 py-3 text-left text-sm outline-none transition hover:bg-gray-50 focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100 dark:hover:bg-gray-800"
                    >
                        <span
                            className={`min-w-0 truncate ${selectedItems.length === 0
                                    ? "text-gray-400 dark:text-gray-500"
                                    : "text-gray-800 dark:text-gray-100"
                                }`}
                        >
                            {buttonLabel}
                        </span>
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                            aria-hidden="true"
                        >
                            <path
                                d="M7 10l5 5 5-5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                            />
                        </svg>
                    </button>

                    {open && (
                        <div className="absolute left-0 right-0 z-[130] mt-2 rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
                            <div className="border-b border-gray-100 p-3 dark:border-gray-800">
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Buscar..."
                                    className="w-full rounded-xl border border-gray-200/70 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                />

                                <div className="mt-3 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={onClear}
                                        className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                    >
                                        Limpar
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-72 overflow-y-auto p-2">
                                {filteredItems.length === 0 ? (
                                    <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                                        {emptyText}
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {filteredItems.map((item) => {
                                            const checked = selectedIds.includes(item.id);
                                            return (
                                                <label
                                                    key={item.id}
                                                    className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => onToggle(item.id)}
                                                        className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                                    />
                                                    <span className="min-w-0 flex-1 break-words">
                                                        {item.nome}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={onManage}
                    className="w-full shrink-0 rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 sm:w-auto"
                >
                    Gerenciar
                </button>
            </div>

            {selectedItems.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                    {selectedItems.map((item) => (
                        <span
                            key={item.id}
                            className="inline-flex max-w-full items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                        >
                            <span className="truncate">{item.nome}</span>
                            <button
                                type="button"
                                onClick={() => onToggle(item.id)}
                                className="rounded-full text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-white"
                                aria-label={`Remover ${item.nome}`}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ================== Modal de Form (Create/Update) ================== */
function EditModal({
    initial,
    categorias,
    especialidades,
    onCancel,
    onSaved,
    onReloadLookups,
}: {
    initial: FormState;
    categorias: LookupItem[];
    especialidades: LookupItem[];
    onCancel: () => void;
    onSaved: () => void;
    onReloadLookups: () => Promise<void>;
}) {
    const [model, setModel] = useState<FormState>(initial);
    const [saving, setSaving] = useState(false);
    const [showCategoriasManager, setShowCategoriasManager] = useState(false);
    const [showEspecialidadesManager, setShowEspecialidadesManager] = useState(false);
    const isEdit = typeof initial.id === "number";

    function set<K extends keyof FormState>(key: K, val: FormState[K]) {
        setModel((m) => ({ ...m, [key]: val }));
    }

    function toggleArrayId(key: "categoria_ids" | "especialidade_ids", id: number) {
        setModel((m) => {
            const current = m[key];
            const exists = current.includes(id);
            return {
                ...m,
                [key]: exists ? current.filter((x) => x !== id) : [...current, id],
            };
        });
    }

    function clearArray(key: "categoria_ids" | "especialidade_ids") {
        setModel((m) => ({ ...m, [key]: [] }));
    }

    const canSave = useMemo(() => {
        return model.nome.trim() !== "" && model.endereco.trim() !== "";
    }, [model]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onCancel]);

    async function save() {
        if (!canSave || saving) return;
        setSaving(true);
        try {
            const payload = {
                nome: model.nome.trim(),
                categoria_ids: model.categoria_ids,
                especialidade_ids: model.especialidade_ids,
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

            const raw = await safeJson(r);

            if (!r.ok) {
                throw new Error((raw as ApiErr | undefined)?.error || "Falha ao salvar.");
            }
            if ((raw as ApiOk).ok !== true) {
                throw new Error((raw as ApiErr | undefined)?.error || "Resposta inválida do servidor.");
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
            const raw = await safeJson(r);
            if (!r.ok || (raw as ApiOk).ok !== true) {
                throw new Error((raw as ApiErr | undefined)?.error || "Falha ao excluir.");
            }
            onSaved();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <div
                className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-3 sm:p-4 backdrop-blur-sm"
                onClick={(e) => {
                    if (e.target === e.currentTarget) onCancel();
                }}
                role="dialog"
                aria-modal="true"
            >
                <div
                    className={`max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-gray-200/70 bg-white/95 p-4 shadow-2xl dark:border-gray-800/60 dark:bg-gray-900/90 sm:p-6 ${nunito.className}`}
                >
                    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <h2 className="text-lg font-extrabold text-gray-900 dark:text-gray-100">
                            {isEdit ? "Editar consulta" : "Nova consulta"}
                        </h2>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex">
                            <button
                                onClick={onCancel}
                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                disabled={saving}
                            >
                                Fechar
                            </button>
                            <button
                                onClick={save}
                                disabled={!canSave || saving}
                                className={`rounded-lg px-3 py-2 text-sm font-semibold text-white ${canSave
                                        ? "bg-emerald-600 hover:brightness-110"
                                        : "cursor-not-allowed bg-emerald-400 opacity-70"
                                    }`}
                            >
                                {saving ? "Salvando…" : "Salvar"}
                            </button>
                            {isEdit && (
                                <button
                                    onClick={removeInsideModal}
                                    disabled={saving}
                                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:brightness-110 sm:col-span-2 lg:col-span-1"
                                >
                                    Excluir
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

                        <div className="md:col-span-2">
                            <MultiSelectDropdown
                                label="Especialidades"
                                items={categorias}
                                selectedIds={model.categoria_ids}
                                onToggle={(id) => toggleArrayId("categoria_ids", id)}
                                onClear={() => clearArray("categoria_ids")}
                                onManage={() => setShowCategoriasManager(true)}
                                placeholder="Selecione uma ou mais categorias"
                                emptyText="Nenhuma categoria encontrada."
                            />
                        </div>

                        <div className="md:col-span-2">
                            <MultiSelectDropdown
                                label="Exames / Procedimentos"
                                items={especialidades}
                                selectedIds={model.especialidade_ids}
                                onToggle={(id) => toggleArrayId("especialidade_ids", id)}
                                onClear={() => clearArray("especialidade_ids")}
                                onManage={() => setShowEspecialidadesManager(true)}
                                placeholder="Selecione uma ou mais especialidades"
                                emptyText="Nenhuma especialidade encontrada."
                            />
                        </div>

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

            {showCategoriasManager && (
                <LookupManagerModal
                    title="Especialidades"
                    endpoint="categorias"
                    items={categorias}
                    onClose={() => setShowCategoriasManager(false)}
                    onChanged={async () => {
                        await onReloadLookups();
                    }}
                />
            )}

            {showEspecialidadesManager && (
                <LookupManagerModal
                    title="Exames / Procedimentos"
                    endpoint="especialidades"
                    items={especialidades}
                    onClose={() => setShowEspecialidadesManager(false)}
                    onChanged={async () => {
                        await onReloadLookups();
                    }}
                />
            )}
        </>
    );
}

/* ================== Página Admin ================== */
export default function AdminConsultasPage() {
    const [q, setQ] = useState("");
    const [catId, setCatId] = useState<"TODAS" | number>("TODAS");
    const [ativos, setAtivos] = useState<"todos" | "apenasAtivos">("apenasAtivos");

    const [rows, setRows] = useState<ApiConsulta[]>([]);
    const [categorias, setCategorias] = useState<LookupItem[]>([]);
    const [especialidades, setEspecialidades] = useState<LookupItem[]>([]);

    const [loading, setLoading] = useState(false);
    const [loadingLookups, setLoadingLookups] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [editing, setEditing] = useState<FormState | null>(null);

    const [debouncedQ, setDebouncedQ] = useState(q);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQ(q), 300);
        return () => clearTimeout(t);
    }, [q]);

    async function loadLookups() {
        setLoadingLookups(true);
        try {
            const [catRes, espRes] = await Promise.all([
                fetch("/api/consultas?categorias=1", { cache: "no-store" }),
                fetch("/api/consultas?especialidades=1", { cache: "no-store" }),
            ]);

            const catRaw = await safeJson(catRes);
            const espRaw = await safeJson(espRes);

            if (!catRes.ok) {
                throw new Error((catRaw as ApiErr | undefined)?.error || "Falha ao carregar categorias.");
            }
            if (!espRes.ok) {
                throw new Error((espRaw as ApiErr | undefined)?.error || "Falha ao carregar especialidades.");
            }
            if (!isApiListOk(catRaw, isLookupItem)) {
                throw new Error("Resposta inválida ao carregar categorias.");
            }
            if (!isApiListOk(espRaw, isLookupItem)) {
                throw new Error("Resposta inválida ao carregar especialidades.");
            }

            setCategorias(catRaw.items);
            setEspecialidades(espRaw.items);
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setLoadingLookups(false);
        }
    }

    async function load() {
        setLoading(true);
        setErr(null);

        try {
            const params = new URLSearchParams();
            params.set("list", "1");
            params.set("limit", "500");
            if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
            if (catId !== "TODAS") params.set("categoria_id", String(catId));
            if (ativos === "apenasAtivos") params.set("ativos", "1");

            const r = await fetch(`/api/consultas?${params.toString()}`, {
                cache: "no-store",
            });
            const raw = await safeJson(r);

            if (!r.ok) {
                const msg = (raw as ApiErr | undefined)?.error || "Falha ao carregar.";
                throw new Error(msg);
            }
            if (!isApiListOk(raw, isApiConsulta)) {
                const msg = (raw as ApiErr | undefined)?.error || "Resposta inválida do servidor.";
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
        void loadLookups();
    }, []);

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQ, catId, ativos]);

    function openCreate() {
        setEditing(emptyForm());
    }

    function openEdit(x: ApiConsulta) {
        setEditing(fromApiToForm(x));
    }

    const filtered = useMemo(() => {
        return [...rows].sort((a, b) => a.nome.localeCompare(b.nome));
    }, [rows]);

    return (
        <main className={`${nunito.className} px-4 py-6 md:px-8`}>
            <div className="mx-auto w-full max-w-7xl">
                <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
                            Admin • Consultas
                        </h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Gerencie os registros, categorias e especialidades.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        <button
                            onClick={openCreate}
                            className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 sm:w-auto"
                        >
                            + Novo Convênio
                        </button>
                        <button
                            onClick={() => void loadLookups()}
                            className="w-full rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 sm:w-auto"
                        >
                            {loadingLookups ? "Atualizando listas…" : "Atualizar listas"}
                        </button>
                        
                    </div>
                </header>

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
                            value={catId === "TODAS" ? "TODAS" : String(catId)}
                            onChange={(e) =>
                                setCatId(e.target.value === "TODAS" ? "TODAS" : Number(e.target.value))
                            }
                            className="w-full rounded-2xl border border-gray-200/70 bg-white/80 px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700/70 dark:bg-gray-900/70 dark:text-gray-100"
                        >
                            <option value="TODAS">Todas as categorias</option>
                            {categorias.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nome}
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

                {!loading && !err && (
                    <>
                        {/* MOBILE: somente nome + editar */}
                        <div className="space-y-3 md:hidden">
                            {filtered.length === 0 && (
                                <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                                    Nenhum registro encontrado.
                                </div>
                            )}

                            {filtered.map((r) => (
                                <div
                                    key={r.id}
                                    className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/60"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="break-words text-sm font-semibold text-gray-900 dark:text-gray-100">
                                            {r.nome}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => openEdit(r)}
                                        className="shrink-0 whitespace-nowrap rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                    >
                                        Editar
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* DESKTOP: tabela completa */}
                        <div className="hidden overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800 md:block">
                            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                                <thead className="bg-gray-50 dark:bg-gray-900">
                                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        <th className="px-4 py-3">ID</th>
                                        <th className="px-4 py-3">Nome</th>
                                        <th className="px-4 py-3">Especialidades</th>
                                        <th className="px-4 py-3">Exames / Procedimentos</th>
                                        <th className="px-4 py-3">Endereço</th>
                                        <th className="px-4 py-3">WhatsApp</th>
                                        <th className="px-4 py-3">Telefone</th>
                                        <th className="px-4 py-3">Ativo</th>
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
                                            <td className="px-4 py-3">{r.id}</td>

                                            <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">
                                                {r.nome}
                                            </td>

                                            <td className="px-4 py-3">{joinNames(r.categorias)}</td>

                                            <td className="px-4 py-3">{joinNames(r.especialidades)}</td>

                                            <td className="px-4 py-3">{r.endereco}</td>

                                            <td className="px-4 py-3">{r.whatsapp || "—"}</td>

                                            <td className="px-4 py-3">{r.telefone || "—"}</td>

                                            <td className="px-4 py-3">
                                                {isActive(r.ativo) ? "Sim" : "Não"}
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="flex justify-end">
                                                    <button
                                                        onClick={() => openEdit(r)}
                                                        className="whitespace-nowrap rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
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
                    </>
                )}

                {editing && (
                    <EditModal
                        initial={editing}
                        categorias={categorias}
                        especialidades={especialidades}
                        onCancel={() => setEditing(null)}
                        onReloadLookups={loadLookups}
                        onSaved={async () => {
                            setEditing(null);
                            await Promise.all([loadLookups(), load()]);
                        }}
                    />
                )}
            </div>
        </main>
    );
}