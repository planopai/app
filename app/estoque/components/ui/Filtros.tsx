"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ID, Opt } from "../tipos";
import { Button, Field, TextInput } from "./Basicos";
import { JanelaBase } from "./Modal";

// Filtros de várias opções e a janela de filtros.

export function MultiSelectDropdown({
    label,
    options,
    selectedIds,
    onChangeIds,
    allLabel = "Todos",
    placeholder = "Selecionar...",
}: {
    label: string;
    options: Opt[];
    selectedIds: ID[];
    onChangeIds: (ids: ID[]) => void;
    allLabel?: string;
    placeholder?: string;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");

    const optMap = useMemo(() => new Map(options.map((o) => [o.id, o.nome])), [options]);

    const displayText = useMemo(() => {
        if (!selectedIds.length) return allLabel;

        const names = selectedIds.map((id) => optMap.get(id) || `#${id}`);
        if (names.length <= 2) return names.join(", ");
        return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
    }, [selectedIds, optMap, allLabel]);

    const filtered = useMemo(() => {
        const qq = q.trim().toLowerCase();
        if (!qq) return options;
        return options.filter((o) => o.nome.toLowerCase().includes(qq));
    }, [options, q]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!wrapRef.current) return;
            if (!wrapRef.current.contains(e.target as any)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    function toggle(id: ID) {
        const has = selectedIds.includes(id);
        const next = has ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
        onChangeIds(next);
    }

    return (
        <Field label={label}>
            <div ref={wrapRef} className="relative">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className={[
                        "h-12 w-full rounded-xl border border-transparent bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none dark:bg-[#1C2334] dark:text-white lg:text-[15px]",
                        "focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20",
                        "flex items-center justify-between gap-2",
                    ].join(" ")}
                >
                    <span className={["truncate", !selectedIds.length ? "text-[#5B6478] dark:text-[#AEB9CF]" : "text-[#313C55] dark:text-white"].join(" ")}>
                        {displayText || placeholder}
                    </span>
                    <span className="text-[#7A8396] dark:text-[#8893AA]"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></span>
                </button>

                {open ? (
                    <div
                        className={[
                            "absolute z-30 mt-2 left-0",
                            "w-full min-w-[340px] max-w-[calc(100vw-2rem)]",
                            "overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/12 bg-[#FFFFFF] dark:bg-[#232B3F] shadow-lg",
                        ].join(" ")}
                    >
                        <div className="p-2 border-b border-[#E3E8F0] dark:border-white/12">
                            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." />
                            <div className="mt-2 flex gap-2">
                                <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={() => {
                                        onChangeIds([]);
                                        setQ("");
                                    }}
                                >
                                    Limpar
                                </Button>

                            </div>
                        </div>

                        <div className="max-h-64 overflow-auto p-2">
                            <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-[#EEF2F7] dark:hover:bg-white/8">
                                <input
                                    type="checkbox"
                                    checked={!selectedIds.length}
                                    onChange={() => onChangeIds([])}
                                    className="h-4 w-4"
                                />
                                <span className="text-sm text-[#5B6478] dark:text-[#AEB9CF]">{allLabel}</span>
                            </label>

                            <div className="my-2 border-t border-[#E3E8F0] dark:border-white/12" />

                            {filtered.length === 0 ? (
                                <div className="p-2 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Nenhum encontrado.</div>
                            ) : (
                                filtered.map((o) => (
                                    <label
                                        key={o.id}
                                        className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-[#EEF2F7] dark:hover:bg-white/8"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(o.id)}
                                            onChange={() => toggle(o.id)}
                                            className="h-4 w-4"
                                        />
                                        <span className="text-sm text-[#313C55] dark:text-white whitespace-nowrap">{o.nome}</span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </Field>
    );
}


export function FilterOptionPanel({
    title,
    options,
    selectedIds,
    onChangeIds,
    allLabel = "Todos",
    open,
    onToggle,
}: {
    title: string;
    options: Opt[];
    selectedIds: ID[];
    onChangeIds: (ids: ID[]) => void;
    allLabel?: string;
    open: boolean;
    onToggle: () => void;
}) {
    const [query, setQuery] = useState("");

    const selectedSet = useMemo(
        () => new Set(selectedIds.map(Number)),
        [selectedIds]
    );

    const filteredOptions = useMemo(() => {
        const q = query.trim().toLocaleLowerCase("pt-BR");
        if (!q) return options;
        return options.filter((option) =>
            option.nome.toLocaleLowerCase("pt-BR").includes(q)
        );
    }, [options, query]);

    function toggle(id: ID) {
        const numericId = Number(id);
        const next = selectedSet.has(numericId)
            ? selectedIds.filter((currentId) => Number(currentId) !== numericId)
            : [...selectedIds, numericId];
        onChangeIds(next);
    }

    return (
        <section className="overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/12 bg-[#FFFFFF] dark:bg-[#232B3F] shadow-sm">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className={[
                    "flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition sm:px-5",
                    open ? "bg-[#F6F8FB] dark:bg-[#1C2334]" : "bg-[#FFFFFF] dark:bg-[#232B3F] hover:bg-[#EEF2F7] dark:hover:bg-white/8",
                ].join(" ")}
            >
                <span className="min-w-0">
                    <span className="block text-sm font-bold text-[#313C55] dark:text-white sm:text-base">
                        {title}
                    </span>
                    <span className="mt-1 block truncate text-xs text-[#7A8396] dark:text-[#8893AA]">
                        {selectedIds.length
                            ? `${selectedIds.length} selecionado(s)`
                            : allLabel}
                    </span>
                </span>

                <span className="flex shrink-0 items-center gap-3">
                    {selectedIds.length ? (
                        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#313C55] px-1.5 text-[12px] font-extrabold text-white dark:bg-[#3D6A99]">
                            {selectedIds.length}
                        </span>
                    ) : null}
                    <span
                        aria-hidden="true"
                        className={[
                            "grid h-9 w-9 place-items-center rounded-full border border-[#E3E8F0] dark:border-white/12 bg-[#FFFFFF] dark:bg-[#232B3F] text-[#5B6478] dark:text-[#AEB9CF] transition-transform",
                            open ? "rotate-180" : "rotate-0",
                        ].join(" ")}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </span>
                </span>
            </button>

            {open ? (
                <div className="border-t border-[#E3E8F0] dark:border-white/12">
                    <div className="border-b border-[#E3E8F0] dark:border-white/12 p-3 sm:p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="relative min-w-0 flex-1">
                                <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[#7A8396] dark:text-[#8893AA]">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                                </span>
                                <TextInput
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={`Buscar em ${title.toLocaleLowerCase("pt-BR")}...`}
                                    className="pl-10"
                                />
                            </div>

                            {selectedIds.length ? (
                                <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={() => onChangeIds([])}
                                    className="w-full whitespace-nowrap sm:w-auto"
                                >
                                    Mostrar todos
                                </Button>
                            ) : null}
                        </div>
                    </div>

                    <div className="max-h-[42dvh] overflow-y-auto overscroll-contain p-2 sm:max-h-[330px] [scrollbar-gutter:stable]">
                        {filteredOptions.length === 0 ? (
                            <div className="p-5 text-center text-sm text-[#7A8396] dark:text-[#8893AA]">
                                Nenhuma opção encontrada.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-1">
                                {filteredOptions.map((option) => {
                                    const checked = selectedSet.has(Number(option.id));
                                    return (
                                        <label
                                            key={option.id}
                                            className={[
                                                "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                                                checked
                                                    ? "border-[#A9BED6] dark:border-[#3D6A99]/60 bg-[#E9EFF6] dark:bg-[#3D6A99]/20 text-[#313C55] dark:text-white"
                                                    : "border-transparent text-[#5B6478] dark:text-[#AEB9CF] hover:border-[#E3E8F0] dark:hover:border-white/12 hover:bg-[#EEF2F7] dark:hover:bg-white/8",
                                            ].join(" ")}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggle(option.id)}
                                                className="h-5 w-5 shrink-0 accent-[#3D6A99]"
                                            />
                                            <span className="min-w-0 flex-1 break-words text-sm font-medium">
                                                {option.nome}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </section>
    );
}

export function FilterPanelModal({
    open,
    title,
    subtitle,
    onClose,
    children,
    footer,
    panelClassName = "",
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    panelClassName?: string;
}) {
    return (
        <JanelaBase open={open} title={title} subtitle={subtitle} onClose={onClose} footer={footer} panelClassName={panelClassName || "lg:max-w-4xl"} ariaFechar="Fechar filtros">
            {children}
        </JanelaBase>
    );
}
