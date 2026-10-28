// app/medicos/page.tsx — Rede de atendimento (médicos, clínicas e laboratórios parceiros)
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    IconBrandInstagram,
    IconBrandWhatsapp,
    IconCheck,
    IconChevronDown,
    IconMapPin,
    IconPencil,
    IconPhone,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconSettings,
    IconStethoscope,
    IconTrash,
    IconWorld,
    IconX,
} from "@tabler/icons-react";

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

/* =========================================================
   VISUAL (padrão repaginado do app PAI)
   ========================================================= */

const CARD = "rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";
const TXT_SEC = "text-[#5B6478] dark:text-[#AEB9CF]";
const BTN_BASE =
    "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-bold transition outline-none focus-visible:ring-2 focus-visible:ring-[#3D6A99]/30 disabled:cursor-not-allowed disabled:opacity-45";
const BTN_SEC =
    `${BTN_BASE} border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08] lg:border`;
const BTN_PRI =
    `${BTN_BASE} border-[1.5px] border-[#313C55] bg-[#313C55] font-extrabold text-white hover:bg-[#232B40] dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30] lg:border`;
const BTN_PERIGO =
    `${BTN_BASE} border-[1.5px] border-[#B42318] bg-[#B42318] font-extrabold text-white hover:bg-[#9A1D14] dark:border-[#FF9C92] dark:bg-[#FF9C92] dark:text-[#313C55] lg:border`;
const BTN_PERIGO_TXT =
    `${BTN_BASE} text-[#B42318] hover:bg-[#FDECEA] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15`;
const BTN_ICONE =
    "inline-grid size-11 shrink-0 place-items-center rounded-xl border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-45 dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08] lg:border";
const BTN_ICONE_SUAVE =
    "inline-grid size-11 shrink-0 place-items-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-45 dark:text-white dark:hover:bg-white/[0.08] lg:size-10";
const CAMPO =
    "h-12 w-full rounded-xl border border-transparent bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 disabled:opacity-60 dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#8893AA]";
const ROTULO = "mb-2 block text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";
const TITULO_BLOCO = "mb-3 text-[13px] font-extrabold uppercase tracking-[.12em] text-[#5B6478] dark:text-[#AEB9CF]";

/* ---------- Aviso na tela (no lugar do alert) ---------- */

type Aviso = { tipo: "ok" | "erro"; texto: string };
const EVENTO_AVISO = "pai-medicos-aviso";

function avisar(tipo: Aviso["tipo"], texto: string) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<Aviso>(EVENTO_AVISO, { detail: { tipo, texto } }));
}

function avisarErro(e: unknown) {
    avisar("erro", e instanceof Error ? e.message : String(e));
}

/* ---------- Formatação só para exibição ---------- */

function formatTelefone(digitos?: string | null): string {
    const d = cleanDigits(String(digitos ?? ""));
    if (!d) return "";
    const local = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
    if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    return d;
}

function linkWhatsapp(digitos?: string | null): string {
    const d = cleanDigits(String(digitos ?? ""));
    if (!d) return "";
    return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
}

