"use client";

import React from "react";
import { LogItem } from "./TiposHistorico";
import { traduzirFase, iconeAcao, FASES_NOMES } from "./ConstantesFases";
import { formataDataHora, formataSeDataIso } from "./UtilDatas";
import { isNoChangeEntry } from "./Normalizadores";
import { overrideCampoNome, substituirRotuloVisual, titleCaseFromSnake, capitalize } from "./UtilTexto";

/* Helpers locais (presentes no monolito) */
function asBool(v: any): boolean {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        return s === "1" || s === "true" || s === "sim" || s === "on";
    }
    return false;
}
function isNoChangeKey(k: string) {
    return /^sem[\s_]*alterac(?:o|oe)es?$/i.test((k || "").trim());
}
function sanitize(txt?: string) {
    if (!txt) return "";
    return String(txt)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Faz o parsing “rico” dos detalhes, preservando:
 * - materiais_(nome)_qtd
 * - arrumacao_json (itens true)
 * - pares simples (aplicando overrides + normalizações)
 * - fallback para texto cru limpando ruídos
 */
function parseDetalhesRich(raw: any) {
    const simples: Array<{ label: string; value: string }> = [];
    const materiais: Array<{ nome: string; qtd: string }> = [];
    const arrumacao: string[] = [];
    let textoFallback: string | null = null;

    if (!raw) return { simples, materiais, arrumacao, textoFallback };

    try {
        const obj: Record<string, any> =
            typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : (raw as Record<string, any>);

        if (obj && typeof obj === "object") {
            for (const key of Object.keys(obj)) {
                if (["materiais_json", "id", "acao"].includes(key)) continue;

                // Arrumação
                if (/^arruma[cç][aã]o(\s*json|_json)?$/i.test(key)) {
                    let aobj: any = obj[key] || {};
                    if (typeof aobj === "string") {
                        try {
                            aobj = JSON.parse(aobj);
                        } catch {
                            aobj = {};
                        }
                    }
                    for (const [k, v] of Object.entries(aobj || {})) {
                        if (asBool(v)) arrumacao.push(titleCaseFromSnake(k));
                    }
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
                        materiais.push({ nome, qtd: valFmt });
                    }
                    continue;
                }

                // Campos simples (escalares)
                const val = obj[key];
                if (val == null) continue;
                if (typeof val === "object") continue;
                if (isNoChangeKey(key) && asBool(val)) continue;

                let nome = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                nome = overrideCampoNome(key, nome);

                let v = String(val);
                if (v.startsWith("fase") && FASES_NOMES[v]) v = FASES_NOMES[v];
                v = formataSeDataIso(v);
                nome = substituirRotuloVisual(nome);
                v = substituirRotuloVisual(v);

                simples.push({ label: nome, value: v });
            }
            return { simples, materiais, arrumacao, textoFallback };
        }
    } catch {
        // Fallback texto cru: remover ruídos e trocar faseXX por nomes
        let s = String(raw || "");
        s = s.replace(/sem[\s_]*alterac(?:o|oe)es?\s*:\s*true/gi, "");
        s = s.replace(/Arruma[cç][aã]o\s*Json\s*:\s*\{[\s\S]*?\}/gi, "");
        s = s.replace(/arruma[cç][aã]o\s*json\s*:[^\n]*/gi, "");
        s = s.replace(/materiais\s*:\s*\[[^\]]*\]/gi, "");

        Object.keys(FASES_NOMES).forEach((cod) => {
            const faseNome = FASES_NOMES[cod];
            const regEx = new RegExp(cod, "g");
            s = s.replace(regEx, faseNome);
        });

        s = substituirRotuloVisual(s);
        if (s.trim()) textoFallback = s.trim();
    }

    return { simples, materiais, arrumacao, textoFallback };
}

interface Props {
    logs: LogItem[];
    usuarioVisivel?: boolean;
}

export default function LinhaDoTempoLogs({ logs, usuarioVisivel = true }: Props) {
    if (!logs || logs.length === 0) {
        return <div className="p-4 text-center text-gray-500">Nenhum log encontrado.</div>;
    }

    return (
        <ul className="divide-y">
            {logs
                .filter((l) => !isNoChangeEntry(l))
                .map((l, idx) => {
                    const { simples, materiais, arrumacao, textoFallback } = parseDetalhesRich(l.detalhes);

                    const acao = l.acao ? sanitize(capitalize(l.acao)) : "";
                    const statusBadg = l.status_novo ? traduzirFase(l.status_novo) : "";

                    return (
                        <li key={idx} className="p-3">
                            {/* Cabeçalho da linha */}
                            <div className="flex items-start gap-3">
                                <div className="text-xl leading-none">{iconeAcao(l.acao, l.status_novo)}</div>
                                <div className="flex-1">
                                    <div className="text-xs text-muted-foreground">{formataDataHora(l.datahora)}</div>
                                    <div className="text-sm">
                                        <span
                                            className="font-medium"
                                            dangerouslySetInnerHTML={{ __html: acao }}
                                        />
                                        {statusBadg && (
                                            <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                                                {statusBadg}
                                            </span>
                                        )}
                                    </div>

                                    {/* Usuário */}
                                    {usuarioVisivel && (
                                        <div className="text-xs text-muted-foreground">Usuário: {sanitize(l.usuario || "")}</div>
                                    )}

                                    {/* Detalhes estruturados */}
                                    {(materiais.length > 0 || arrumacao.length > 0 || simples.length > 0) && (
                                        <div className="mt-2 space-y-2">
                                            {/* Materiais */}
                                            {materiais.length > 0 && (
                                                <div>
                                                    <div className="text-xs font-semibold mb-1">Materiais:</div>
                                                    <ul className="list-disc pl-5 text-sm">
                                                        {materiais.map((m, i) => (
                                                            <li key={`${m.nome}-${i}`}>
                                                                <b>{m.nome}:</b> {m.qtd}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Arrumação */}
                                            {arrumacao.length > 0 && (
                                                <div>
                                                    <div className="text-xs font-semibold mb-1">Arrumação:</div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {arrumacao.map((nome, i) => (
                                                            <span
                                                                key={`${nome}-${i}`}
                                                                className="inline-block rounded border px-2 py-1 text-xs"
                                                            >
                                                                ✅ {nome}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Pares simples */}
                                            {simples.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {simples.map(({ label, value }, i) => (
                                                        <span
                                                            key={`${label}-${i}`}
                                                            className="inline-block rounded border px-2 py-1 text-xs"
                                                        >
                                                            <b>{sanitize(label)}:</b> {sanitize(formataSeDataIso(substituirRotuloVisual(value)))}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Fallback texto cru (se houver) */}
                                    {textoFallback && (
                                        <div
                                            className="mt-2 text-sm"
                                            dangerouslySetInnerHTML={{ __html: sanitize(textoFallback) }}
                                        />
                                    )}
                                </div>

                                {/* Data (compacto no canto direito em telas largas) */}
                                <div className="hidden sm:block text-xs text-muted-foreground whitespace-nowrap ml-2">
                                    {formataDataHora(l.datahora)}
                                </div>
                            </div>
                        </li>
                    );
                })}
        </ul>
    );
}
