"use client";

import React from "react";
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
    // suporta chaves novas tipo "item:123" / "subitem:45"
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

function extrairMateriaisDoMateriaisJson(
    materiaisJson: any,
    materiaisMap?: MateriaisMap
): Array<{ categoria: string; nome: string; qtd: number }> {
    const mj = safeJsonParse(materiaisJson);
    const out: Array<{ categoria: string; nome: string; qtd: number }> = [];
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
        (a.categoria + " " + a.nome).localeCompare(b.categoria + " " + b.nome, "pt-BR", { sensitivity: "base" })
    );
    return out;
}

export default function LinhaDoTempoLogs({ logs, usuarioVisivel = true, materiaisMap }: Props) {
    if (!logs || logs.length === 0) {
        return <div className="p-4 text-center text-muted-foreground">Nenhum log encontrado.</div>;
    }

    return (
        <div className="space-y-3">
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

                            // ✅ Materiais dinâmicos (novo): materiais_json -> "Categoria — Nome: qtd"
                            const mats = extrairMateriaisDoMateriaisJson(obj.materiais_json, materiaisMap);
                            if (mats.length) {
                                chips.push(
                                    `<div class="mt-2"><b>Materiais:</b> ${mats
                                        .map(
                                            (it) =>
                                                `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2">
                                                  <b>${sanitize(it.categoria)} — ${sanitize(it.nome)}:</b> ${sanitize(String(it.qtd))}
                                                </span>`
                                        )
                                        .join("")}</div>`
                                );
                            }

                            for (const key of Object.keys(obj)) {
                                // não renderiza duplicado (já tratamos acima)
                                if (["materiais_json", "id", "acao", "sem_alteracoes"].includes(key)) continue;

                                // Arrumação
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

                                // Materiais_*_qtd (legado)
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

                                // Campos simples
                                if (typeof obj[key] === "object" && !Array.isArray(obj[key])) continue;

                                let val = obj[key];
                                if (val == null || String(val).trim() === "") continue;

                                let nome = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                                nome = overrideCampoNome(key, nome);

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
                        if (detalhesRaw.trim()) detalhesHtml = `<div class="mt-2 text-sm">${sanitize(detalhesRaw)}</div>`;
                    }

                    const acao = ent.acao ? sanitize(capitalize(ent.acao)) : "";
                    const statusBadg = ent.status_novo
                        ? `<span class="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">${sanitize(
                            traduzirFase(ent.status_novo)
                        )}</span>`
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
                      <div class="text-sm">${acao} ${statusBadg}</div>
                      ${usuarioVisivel
                                        ? `<div class="text-xs text-muted-foreground">Usuário: ${sanitize(ent.usuario || "")}</div>`
                                        : ""
                                    }
                      ${detalhesHtml}
                    </div>
                  </div>
                `,
                            }}
                        />
                    );
                })}
        </div>
    );
}
