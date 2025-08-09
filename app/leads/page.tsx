"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    IconUserCircle,
    IconSearch,
    IconSortAscendingLetters,
    IconDownload,
    IconCheckbox,
    IconChevronLeft,
    IconChevronRight,
    IconRefresh,
} from "@tabler/icons-react";

/* ===== types ===== */
type Lead = {
    id: number;
    nome: string;
    pais: string;
    estado: string;
    cidade: string;
    telefone: string;
};

type ApiLead = {
    id: number;
    nome: string;
    pais: string;
    estado: string;
    cidade: string;
    telefone: string;
};

const ENDPOINT = "/obter_leads.php";

/* ===== estilos de botões (iguais ao restante do projeto) ===== */
const btnOutline =
    "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold " +
    "border-primary text-primary hover:bg-primary/5 active:bg-primary/10 disabled:opacity-50";

const btnNeutral =
    "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold " +
    "border-muted text-foreground hover:bg-muted/40 active:bg-muted/50 disabled:opacity-50";

/* ===== helpers ===== */
function toCSVRow(fields: string[]) {
    // Aspas duplas escapadas para segurança
    return fields.map((v) => `"${(v ?? "").replace(/"/g, '""')}"`).join(",");
}

function downloadCSV(filename: string, rows: string[]) {
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/* ===== card do lead ===== */
function LeadCard({
    lead,
    checked,
    onToggle,
}: {
    lead: Lead;
    checked: boolean;
    onToggle: (id: number) => void;
}) {
    return (
        <div className="flex items-start gap-3 rounded-xl border bg-card/70 p-3 shadow-sm sm:p-4">
            <div className="shrink-0">
                <input
                    type="checkbox"
                    className="mt-2 size-5 rounded border-muted"
                    checked={checked}
                    onChange={() => onToggle(lead.id)}
                    aria-label={`Selecionar ${lead.nome}`}
                />
            </div>
            <div className="shrink-0">
                <div className="grid size-12 place-items-center rounded-md border">
                    <IconUserCircle className="size-6 text-muted-foreground" />
                </div>
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold">{lead.nome}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                    <div>
                        <span className="font-medium text-foreground">País:</span> {lead.pais}
                    </div>
                    <div>
                        <span className="font-medium text-foreground">Estado:</span> {lead.estado}
                    </div>
                    <div>
                        <span className="font-medium text-foreground">Cidade:</span> {lead.cidade}
                    </div>
                    <div>
                        <span className="font-medium text-foreground">Telefone:</span> {lead.telefone}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ===== paginação simples ===== */
function Pager({
    page,
    pages,
    onPrev,
    onNext,
}: {
    page: number;
    pages: number;
    onPrev: () => void;
    onNext: () => void;
}) {
    return (
        <div className="mt-4 flex items-center justify-center gap-3">
            <button
                onClick={onPrev}
                disabled={page <= 1}
                className={btnNeutral + " min-w-[112px] disabled:cursor-not-allowed"}
            >
                <IconChevronLeft className="size-4" />
                Anterior
            </button>
            <span className="text-sm text-muted-foreground">
                Página <span className="font-semibold text-foreground">{page}</span> de{" "}
                <span className="font-semibold text-foreground">{pages}</span>
            </span>
            <button
                onClick={onNext}
                disabled={page >= pages}
                className={btnNeutral + " min-w-[112px] disabled:cursor-not-allowed"}
            >
                Próximo
                <IconChevronRight className="size-4" />
            </button>
        </div>
    );
}

/* ===== página ===== */
export default function LeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // paginação
    const perPage = 10;
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const arr = !q
            ? leads
            : leads.filter((l) => l.nome.toLowerCase().includes(q));
        return arr;
    }, [leads, query]);

    const pages = Math.max(1, Math.ceil(filtered.length / perPage));
    const pageData = useMemo(() => {
        const start = (page - 1) * perPage;
        return filtered.slice(start, start + perPage);
    }, [filtered, page]);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            setSelected(new Set());
            const res = await fetch(`${ENDPOINT}?_=${Date.now()}`, { cache: "no-store" });
            if (!res.ok) throw new Error("Erro na resposta do servidor.");
            const data: ApiLead[] = await res.json();
            const mapped: Lead[] = data.map((item) => ({
                id: item.id,
                nome: item.nome,
                pais: item.pais,
                estado: item.estado,
                cidade: item.cidade,
                telefone: item.telefone,
            }));
            setLeads(mapped);
            setPage(1);
        } catch (e: any) {
            setError(e?.message || "Erro ao carregar dados.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const toggleSelected = (id: number) => {
        setSelected((prev) => {
            const copy = new Set(prev);
            if (copy.has(id)) copy.delete(id);
            else copy.add(id);
            return copy;
        });
    };

    const selectVisible = () => {
        setSelected((prev) => {
            const ids = new Set(prev);
            pageData.forEach((l) => ids.add(l.id));
            return ids;
        });
    };

    const clearSelection = () => setSelected(new Set());

    const sortByName = () => {
        setLeads((arr) => [...arr].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
        setPage(1);
    };

    const exportAll = () => {
        const header = toCSVRow(["Nome Completo", "País", "Estado", "Cidade", "Telefone"]);
        const rows = leads.map((l) => toCSVRow([l.nome, l.pais, l.estado, l.cidade, l.telefone]));
        downloadCSV("leads.csv", [header, ...rows]);
    };

    const exportSelected = () => {
        const picked = leads.filter((l) => selected.has(l.id));
        if (picked.length === 0) {
            alert("Nenhum item selecionado.");
            return;
        }
        const header = toCSVRow(["Nome Completo", "País", "Estado", "Cidade", "Telefone"]);
        const rows = picked.map((l) => toCSVRow([l.nome, l.pais, l.estado, l.cidade, l.telefone]));
        downloadCSV("leads_selecionados.csv", [header, ...rows]);
    };

    return (
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-4">
            {/* Topbar */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Leads Sistema Velório Online</h1>
                    <p className="text-sm text-muted-foreground">
                        Busque, ordene, selecione e exporte os leads capturados.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={load} className={btnNeutral} title="Atualizar">
                        <IconRefresh className="size-4" />
                        Atualizar
                    </button>
                </div>
            </div>

            {/* Barra de busca + ações */}
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div className="col-span-2 lg:col-span-1">
                    <div className="relative">
                        <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setPage(1);
                            }}
                            placeholder="Buscar por nome..."
                            className="input w-full pl-9"
                        />
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={sortByName} className={btnNeutral}>
                        <IconSortAscendingLetters className="size-4" />
                        Ordenar por Nome
                    </button>
                    <button onClick={exportAll} className={btnOutline}>
                        <IconDownload className="size-4" />
                        Exportar Todos
                    </button>
                    <button onClick={exportSelected} className={btnOutline}>
                        <IconCheckbox className="size-4" />
                        Exportar Selecionados
                    </button>
                </div>
            </div>

            {/* Seleção rápida visível / limpar */}
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <button onClick={selectVisible} className="underline underline-offset-4">
                    Selecionar itens desta página
                </button>
                <span className="text-muted-foreground">•</span>
                <button onClick={clearSelection} className="underline underline-offset-4">
                    Limpar seleção
                </button>
                {selected.size > 0 && (
                    <>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">{selected.size} selecionado(s)</span>
                    </>
                )}
            </div>

            {/* Estado */}
            {loading && (
                <div className="mb-4 rounded-md border bg-muted/30 px-3 py-2 text-sm">Carregando dados…</div>
            )}
            {error && (
                <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200">
                    {error}
                </div>
            )}

            {/* Lista */}
            {pageData.length === 0 && !loading ? (
                <div className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
                    Nenhum lead encontrado.
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {pageData.map((lead) => (
                        <LeadCard
                            key={lead.id}
                            lead={lead}
                            checked={selected.has(lead.id)}
                            onToggle={toggleSelected}
                        />
                    ))}
                </div>
            )}

            {/* Paginação */}
            <Pager
                page={page}
                pages={pages}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(pages, p + 1))}
            />
        </div>
    );
}
