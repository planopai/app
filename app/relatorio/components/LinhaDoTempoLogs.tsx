"use client";

import React, { useState } from "react";
import { IconX } from "@tabler/icons-react";
import { LogItem } from "./TiposHistorico";
import { traduzirFase, iconeAcao } from "./ConstantesFases";
import { formataDataHora, formataSeDataIso } from "./UtilDatas";
import { isNoChangeEntry, asBool } from "./Normalizadores";
import {
    overrideCampoNome,
    substituirRotuloVisual,
    titleCaseFromSnake,
    sanitize,
    capitalize,
} from "./UtilTexto";
import type { MateriaisMap } from "./Api";

interface Props {
    logs: LogItem[];
    usuarioVisivel?: boolean;
    materiaisMap?: MateriaisMap;
}

function safeJsonParse(v: any) {
    if (v == null) return null;
    if (typeof v === "object") return v;
    if (typeof v !== "string") return null;
    try {
        return JSON.parse(v);
    } catch {
        return null;
    }
}

function labelFromKey(key: string) {
    const m = String(key).match(/^(item|subitem)\s*:\s*(.+)$/i);
    if (m) {
        const tipo = m[1].toLowerCase() === "subitem" ? "Subitem" : "Item";
        return `${tipo} ${String(m[2]).trim()}`;
    }
    const base = titleCaseFromSnake(String(key).replace(/:/g, "_"));
    return overrideCampoNome(key, base);
}

function normMatKey(k: string) {
    return String(k || "").trim().toLowerCase().replace(/\s+/g, "");
}

type MatLinha = { categoria: string; nome: string; qtd: number };

function extrairMateriaisDoMateriaisJson(
    materiaisJson: any,
    materiaisMap?: MateriaisMap
): MatLinha[] {
    const mj = safeJsonParse(materiaisJson);
    const out: MatLinha[] = [];
    if (!mj || typeof mj !== "object") return out;

    for (const [k, vv] of Object.entries(mj)) {
        const v: any = vv || {};
        const qtdNum = Number(v?.qtd ?? 0);
        const qtd = Number.isFinite(qtdNum) ? Math.max(0, Math.floor(qtdNum)) : 0;

        const checked = asBool(v?.checked) || qtd > 0;
        if (!checked || qtd <= 0) continue;

        const overrideNome =
            (typeof v?.nome === "string" && v.nome.trim()) ||
            (typeof v?.rotulo === "string" && v.rotulo.trim()) ||
            (typeof v?.label === "string" && v.label.trim()) ||
            "";

        const fromMap = materiaisMap?.[normMatKey(String(k))];

        const categoria =
            (typeof v?.categoria_nome === "string" && v.categoria_nome.trim()) ||
            (typeof v?.categoria === "string" && v.categoria.trim()) ||
            fromMap?.categoria ||
            "Material";

        const nome = overrideNome || fromMap?.nome || labelFromKey(String(k));

        out.push({ categoria, nome, qtd });
    }

    out.sort((a, b) =>
        (a.categoria + " " + a.nome).localeCompare(b.categoria + " " + b.nome, "pt-BR", {
            sensitivity: "base",
        })
    );

    return out;
}

function agruparMateriais(mats: MatLinha[]) {
    const map = new Map<string, MatLinha[]>();

    for (const it of mats) {
        const cat = (it.categoria || "").trim() || "Material";
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat)!.push(it);
    }

    const grupos = Array.from(map.entries()).sort(([a], [b]) =>
        a.localeCompare(b, "pt-BR", { sensitivity: "base" })
    );

    for (const [, arr] of grupos) {
        arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
    }

    return grupos;
}

/* ========================
   Fotos das ações
   ======================== */

function isFotoAcaoUrl(v: any): boolean {
    const s = String(v ?? "").trim();
    return s.includes("/uploads/acoes_fotos/") || s.includes("uploads/acoes_fotos/");
}

