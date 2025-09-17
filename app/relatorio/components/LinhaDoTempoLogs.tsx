"use client";
import React from "react";
import { LogItem } from "./TiposHistorico";
import { traduzirFase, iconeAcao } from "./ConstantesFases";
import { formataDataHora, formataSeDataIso } from "./UtilDatas";
import { extrairParesDoDetalhe, isNoChangeEntry, asBool } from "./Normalizadores";
import { overrideCampoNome, substituirRotuloVisual, titleCaseFromSnake, sanitize, capitalize } from "./UtilTexto";

interface Props {
    logs: LogItem[];
    usuarioVisivel?: boolean;
}

export default function LinhaDoTempoLogs({ logs, usuarioVisivel = true }: Props) {
    if (!logs || logs.length === 0) {
        return <div className="p-4 text-center text-muted-foreground">Nenhum log encontrado.</div>;
    }

    return (
        <div className="space-y-3">
            {logs
                .filter((l) => !isNoChangeEntry(l))
                .map((ent, i) => {
                    // Montagem visual dos chips (como no código grande)
                    let detalhesHtml = "";
                    const raw = ent.detalhes as any;

                    try {
                        const obj = raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : (raw as Record<string, any>);
                        if (obj && typeof obj === "object") {
                            const chips: string[] = [];
                            const arrSet = new Set<string>();

                            for (const key of Object.keys(obj)) {
                                if (["materiais_json", "id", "acao"].includes(key)) continue;

                                // Arrumação
                                if (/^arrum[aã]cao(\s*json|_json)?$/i.test(key)) {
                                    const aobj = obj[key] || {};
                                    for (const [k, v] of Object.entries(aobj)) if (asBool(v)) arrSet.add(`✅ ${titleCaseFromSnake(k)}`);
                                    continue;
                                }

                                // Materiais_*_qtd
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
                                    `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2"><b>${sanitize(nome)}:</b> ${sanitize(val)}</span>`
                                );
                            }

                            if (arrSet.size) {
                                const items = Array.from(arrSet);
                                chips.unshift(
                                    `<div class="mt-2"><b>Arrumação:</b> ${items
                                        .map((t) => `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2">${sanitize(t)}</span>`)
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
                    ${usuarioVisivel ? `<div class="text-xs text-muted-foreground">Usuário: ${sanitize(ent.usuario || "")}</div>` : ""}
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