function linkInstagram(v?: string | null): string {
    const s = String(v ?? "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    return `https://instagram.com/${s.replace(/^@/, "").replace(/^instagram\.com\//i, "")}`;
}

function linkSite(v?: string | null): string {
    const s = String(v ?? "").trim();
    if (!s) return "";
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function linkMapa(r: { mapa_url?: string | null; endereco?: string | null }): string {
    const u = String(r.mapa_url ?? "").trim();
    if (u) return u;
    const e = String(r.endereco ?? "").trim();
    return e ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e)}` : "";
}

/* ---------- Janela padrão (portal, Esc, folha no celular) ---------- */

function NoCorpo({ children }: { children: React.ReactNode }) {
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);
    return montado ? createPortal(children, document.body) : null;
}

function Janela({
    titulo,
    subtitulo,
    icone,
    onClose,
    podeFechar = true,
    rodape,
    largura = "md",
    z = "z-[70]",
    children,
}: {
    titulo: string;
    subtitulo?: string;
    icone?: React.ReactNode;
    onClose: () => void;
    podeFechar?: boolean;
    rodape?: React.ReactNode;
    largura?: "sm" | "md" | "lg";
    z?: string;
    children: React.ReactNode;
}) {
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

    const max = largura === "sm" ? "lg:max-w-[460px]" : largura === "lg" ? "lg:max-w-[860px]" : "lg:max-w-[640px]";

    return (
        <NoCorpo>
            <div
                role="dialog"
                data-pai-overlay
                aria-modal="true"
                aria-label={titulo}
                className={`fixed inset-0 ${z} flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6`}
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget && podeFechar) onClose();
                }}
            >
                <div
                    className={`flex max-h-[92dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white lg:max-h-[88vh] lg:rounded-3xl lg:border lg:border-[#E3E8F0] lg:shadow-2xl lg:dark:border-white/[0.12] ${max}`}
                >
                    <div className="flex items-start gap-3 border-b border-[#E3E8F0] pb-3 pl-5 pr-2 pt-4 dark:border-white/[0.12] lg:px-6 lg:py-5">
                        {icone ? <div className="mt-0.5 shrink-0">{icone}</div> : null}
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[19px] font-extrabold leading-tight lg:text-xl">{titulo}</h2>
                            {subtitulo ? <p className={`mt-0.5 text-[13px] lg:mt-1 lg:text-sm ${TXT_SEC}`}>{subtitulo}</p> : null}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={!podeFechar}
                            className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[#EEF2F7] disabled:opacity-40 dark:hover:bg-white/[0.08]"
                            aria-label="Fechar"
                        >
                            <IconX size={20} stroke={1.8} />
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-6 lg:py-5">{children}</div>

                    {rodape ? (
                        <div className="flex flex-wrap gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:gap-3 lg:px-6 lg:py-4">
                            {rodape}
                        </div>
                    ) : null}
                </div>
            </div>
        </NoCorpo>
    );
}

/** Confirmação no padrão novo (no lugar do confirm do navegador). */
function ConfirmarExclusao({
    titulo,
    texto,
    ocupado,
    onCancelar,
    onConfirmar,
}: {
    titulo: string;
    texto: React.ReactNode;
    ocupado?: boolean;
    onCancelar: () => void;
    onConfirmar: () => void;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !ocupado) {
                e.stopImmediatePropagation();
                onCancelar();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [ocupado, onCancelar]);

    return (
        <Janela
            titulo={titulo}
            subtitulo="Esta ação não poderá ser desfeita."
            largura="sm"
            z="z-[90]"
            onClose={onCancelar}
            podeFechar={!ocupado}
            icone={
                <span className="grid size-10 place-items-center rounded-xl bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                    <IconTrash size={20} stroke={1.8} />
                </span>
            }
            rodape={
                <div className="flex w-full gap-2 lg:justify-end lg:gap-3 [&>*]:flex-1 lg:[&>*]:flex-none">
                    <button type="button" onClick={onCancelar} disabled={ocupado} className={BTN_SEC}>
                        Voltar
                    </button>
                    <button type="button" onClick={onConfirmar} disabled={ocupado} className={BTN_PERIGO}>
                        {ocupado ? "Excluindo..." : "Excluir"}
                    </button>
                </div>
            }
        >
            <div className={`text-sm ${TXT_SEC}`}>{texto}</div>
        </Janela>
    );
}

function SeloStatus({ ativo }: { ativo: boolean }) {
    return ativo ? (
        <span className="shrink-0 rounded-full border border-[#7BA11A]/50 bg-[#EEF5D6] px-2 py-0.5 text-[11px] font-extrabold text-[#4A6310] dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]">
            Ativo
        </span>
    ) : (
        <span className="shrink-0 rounded-full border border-[#C9D1DE] bg-[#EEF2F7] px-2 py-0.5 text-[11px] font-extrabold text-[#5B6478] dark:border-white/25 dark:bg-white/10 dark:text-[#AEB9CF]">
            Inativo
        </span>
    );
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
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState("");
    const [excluir, setExcluir] = useState<LookupItem | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (excluir) return;
            // Esta janela fica por cima da janela do parceiro: o Esc fecha só ela.
            e.stopImmediatePropagation();
            if (editingId !== null) {
                setEditingId(null);
                setEditingName("");
                return;
            }
            onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [editingId, onClose, excluir]);

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
            avisarErro(e);
        } finally {
            setSaving(false);
        }
    }

    function beginEdit(item: LookupItem) {
        if (busyId !== null) return;
        setEditingId(item.id);
        setEditingName(item.nome);
    }

    function cancelEdit() {
        if (busyId !== null) return;
        setEditingId(null);
        setEditingName("");
    }

    async function saveEdit(item: LookupItem) {
        const nome = editingName.trim();
        if (!nome || busyId !== null) return;
        if (nome === item.nome.trim()) {
            cancelEdit();
            return;
        }
        try {
            setBusyId(item.id);
            const r = await fetch(`/api/consultas?${endpoint}=1&id=${item.id}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ nome }),
            });
            const raw = await safeJson(r);
            if (!r.ok || (raw as ApiOk).ok !== true) {
                throw new Error((raw as ApiErr | undefined)?.error || "Falha ao renomear.");
            }
            setEditingId(null);
            setEditingName("");
            await onChanged();
        } catch (e) {
            avisarErro(e);
        } finally {
            setBusyId(null);
        }
    }

    async function toggleActive(item: LookupItem) {
        if (busyId !== null) return;
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
            avisarErro(e);
        } finally {
            setBusyId(null);
        }
    }

    async function removeItem(item: LookupItem) {
        if (busyId !== null) return;
        try {
            setBusyId(item.id);
            const r = await fetch(`/api/consultas?${endpoint}=1&id=${item.id}`, {
                method: "DELETE",
            });
            const raw = await safeJson(r);
            if (!r.ok || (raw as ApiOk).ok !== true) {
                throw new Error((raw as ApiErr | undefined)?.error || "Falha ao excluir.");
            }
            if (editingId === item.id) {
                setEditingId(null);
                setEditingName("");
            }
            setExcluir(null);
            await onChanged();
        } catch (e) {
            avisarErro(e);
        } finally {
            setBusyId(null);
        }
    }

    const singular = title === "Categorias" ? "categoria" : "exame ou procedimento";

    return (
        <>
            <Janela
                titulo={title}
                subtitulo="Cadastre, renomeie, ative, inative ou exclua itens."
                onClose={onClose}
                z="z-[80]"
                rodape={
                    <div className="flex w-full lg:justify-end [&>*]:flex-1 lg:[&>*]:flex-none">
                        <button type="button" onClick={onClose} className={BTN_SEC}>
                            Fechar
                        </button>
                    </div>
                }
            >
                <div className="mb-4 flex gap-2">
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void createItem();
                        }}
                        placeholder={`Nova ${singular}`}
                        aria-label={`Nova ${singular}`}
                        className={CAMPO}
                    />
                    <button type="button" onClick={createItem} disabled={!name.trim() || saving} className={`${BTN_PRI} shrink-0`}>
                        <IconPlus size={18} stroke={2.2} />
                        <span className="hidden sm:inline">{saving ? "Adicionando…" : "Adicionar"}</span>
                    </button>
                </div>

                {items.length === 0 ? (
                    <div className={`rounded-xl border border-dashed border-[#C9D1DE] p-6 text-center text-sm dark:border-white/20 ${TXT_SEC}`}>
                        Nenhum item cadastrado.
                    </div>
                ) : (
                    <ul className="divide-y divide-[#E3E8F0] rounded-2xl border border-[#E3E8F0] dark:divide-white/[0.12] dark:border-white/[0.12]">
                        {items.map((item) => {
                            const editing = editingId === item.id;
                            const itemBusy = busyId === item.id;
                            const ativo = isActive(item.ativo);

                            return (
                                <li key={item.id} className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${ativo ? "" : "opacity-70"}`}>
                                    {editing ? (
                                        <>
                                            <input
                                                autoFocus
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") void saveEdit(item);
                                                }}
                                                disabled={itemBusy}
                                                aria-label="Novo nome"
                                                className={`${CAMPO} min-w-0 flex-1 basis-full sm:basis-0`}
                                            />
                                            <div className="ml-auto flex gap-1.5">
                                                <button type="button" onClick={cancelEdit} disabled={itemBusy} className={BTN_SEC}>
                                                    Cancelar
                                                </button>
                                                <button type="button" onClick={() => void saveEdit(item)} disabled={itemBusy || !editingName.trim()} className={BTN_PRI}>
                                                    {itemBusy ? "Salvando…" : "Salvar"}
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <span className="min-w-0 flex-1 break-words text-[15px] font-bold">{item.nome}</span>
                                            <SeloStatus ativo={ativo} />
                                            <div className="flex shrink-0 items-center gap-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => beginEdit(item)}
                                                    disabled={busyId !== null}
                                                    className={BTN_ICONE_SUAVE}
                                                    title="Renomear"
                                                    aria-label={`Renomear ${item.nome}`}
                                                >
                                                    <IconPencil size={18} stroke={1.8} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void toggleActive(item)}
                                                    disabled={busyId !== null}
                                                    className={`${BTN_BASE} min-h-10 px-3 text-[13px] text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/[0.08]`}
                                                >
                                                    {itemBusy ? "Salvando…" : ativo ? "Inativar" : "Ativar"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setExcluir(item)}
                                                    disabled={busyId !== null}
                                                    className="inline-grid size-11 place-items-center rounded-xl text-[#B42318] hover:bg-[#FDECEA] disabled:opacity-45 dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15 lg:size-10"
                                                    title="Excluir"
                                                    aria-label={`Excluir ${item.nome}`}
                                                >
                                                    <IconTrash size={18} stroke={1.8} />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Janela>

            {excluir ? (
                <ConfirmarExclusao
                    titulo={`Excluir "${excluir.nome}"?`}
                    texto={<>O item sai da lista de {title.toLowerCase()}.</>}
                    ocupado={busyId === excluir.id}
                    onCancelar={() => setExcluir(null)}
                    onConfirmar={() => void removeItem(excluir)}
                />
            ) : null}
        </>
    );
}

/* ================= Seleção múltipla ================= */

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
        <div>
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className={`${ROTULO} !mb-0`}>{label}</span>
                <button
                    type="button"
                    onClick={onManage}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-bold text-[#3D6A99] hover:bg-[#E9EFF6] dark:text-[#9DBBE0] dark:hover:bg-[#3D6A99]/20"
                >
                    <IconSettings size={16} stroke={1.8} />
                    Gerenciar lista
                </button>
            </div>

            <div ref={boxRef} className="relative">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    className={`${CAMPO} flex items-center justify-between gap-3 text-left`}
                >
                    <span className={`min-w-0 truncate ${selectedItems.length === 0 ? "text-[#7A8396] dark:text-[#8893AA]" : ""}`}>{buttonLabel}</span>
                    <IconChevronDown size={18} stroke={1.8} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>

                {open && (
                    <div className="absolute left-0 right-0 z-[5] mt-2 overflow-hidden rounded-2xl border border-[#E3E8F0] bg-white shadow-xl dark:border-white/[0.12] dark:bg-[#232B3F]">
                        <div className="flex gap-2 border-b border-[#E3E8F0] p-2.5 dark:border-white/[0.12]">
                            <span className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-[#F1F4F8] px-3 text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                <IconSearch size={18} stroke={1.8} className="shrink-0" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Buscar..."
                                    aria-label={`Buscar em ${label}`}
                                    className="min-w-0 flex-1 bg-transparent text-[16px] text-[#313C55] outline-none dark:text-white"
                                />
                            </span>
                            <button type="button" onClick={onClear} className={`${BTN_SEC} shrink-0`}>
                                Limpar
                            </button>
                        </div>

                        <div className="max-h-64 overflow-y-auto p-1.5">
                            {filteredItems.length === 0 ? (
                                <div className={`px-3 py-4 text-sm ${TXT_SEC}`}>{emptyText}</div>
                            ) : (
                                filteredItems.map((item) => {
                                    const checked = selectedIds.includes(item.id);
                                    return (
                                        <label
                                            key={item.id}
                                            className={[
                                                "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-[15px]",
                                                checked ? "bg-[#E9EFF6] font-bold dark:bg-[#3D6A99]/20" : "hover:bg-[#F6F8FB] dark:hover:bg-white/[0.06]",
                                            ].join(" ")}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => onToggle(item.id)}
                                                className="size-5 shrink-0 accent-[#313C55] dark:accent-[#F2CB3F]"
                                            />
                                            <span className="min-w-0 break-words">{item.nome}</span>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>

            {selectedItems.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedItems.map((item) => (
                        <span
                            key={item.id}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#A9BED6] bg-[#E9EFF6] py-0.5 pl-3 pr-1 text-[13px] font-bold text-[#313C55] dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-white"
                        >
                            <span className="truncate">{item.nome}</span>
                            <button
                                type="button"
                                onClick={() => onToggle(item.id)}
                                className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                                aria-label={`Remover ${item.nome}`}
                            >
                                <IconX size={14} stroke={2} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ================== Janela do parceiro (criar / editar) ================== */

function Campo({
    label,
    obrigatorio,
    className = "",
    children,
}: {
    label: string;
    obrigatorio?: boolean;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <label className={`block ${className}`}>
            <span className={ROTULO}>
                {label}
                {obrigatorio ? <span className="text-[#B42318] dark:text-[#FF9C92]"> *</span> : null}
            </span>
            {children}
        </label>
    );
}

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
    const [confirmarExcluir, setConfirmarExcluir] = useState(false);

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
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onCancel();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onCancel, saving]);

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
            avisar("ok", isEdit ? "Parceiro atualizado." : "Parceiro cadastrado.");
            onSaved();
        } catch (e) {
            avisarErro(e);
        } finally {
            setSaving(false);
        }
    }

    async function removeInsideModal() {
        if (!isEdit || !model.id) return;
        try {
            setSaving(true);
            const r = await fetch(`/api/consultas?id=${model.id}`, { method: "DELETE" });
            const raw = await safeJson(r);
            if (!r.ok || (raw as ApiOk).ok !== true) {
                throw new Error((raw as ApiErr | undefined)?.error || "Falha ao excluir.");
            }
            setConfirmarExcluir(false);
            avisar("ok", "Parceiro excluído.");
            onSaved();
        } catch (e) {
            avisarErro(e);
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <Janela
                titulo={isEdit ? "Editar parceiro" : "Novo parceiro"}
                subtitulo={isEdit ? model.nome || undefined : "Médico, clínica ou laboratório da rede de atendimento."}
                largura="lg"
                onClose={onCancel}
                podeFechar={!saving}
                rodape={
                    <>
                        {isEdit && (
                            <button type="button" onClick={() => setConfirmarExcluir(true)} disabled={saving} className={`${BTN_PERIGO_TXT} order-last lg:order-first`}>
                                <IconTrash size={18} stroke={1.8} />
                                Excluir
                            </button>
                        )}
                        <div className="flex flex-1 gap-2 lg:justify-end lg:gap-3 [&>*]:flex-1 lg:[&>*]:flex-none">
                            <button type="button" onClick={onCancel} className={BTN_SEC} disabled={saving}>
                                Voltar
                            </button>
                            <button
                                type="button"
                                onClick={save}
                                disabled={!canSave || saving}
                                className={BTN_PRI}
                                title={canSave ? undefined : "Preencha o nome e o endereço"}
                            >
                                <IconCheck size={18} stroke={2.2} />
                                {saving ? "Salvando…" : "Salvar"}
                            </button>
                        </div>
                    </>
                }
            >
                <div className="space-y-6">
                    {/* IDENTIFICAÇÃO */}
                    <section>
                        <h3 className={TITULO_BLOCO}>Identificação</h3>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Campo label="Nome" obrigatorio>
                                <input
                                    value={model.nome}
                                    onChange={(e) => set("nome", e.target.value)}
                                    className={CAMPO}
                                    placeholder="Nome do profissional ou clínica"
                                />
                            </Campo>
                            <Campo label="Unidade">
                                <input
                                    value={model.unidade}
                                    onChange={(e) => set("unidade", e.target.value)}
                                    className={CAMPO}
                                    placeholder="Ex.: Unidade Centro"
                                />
                            </Campo>
                            <Campo label="Descrição" className="sm:col-span-2">
                                <textarea
                                    value={model.descricao}
                                    onChange={(e) => set("descricao", e.target.value)}
                                    rows={3}
                                    className={`${CAMPO} h-auto min-h-[96px] py-3`}
                                    placeholder="Breve descrição para uso interno ou apoio"
                                />
                            </Campo>

                            <div className="sm:col-span-2">
                                <span className={ROTULO}>Situação</span>
                                <div className="inline-flex rounded-xl border border-[#E3E8F0] bg-white p-1 dark:border-white/[0.12] dark:bg-[#1C2334]" role="radiogroup" aria-label="Situação">
                                    {[
                                        { v: true, t: "Ativo" },
                                        { v: false, t: "Inativo" },
                                    ].map((o) => {
                                        const on = model.ativo === o.v;
                                        return (
                                            <button
                                                key={o.t}
                                                type="button"
                                                role="radio"
                                                aria-checked={on}
                                                onClick={() => set("ativo", o.v)}
                                                className={[
                                                    "inline-flex h-10 min-w-[96px] items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-bold transition",
                                                    on
                                                        ? o.v
                                                            ? "bg-[#B3CE52] text-[#313C55]"
                                                            : "bg-[#5B6478] text-white"
                                                        : `${TXT_SEC} hover:text-[#313C55] dark:hover:text-white`,
                                                ].join(" ")}
                                            >
                                                {on ? <IconCheck size={16} stroke={2.4} /> : null}
                                                {o.t}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* CATEGORIAS E EXAMES */}
                    <section>
                        <h3 className={TITULO_BLOCO}>Categorias e exames</h3>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <MultiSelectDropdown
                                label="Categorias"
                                items={categorias}
                                selectedIds={model.categoria_ids}
                                onToggle={(id) => toggleArrayId("categoria_ids", id)}
                                onClear={() => clearArray("categoria_ids")}
                                onManage={() => setShowCategoriasManager(true)}
                                placeholder="Selecione uma ou mais categorias"
                                emptyText="Nenhuma categoria encontrada."
                            />
                            <MultiSelectDropdown
                                label="Exames / Procedimentos"
                                items={especialidades}
                                selectedIds={model.especialidade_ids}
                                onToggle={(id) => toggleArrayId("especialidade_ids", id)}
                                onClear={() => clearArray("especialidade_ids")}
                                onManage={() => setShowEspecialidadesManager(true)}
                                placeholder="Selecione um ou mais itens"
                                emptyText="Nenhum exame ou procedimento encontrado."
                            />
                        </div>
                    </section>

                    {/* CONTATO */}
                    <section>
                        <h3 className={TITULO_BLOCO}>Contato</h3>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Campo label="WhatsApp (só números)">
                                <input
                                    value={model.whatsapp}
                                    onChange={(e) => set("whatsapp", cleanDigits(e.target.value))}
                                    className={CAMPO}
                                    inputMode="numeric"
                                    placeholder="5577999998888"
                                />
                            </Campo>
                            <Campo label="Telefone (só números)">
                                <input
                                    value={model.telefone}
                                    onChange={(e) => set("telefone", cleanDigits(e.target.value))}
                                    className={CAMPO}
                                    inputMode="numeric"
                                    placeholder="7736110000"
                                />
                            </Campo>
                            <Campo label="Instagram (link ou @)">
                                <input
                                    value={model.instagram}
                                    onChange={(e) => set("instagram", e.target.value)}
                                    className={CAMPO}
                                    placeholder="@usuario"
                                />
                            </Campo>
                            <Campo label="Site">
                                <input
                                    value={model.site}
                                    onChange={(e) => set("site", e.target.value)}
                                    className={CAMPO}
                                    inputMode="url"
                                    placeholder="https://exemplo.com"
                                />
                            </Campo>
                        </div>
                    </section>

                    {/* ENDEREÇO */}
                    <section>
                        <h3 className={TITULO_BLOCO}>Endereço</h3>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                            <Campo label="Endereço" obrigatorio>
                                <input
                                    value={model.endereco}
                                    onChange={(e) => set("endereco", e.target.value)}
                                    className={CAMPO}
                                    placeholder="Rua, número, complemento, bairro"
                                />
                            </Campo>
                            <Campo label="CEP">
                                <input
                                    value={model.cep}
                                    onChange={(e) => set("cep", e.target.value)}
                                    className={CAMPO}
                                    inputMode="numeric"
                                    placeholder="00000-000"
                                />
                            </Campo>
                            <Campo label="Link do mapa" className="sm:col-span-2">
                                <input
                                    value={model.mapa_url}
                                    onChange={(e) => set("mapa_url", e.target.value)}
                                    className={CAMPO}
                                    inputMode="url"
                                    placeholder="https://www.google.com/maps/…"
                                />
                            </Campo>
                        </div>
                    </section>

                    {!canSave ? (
                        <p className={`text-[13px] ${TXT_SEC}`}>
                            <span className="text-[#B42318] dark:text-[#FF9C92]">*</span> Nome e endereço são obrigatórios para salvar.
                        </p>
                    ) : null}
                </div>
            </Janela>

            {showCategoriasManager && (
                <LookupManagerModal
                    title="Categorias"
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

            {confirmarExcluir ? (
                <ConfirmarExclusao
                    titulo="Excluir parceiro?"
                    texto={
                        <>
                            <b className="text-[#313C55] dark:text-white">{model.nome || "Este parceiro"}</b> será removido da rede de atendimento.
                        </>
                    }
                    ocupado={saving}
                    onCancelar={() => setConfirmarExcluir(false)}
                    onConfirmar={() => void removeInsideModal()}
                />
            ) : null}
        </>
    );
}

/* ================== Linha da lista ================== */

function BotaoContato({ href, titulo, children }: { href: string; titulo: string; children: React.ReactNode }) {
    if (!href) return null;
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-grid size-10 shrink-0 place-items-center rounded-lg text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/[0.08] lg:size-9"
            title={titulo}
            aria-label={titulo}
        >
            {children}
        </a>
    );
}

/** Uma linha da lista: nome · categorias · endereço e telefones · contatos e editar. */
function LinhaParceiro({ r, onEdit }: { r: ApiConsulta; onEdit: () => void }) {
    const ativo = isActive(r.ativo);
    const tel = cleanDigits(String(r.telefone ?? ""));
    const cats = r.categorias ?? [];
    const exames = (r.especialidades ?? []).map((x) => x.nome);
    const MAX_CATS = 2;
    const fones = [r.whatsapp ? formatTelefone(r.whatsapp) : "", tel ? formatTelefone(tel) : ""].filter(Boolean);

    return (
        <li
            className={[
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 transition hover:bg-[#F6F8FB] dark:hover:bg-white/[0.04]",
                "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.3fr)_232px] lg:gap-x-4",
                ativo ? "" : "opacity-60",
            ].join(" ")}
        >
            {/* Nome */}
            <button type="button" onClick={onEdit} className="min-w-0 text-left" title="Editar">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[15px] font-extrabold">{r.nome}</span>
                    {!ativo ? <SeloStatus ativo={false} /> : null}
                </span>
                {r.unidade ? <span className={`block truncate text-[12.5px] ${TXT_SEC}`}>{r.unidade}</span> : null}
            </button>

            {/* Ações (no celular ficam ao lado do nome) */}
            <div className="row-span-3 flex items-center justify-end gap-0.5 self-start lg:order-last lg:row-span-1 lg:self-center">
                <BotaoContato href={linkWhatsapp(r.whatsapp)} titulo="Abrir WhatsApp">
                    <IconBrandWhatsapp size={19} stroke={1.8} />
                </BotaoContato>
                <span className="hidden lg:contents">
                    <BotaoContato href={tel ? `tel:${tel}` : ""} titulo="Ligar">
                        <IconPhone size={19} stroke={1.8} />
                    </BotaoContato>
                    <BotaoContato href={linkMapa(r)} titulo="Abrir no mapa">
                        <IconMapPin size={19} stroke={1.8} />
                    </BotaoContato>
                    <BotaoContato href={linkInstagram(r.instagram)} titulo="Instagram">
                        <IconBrandInstagram size={19} stroke={1.8} />
                    </BotaoContato>
                    <BotaoContato href={linkSite(r.site)} titulo="Site">
                        <IconWorld size={19} stroke={1.8} />
                    </BotaoContato>
                </span>
                <button
                    type="button"
                    onClick={onEdit}
                    className="inline-grid size-10 shrink-0 place-items-center rounded-lg text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/[0.08] lg:size-9"
                    title="Editar"
                    aria-label={`Editar ${r.nome}`}
                >
                    <IconPencil size={19} stroke={1.8} />
                </button>
            </div>

            {/* Categorias (e exames no título) */}
            <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden" title={exames.length ? `Exames: ${exames.join(", ")}` : undefined}>
                {cats.length ? (
                    <>
                        {cats.slice(0, MAX_CATS).map((c) => (
                            <span
                                key={c.id}
                                className="min-w-0 max-w-full truncate rounded-full bg-[#E9EFF6] px-2 py-0.5 text-[11.5px] font-bold text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white"
                            >
                                {c.nome}
                            </span>
                        ))}
                        {cats.length > MAX_CATS ? (
                            <span
                                className="shrink-0 rounded-full bg-[#EEF2F7] px-2 py-0.5 text-[11.5px] font-bold text-[#5B6478] dark:bg-white/10 dark:text-[#AEB9CF]"
                                title={cats.map((c) => c.nome).join(", ")}
                            >
                                +{cats.length - MAX_CATS}
                            </span>
                        ) : null}
                    </>
                ) : (
                    <span className={`text-[12.5px] ${TXT_SEC}`}>—</span>
                )}
            </div>

            {/* Endereço e telefones */}
            <div className={`min-w-0 text-[12.5px] leading-5 ${TXT_SEC}`}>
                <a
                    href={linkMapa(r) || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-[#313C55] hover:underline dark:text-[#D6DCE8]"
                    title={r.endereco}
                >
                    {r.endereco || "—"}
                </a>
                {fones.length ? (
                    <span className="block truncate">
                        {r.whatsapp ? (
                            <a href={linkWhatsapp(r.whatsapp)} target="_blank" rel="noreferrer" className="hover:underline">
                                {formatTelefone(r.whatsapp)}
                            </a>
                        ) : null}
                        {r.whatsapp && tel ? " · " : null}
                        {tel ? (
                            <a href={`tel:${tel}`} className="hover:underline">
                                {formatTelefone(tel)}
                            </a>
                        ) : null}
                    </span>
                ) : null}
            </div>
        </li>
    );
}

/* ================== Página ================== */

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

    // Aviso na tela (substitui os alert do navegador).
    const [aviso, setAviso] = useState<Aviso | null>(null);
    const avisoTimer = useRef<number | null>(null);

    useEffect(() => {
        const onAviso = (e: Event) => {
            const det = (e as CustomEvent<Aviso>).detail;
            if (!det) return;
            if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
            setAviso(det);
            if (det.tipo === "ok") avisoTimer.current = window.setTimeout(() => setAviso(null), 4000);
        };
        window.addEventListener(EVENTO_AVISO, onAviso);
        return () => {
            window.removeEventListener(EVENTO_AVISO, onAviso);
            if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
        };
    }, []);

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
            avisarErro(e);
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

    const atualizando = loading || loadingLookups;
    const categoriasAtivas = categorias.filter((c) => isActive(c.ativo));

    return (
        <main className="min-h-[calc(100dvh-1px)] bg-[#F6F8FB] text-[#313C55] dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 lg:px-10 lg:pb-12 lg:pt-8">
                {/* TOPO */}
                <header className="mb-4 flex flex-wrap items-start justify-between gap-3 lg:mb-6">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-extrabold leading-tight lg:text-[28px]">Rede de atendimento</h1>
                        <p className={`mt-1 text-sm ${TXT_SEC}`}>Médicos, clínicas e laboratórios parceiros.</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void Promise.all([loadLookups(), load()])}
                            disabled={atualizando}
                            className={BTN_ICONE}
                            title="Atualizar"
                            aria-label="Atualizar"
                        >
                            <IconRefresh size={20} stroke={1.8} className={atualizando ? "animate-spin" : ""} />
                        </button>
                        <button type="button" onClick={openCreate} className={BTN_PRI}>
                            <IconPlus size={18} stroke={2.2} />
                            Novo parceiro
                        </button>
                    </div>
                </header>

                {/* FILTROS */}
                <section className={`mb-4 ${CARD} p-3 lg:mb-5`}>
                    <div className="flex flex-col gap-2 lg:flex-row">
                        <span className="flex h-12 w-full min-w-0 shrink-0 items-center lg:w-auto lg:flex-1 gap-2.5 rounded-xl border border-transparent bg-[#F1F4F8] px-3 text-[#5B6478] focus-within:border-[#3D6A99] focus-within:ring-2 focus-within:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                            <IconSearch size={20} stroke={1.8} className="shrink-0" />
                            <input
                                type="search"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Nome, exame ou endereço"
                                aria-label="Buscar"
                                className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] dark:text-white dark:placeholder:text-[#8893AA]"
                            />
                        </span>

                        <div className="flex gap-2">
                        <label className="relative block min-w-0 flex-1 lg:w-[260px] lg:flex-none">
                            <span className="sr-only">Categoria</span>
                            <select
                                value={catId === "TODAS" ? "TODAS" : String(catId)}
                                onChange={(e) => setCatId(e.target.value === "TODAS" ? "TODAS" : Number(e.target.value))}
                                className={`${CAMPO} appearance-none truncate pr-10 text-[15px] font-bold`}
                            >
                                <option value="TODAS">Todas as categorias</option>
                                {categoriasAtivas.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}
                                    </option>
                                ))}
                            </select>
                            <IconChevronDown size={18} stroke={1.8} className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${TXT_SEC}`} />
                        </label>

                        <div className="inline-flex shrink-0 rounded-xl border border-[#E3E8F0] bg-white p-1 dark:border-white/[0.12] dark:bg-[#1C2334]" role="group" aria-label="Situação">
                            {(
                                [
                                    { v: "apenasAtivos", t: "Ativos" },
                                    { v: "todos", t: "Todos" },
                                ] as const
                            ).map((o) => (
                                <button
                                    key={o.v}
                                    type="button"
                                    aria-pressed={ativos === o.v}
                                    onClick={() => setAtivos(o.v)}
                                    className={[
                                        "h-10 rounded-lg px-3.5 text-sm font-bold transition",
                                        ativos === o.v ? "bg-[#313C55] text-white dark:bg-[#3D6A99]" : `${TXT_SEC} hover:text-[#313C55] dark:hover:text-white`,
                                    ].join(" ")}
                                >
                                    {o.t}
                                </button>
                            ))}
                        </div>
                        </div>
                    </div>
                </section>

                {/* AVISOS */}
                {aviso ? (
                    <div
                        role={aviso.tipo === "erro" ? "alert" : "status"}
                        className={[
                            "mb-4 flex items-start gap-2 rounded-[14px] border px-4 py-3 text-sm font-bold",
                            aviso.tipo === "erro"
                                ? "border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"
                                : "border-[#B3CE52] bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/[0.18] dark:text-white",
                        ].join(" ")}
                    >
                        <span className="min-w-0 flex-1">{aviso.texto}</span>
                        <button type="button" onClick={() => setAviso(null)} className="-my-1 grid size-8 shrink-0 place-items-center rounded-lg hover:bg-black/5" aria-label="Fechar aviso">
                            <IconX size={16} stroke={2} />
                        </button>
                    </div>
                ) : null}

                {/* LISTA */}
                {loading ? (
                    <div className={`${CARD} p-6 text-center text-sm font-bold ${TXT_SEC}`}>Carregando…</div>
                ) : err ? (
                    <div role="alert" className="rounded-[14px] border border-[#B42318] bg-[#FDECEA] px-4 py-3 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                        {err}
                    </div>
                ) : (
                    <>
                        <p className={`mb-2.5 text-[13px] font-bold ${TXT_SEC}`}>
                            {filtered.length === 1 ? "1 parceiro" : `${filtered.length} parceiros`}
                        </p>

                        {filtered.length === 0 ? (
                            <div className={`${CARD} px-6 py-10 text-center`}>
                                <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white">
                                    <IconStethoscope size={28} stroke={1.8} />
                                </span>
                                <p className="font-extrabold">Nenhum parceiro encontrado</p>
                                <p className={`mt-1 text-sm ${TXT_SEC}`}>Ajuste a busca ou os filtros, ou cadastre um novo parceiro.</p>
                            </div>
                        ) : (
                            <div className={`overflow-hidden ${CARD}`}>
                                <div className={`hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.3fr)_232px] gap-x-4 border-b border-[#E3E8F0] bg-[#F6F8FB] px-4 py-2.5 text-[11.5px] font-extrabold uppercase tracking-[.08em] dark:border-white/[0.12] dark:bg-[#1C2334] lg:grid ${TXT_SEC}`}>
                                    <span>Parceiro</span>
                                    <span>Categorias</span>
                                    <span>Endereço e telefones</span>
                                    <span className="text-right">Contato</span>
                                </div>
                                <ul className="divide-y divide-[#E3E8F0] dark:divide-white/[0.12]">
                                    {filtered.map((r) => (
                                        <LinhaParceiro key={r.id} r={r} onEdit={() => openEdit(r)} />
                                    ))}
                                </ul>
                            </div>
                        )}
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