function extrairFotoAcaoUrl(v: any): string {
    const s = String(v ?? "").trim();
    if (!s) return "";

    const match =
        s.match(/https?:\/\/[^\s"'<>]*\/uploads\/acoes_fotos\/[^\s"'<>]+/i) ||
        s.match(/\/uploads\/acoes_fotos\/[^\s"'<>]+/i) ||
        s.match(/uploads\/acoes_fotos\/[^\s"'<>]+/i);

    return match?.[0] || "";
}

function normalizarFotoAcaoUrl(v: any): string {
    let url = extrairFotoAcaoUrl(v);
    if (!url) return "";

    url = url.trim();

    if (/^https?:\/\//i.test(url)) {
        return url
            .replace(
                "https://pai.planoassistencialintegrado.com.br",
                "https://api.planoassistencialintegrado.com.br"
            )
            .replace(
                "https://planoassistencialintegrado.com.br",
                "https://api.planoassistencialintegrado.com.br"
            );
    }

    if (url.startsWith("/uploads/")) {
        return `https://api.planoassistencialintegrado.com.br${url}`;
    }

    if (url.startsWith("uploads/")) {
        return `https://api.planoassistencialintegrado.com.br/${url}`;
    }

    return url;
}

function nomeFotoAcaoPorTexto(v: any): string {
    const s = String(v ?? "").toLowerCase();

    if (s.includes("fim_ornamentacao") || s.includes("ornamentacao")) {
        return "Foto da Ornamentação";
    }

    if (s.includes("entrega_corpo") || s.includes("paramentacao")) {
        return "Foto da Paramentação";
    }

    return "Foto da ação";
}

function fotoButtonHtml(url: string, titulo = "Foto da ação") {
    const safeUrl = sanitize(url);
    const safeTitle = sanitize(titulo);

    return `
        <button
            type="button"
            data-foto-url="${safeUrl}"
            data-foto-title="${safeTitle}"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            title="Ver foto"
            aria-label="Ver foto"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
                <path d="M15 8h.01" />
                <path d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" />
                <path d="m3 16 5-5c.928-.893 2.072-.893 3 0l5 5" />
                <path d="m14 14 1-1c.928-.893 2.072-.893 3 0l3 3" />
            </svg>
        </button>
    `;
}

function tituloDoLog(ent: LogItem) {
    if (ent.status_novo) {
        return traduzirFase(ent.status_novo);
    }

    return ent.acao ? capitalize(ent.acao) : "";
}

export default function LinhaDoTempoLogs({
    logs,
    usuarioVisivel = true,
    materiaisMap,
}: Props) {
    const [fotoModal, setFotoModal] = useState<{
        open: boolean;
        url: string;
        title: string;
    }>({
        open: false,
        url: "",
        title: "",
    });

    if (!logs || logs.length === 0) {
        return <div className="p-4 text-center text-muted-foreground">Nenhum log encontrado.</div>;
    }

    function handleClickDentroLog(e: React.MouseEvent<HTMLDivElement>) {
        const target = e.target as HTMLElement | null;
        const btn = target?.closest?.("[data-foto-url]") as HTMLElement | null;
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const url = btn.getAttribute("data-foto-url") || "";
        const title = btn.getAttribute("data-foto-title") || "Foto da ação";

        if (!url) return;

        setFotoModal({
            open: true,
            url,
            title,
        });
    }

    return (
        <>
            <div className="space-y-3" onClick={handleClickDentroLog}>
                {logs
                    .filter((l) => !isNoChangeEntry(l))
                    .map((ent, i) => {
                        let detalhesHtml = "";
                        const raw = ent.detalhes as any;

                        try {
                            const obj =
                                raw && typeof raw === "string"
                                    ? (JSON.parse(raw) as Record<string, any>)
                                    : (raw as Record<string, any>);

                            if (obj && typeof obj === "object") {
                                const chips: string[] = [];
                                const arrSet = new Set<string>();

                                const mats = extrairMateriaisDoMateriaisJson(obj.materiais_json, materiaisMap);

                                if (mats.length) {
                                    const grupos = agruparMateriais(mats);

                                    chips.push(
                                        `<div class="mt-2"><b>Materiais:</b></div>` +
                                        grupos
                                            .map(([cat, items]) => {
                                                const titulo = `<div class="mt-1 text-xs font-semibold text-muted-foreground">${sanitize(
                                                    cat
                                                )}</div>`;

                                                const chipsItens = items
                                                    .map(
                                                        (it) =>
                                                            `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2">
                                                                <b>${sanitize(it.nome)}:</b> ${sanitize(String(it.qtd))}
                                                            </span>`
                                                    )
                                                    .join("");

                                                return `<div>${titulo}${chipsItens}</div>`;
                                            })
                                            .join("")
                                    );
                                }

                                for (const key of Object.keys(obj)) {
                                    if (["materiais_json", "id", "acao", "sem_alteracoes"].includes(key)) continue;

                                    if (/^arrum[aã]cao(\s*json|_json)?$/i.test(key)) {
                                        let aobj: any = obj[key] || {};
                                        if (typeof aobj === "string") aobj = safeJsonParse(aobj) || {};

                                        if (aobj && typeof aobj === "object") {
                                            for (const [k, v] of Object.entries(aobj)) {
                                                if (asBool(v)) arrSet.add(`✅ ${titleCaseFromSnake(k)}`);
                                            }
                                        }

                                        continue;
                                    }

                                    const m = key.match(/^materiais_(.+?)_qtd$/i);

                                    if (m) {
                                        const valRaw = obj[key];

                                        if (valRaw != null && String(valRaw).trim() !== "") {
                                            const nomeBase = titleCaseFromSnake(m[1]);
                                            const nome = overrideCampoNome(m[1], nomeBase);
                                            const valFmt = formataSeDataIso(String(valRaw));

                                            chips.push(
                                                `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2"><b>${sanitize(
                                                    nome
                                                )}:</b> ${sanitize(String(valFmt))}</span>`
                                            );
                                        }

                                        continue;
                                    }

                                    if (typeof obj[key] === "object" && !Array.isArray(obj[key])) continue;

                                    let val = obj[key];
                                    if (val == null || String(val).trim() === "") continue;

                                    let nome = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                                    nome = overrideCampoNome(key, nome);

                                    if (isFotoAcaoUrl(val)) {
                                        const fotoUrl = normalizarFotoAcaoUrl(val);

                                        if (fotoUrl) {
                                            const tituloFoto = nomeFotoAcaoPorTexto(val);

                                            chips.push(
                                                `<div class="mt-2 flex flex-wrap items-center gap-2">
                                                    <span class="text-xs text-muted-foreground">${sanitize(tituloFoto)}:</span>
                                                    ${fotoButtonHtml(fotoUrl, tituloFoto)}
                                                </div>`
                                            );
                                        }

                                        continue;
                                    }

                                    val = String(val);
                                    if (val.startsWith("fase")) val = traduzirFase(val);
                                    val = formataSeDataIso(val);

                                    nome = substituirRotuloVisual(nome);
                                    val = substituirRotuloVisual(val);

                                    chips.push(
                                        `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2"><b>${sanitize(
                                            nome
                                        )}:</b> ${sanitize(val)}</span>`
                                    );
                                }

                                if (arrSet.size) {
                                    const items = Array.from(arrSet);

                                    chips.unshift(
                                        `<div class="mt-2"><b>Arrumação:</b> ${items
                                            .map(
                                                (t) =>
                                                    `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2">${sanitize(
                                                        t
                                                    )}</span>`
                                            )
                                            .join("")}</div>`
                                    );
                                }

                                if (chips.length) detalhesHtml = `<div class="mt-2">${chips.join("")}</div>`;
                            }
                        } catch {
                            let detalhesRaw = String(raw || "");
                            detalhesRaw = substituirRotuloVisual(detalhesRaw);

                            if (isFotoAcaoUrl(detalhesRaw)) {
                                const fotoUrl = normalizarFotoAcaoUrl(detalhesRaw);
                                const tituloFoto = nomeFotoAcaoPorTexto(detalhesRaw);

                                if (fotoUrl) {
                                    detalhesHtml = `
                                        <div class="mt-2 flex flex-wrap items-center gap-2">
                                            <span class="text-xs text-muted-foreground">${sanitize(tituloFoto)}:</span>
                                            ${fotoButtonHtml(fotoUrl, tituloFoto)}
                                        </div>
                                    `;
                                }
                            } else if (detalhesRaw.trim()) {
                                detalhesHtml = `<div class="mt-2 text-sm">${sanitize(detalhesRaw)}</div>`;
                            }
                        }

                        const titulo = tituloDoLog(ent);
                        const tituloHtml = titulo
                            ? `<div class="text-sm font-bold">${sanitize(titulo)}</div>`
                            : "";

                        const usuarioHtml =
                            usuarioVisivel && ent.usuario
                                ? `<div class="text-xs font-bold text-muted-foreground">${sanitize(
                                    ent.usuario || ""
                                )}</div>`
                                : "";

                        return (
                            <div
                                key={i}
                                className="log-entry rounded-xl border bg-background/60 p-3 shadow-sm"
                                dangerouslySetInnerHTML={{
                                    __html: `
                                        <div class="flex gap-3">
                                            <div class="text-xl leading-none">${iconeAcao(ent.acao, ent.status_novo)}</div>
                                            <div class="flex-1">
                                                <div class="text-xs text-muted-foreground">${formataDataHora(ent.datahora)}</div>
                                                ${tituloHtml}
                                                ${usuarioHtml}
                                                ${detalhesHtml}
                                            </div>
                                        </div>
                                    `,
                                }}
                            />
                        );
                    })}
            </div>

            {fotoModal.open && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 sm:p-6"
                    role="dialog"
                    aria-modal="true"
                    aria-label={fotoModal.title || "Foto da ação"}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setFotoModal({ open: false, url: "", title: "" });
                        }
                    }}
                >
                    <div className="w-full max-w-4xl overflow-hidden rounded-2xl border bg-white shadow-2xl">
                        <div className="flex items-center justify-between gap-3 border-b p-3 sm:p-4">
                            <div>
                                <h3 className="text-base font-semibold">
                                    {fotoModal.title || "Foto da ação"}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    Foto anexada ao histórico do atendimento.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
                                onClick={() => setFotoModal({ open: false, url: "", title: "" })}
                                title="Fechar"
                                aria-label="Fechar"
                            >
                                <IconX className="size-5" />
                            </button>
                        </div>

                        <div className="max-h-[78vh] overflow-auto bg-slate-50 p-3 sm:p-4">
                            <img
                                src={fotoModal.url}
                                alt={fotoModal.title || "Foto da ação"}
                                className="mx-auto max-h-[72vh] w-auto max-w-full rounded-xl border bg-white object-contain shadow-sm"
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}