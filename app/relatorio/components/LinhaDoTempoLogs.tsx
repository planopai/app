"use client";

import React, { useMemo, useState } from "react";
import { IconChevronDown, IconPhoto, IconX } from "@tabler/icons-react";
import { LogItem } from "./TiposHistorico";
import { traduzirFase, iconeAcao } from "./ConstantesFases";
import { formataDataHora } from "./UtilDatas";
import { isNoChangeEntry } from "./Normalizadores";
import { capitalize } from "./UtilTexto";
import type { MateriaisMap } from "./Api";
import {
    contarDetalhesHumanos,
    extrairDetalhesLogHumanos,
    type DetalhesLogFormatados,
    type MaterialRelatorio,
} from "./FormatadorRelatorio";

interface Props {
    logs: LogItem[];
    usuarioVisivel?: boolean;
    materiaisMap?: MateriaisMap;
}

type FotoHistorico = {
    url: string;
    titulo: string;
};

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

function isFotoAcaoUrl(v: any): boolean {
    const s = String(v ?? "").trim();
    return s.includes("/uploads/acoes_fotos/") || s.includes("uploads/acoes_fotos/");
}

function extrairFotoAcaoUrl(v: any): string {
    const s = String(v ?? "").trim();
    if (!s) return "";

    const match =
        s.match(/https?:\/\/[^\s\"'<>]*\/uploads\/acoes_fotos\/[^\s\"'<>]+/i) ||
        s.match(/\/uploads\/acoes_fotos\/[^\s\"'<>]+/i) ||
        s.match(/uploads\/acoes_fotos\/[^\s\"'<>]+/i);

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
                "https://api.planoassistencialintegrado.com.br",
            )
            .replace(
                "https://planoassistencialintegrado.com.br",
                "https://api.planoassistencialintegrado.com.br",
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

function extrairFotosDoDetalhe(raw: any): FotoHistorico[] {
    const out: FotoHistorico[] = [];
    const seen = new Set<string>();

    function walk(value: any) {
        if (value == null) return;

        if (typeof value === "string") {
            if (isFotoAcaoUrl(value)) {
                const url = normalizarFotoAcaoUrl(value);
                if (url && !seen.has(url)) {
                    seen.add(url);
                    out.push({ url, titulo: nomeFotoAcaoPorTexto(value) });
                }
            }

            const parsed = safeJsonParse(value);
            if (parsed && parsed !== value) walk(parsed);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }

        if (typeof value === "object") {
            Object.values(value).forEach(walk);
        }
    }

    walk(raw);
    return out;
}

function tituloDoLog(ent: LogItem) {
    if (ent.status_novo) return traduzirFase(ent.status_novo);
    return ent.acao ? capitalize(ent.acao) : "Ação registrada";
}

function pareceCadastroInicial(ent: LogItem, index: number, qtdDetalhes: number) {
    const acao = String(ent.acao || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    return (
        /cadastr|criou|criado|novo atendimento|registrou atendimento/.test(acao) ||
        (index === 0 && qtdDetalhes >= 8)
    );
}

function ListaMateriais({ titulo, itens }: { titulo: string; itens: MaterialRelatorio[] }) {
    if (!itens.length) return null;

    const grupos = new Map<string, MaterialRelatorio[]>();
    for (const item of itens) {
        const categoria = item.categoria || titulo;
        if (!grupos.has(categoria)) grupos.set(categoria, []);
        grupos.get(categoria)!.push(item);
    }

    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {titulo}
            </div>
            <div className="mt-2 space-y-2">
                {Array.from(grupos.entries()).map(([categoria, linhas]) => (
                    <div key={categoria}>
                        {categoria !== titulo && (
                            <div className="mb-1 text-[11px] font-medium text-slate-500">
                                {categoria}
                            </div>
                        )}
                        <ul className="space-y-1 text-sm text-slate-800">
                            {linhas.map((item, index) => (
                                <li
                                    key={`${categoria}-${item.nome}-${index}`}
                                    className="flex items-start justify-between gap-4"
                                >
                                    <span className="min-w-0 break-words">{item.nome}</span>
                                    <span className="shrink-0 font-semibold">Qtd. {item.qtd}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
}

function DetalhesHumanos({
    detalhes,
    compacto,
}: {
    detalhes: DetalhesLogFormatados;
    compacto: boolean;
}) {
    const temHumanos = contarDetalhesHumanos(detalhes) > 0;

    if (compacto && temHumanos) {
        return (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Dados iniciais organizados no resumo do atendimento acima.
            </div>
        );
    }

    if (!temHumanos && !detalhes.tecnicos.length) return null;

    return (
        <div className="mt-3 space-y-3">
            {detalhes.campos.length > 0 && (
                <dl className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {detalhes.campos.map((campo, index) => (
                        <div
                            key={`${campo.chave}-${index}`}
                            className="grid grid-cols-1 gap-0.5 border-b border-slate-100 px-3 py-2 last:border-b-0 sm:grid-cols-[170px_1fr] sm:gap-3"
                        >
                            <dt className="text-xs font-medium text-slate-500">{campo.label}</dt>
                            <dd className="min-w-0 break-words text-sm text-slate-900">{campo.valor}</dd>
                        </div>
                    ))}
                </dl>
            )}

            <ListaMateriais titulo="Materiais" itens={detalhes.materiais} />
            <ListaMateriais titulo="Insumos Tanatopraxia" itens={detalhes.insumos} />

            {detalhes.arrumacao.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Conservação do corpo
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {detalhes.arrumacao.map((item) => (
                            <span
                                key={item}
                                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
                            >
                                {item}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {detalhes.coroas.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Coroas de flores
                    </div>
                    <ul className="mt-2 space-y-1 text-sm text-slate-800">
                        {detalhes.coroas.map((item, index) => (
                            <li key={`${item}-${index}`}>{item}</li>
                        ))}
                    </ul>
                </div>
            )}

            {detalhes.textoLivre.map((texto, index) => (
                <div
                    key={`${texto}-${index}`}
                    className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-800"
                >
                    {texto}
                </div>
            ))}

            {detalhes.tecnicos.length > 0 && (
                <details className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60">
                    <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-500">
                        <IconChevronDown className="size-4" />
                        Dados técnicos ({detalhes.tecnicos.length})
                    </summary>
                    <dl className="divide-y divide-slate-200 border-t border-dashed border-slate-300 px-3">
                        {detalhes.tecnicos.map((campo, index) => (
                            <div
                                key={`${campo.chave}-${index}`}
                                className="grid grid-cols-1 gap-1 py-2 text-xs sm:grid-cols-[180px_1fr]"
                            >
                                <dt className="font-medium text-slate-500">{campo.label}</dt>
                                <dd className="break-all text-slate-700">{campo.valor}</dd>
                            </div>
                        ))}
                    </dl>
                </details>
            )}
        </div>
    );
}

export default function LinhaDoTempoLogs({
    logs,
    usuarioVisivel = true,
    materiaisMap,
}: Props) {
    const [fotoModal, setFotoModal] = useState<FotoHistorico | null>(null);

    const logsVisiveis = useMemo(
        () => (logs || []).filter((log) => !isNoChangeEntry(log)),
        [logs],
    );

    if (!logsVisiveis.length) {
        return <div className="p-4 text-center text-sm text-muted-foreground">Nenhum log encontrado.</div>;
    }

    return (
        <>
            <div className="relative space-y-0 pl-6">
                <div className="absolute bottom-4 left-[9px] top-4 w-px bg-slate-200" />

                {logsVisiveis.map((ent, index) => {
                    const detalhes = extrairDetalhesLogHumanos(ent.detalhes, materiaisMap);
                    const qtdDetalhes = contarDetalhesHumanos(detalhes);
                    const compacto = pareceCadastroInicial(ent, index, qtdDetalhes);
                    const fotos = extrairFotosDoDetalhe(ent.detalhes);

                    return (
                        <article key={`${ent.datahora || "log"}-${index}`} className="relative pb-5">
                            <div className="absolute -left-6 top-4 flex h-[19px] w-[19px] items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] shadow-sm">
                                {iconeAcao(ent.acao, ent.status_novo)}
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                    <div className="min-w-0">
                                        <div className="text-xs text-slate-500">
                                            {formataDataHora(ent.datahora)}
                                        </div>
                                        <h5 className="mt-0.5 text-sm font-semibold text-slate-900">
                                            {tituloDoLog(ent)}
                                        </h5>
                                        {usuarioVisivel && ent.usuario && (
                                            <div className="mt-0.5 text-xs text-slate-500">
                                                Responsável: <span className="font-medium text-slate-700">{ent.usuario}</span>
                                            </div>
                                        )}
                                    </div>

                                    {fotos.length > 0 && (
                                        <div className="flex shrink-0 flex-wrap gap-2">
                                            {fotos.map((foto) => (
                                                <button
                                                    key={foto.url}
                                                    type="button"
                                                    onClick={() => setFotoModal(foto)}
                                                    className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                                                >
                                                    <IconPhoto className="size-4" />
                                                    Ver foto
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <DetalhesHumanos detalhes={detalhes} compacto={compacto} />
                            </div>
                        </article>
                    );
                })}
            </div>

            {fotoModal && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 sm:p-6"
                    role="dialog"
                    aria-modal="true"
                    aria-label={fotoModal.titulo}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setFotoModal(null);
                    }}
                >
                    <div className="w-full max-w-4xl overflow-hidden rounded-2xl border bg-white shadow-2xl">
                        <div className="flex items-center justify-between gap-3 border-b p-3 sm:p-4">
                            <div className="font-semibold">{fotoModal.titulo}</div>
                            <button
                                type="button"
                                onClick={() => setFotoModal(null)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
                                aria-label="Fechar foto"
                            >
                                <IconX className="size-5" />
                            </button>
                        </div>
                        <div className="bg-slate-50 p-3 sm:p-4">
                            <img
                                src={fotoModal.url}
                                alt={fotoModal.titulo}
                                className="mx-auto max-h-[78vh] w-auto max-w-full rounded-lg border bg-white object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}