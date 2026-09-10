"use client";

import React, { useEffect, useMemo, useState } from "react";
import { IconFileTypePdf, IconPhoto, IconX } from "@tabler/icons-react";
import { FalecidoItem, LogItem } from "./TiposHistorico";
import { listarLogPorId, obterMateriaisMap, type MateriaisMap } from "./Api";
import LinhaDoTempoLogs from "./LinhaDoTempoLogs";
import ResumoFinal from "./ResumoFinal";
import BotaoExportarPdf from "./BotaoExportarPdf";
import { estaFinalizado, montarResumoFinalDoLog } from "./Normalizadores";
import { traduzirFase } from "./ConstantesFases";
import { formataDataHora } from "./UtilDatas";

interface Props {
    aberto: boolean;
    registro: FalecidoItem | null;
    onFechar: () => void;
}

type FotoHistorico = {
    url: string;
    titulo: string;
};

function getRegistroId(item: FalecidoItem): string {
    const anyItem = item as any;
    return String(item?.sepultamento_id || anyItem?.id || "").trim();
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

function extrairFotosDosLogs(logs: LogItem[]): FotoHistorico[] {
    const out: FotoHistorico[] = [];
    const seen = new Set<string>();

    function pushFoto(raw: any) {
        if (!isFotoAcaoUrl(raw)) return;

        const url = normalizarFotoAcaoUrl(raw);
        if (!url || seen.has(url)) return;

        seen.add(url);
        out.push({ url, titulo: nomeFotoAcaoPorTexto(raw) });
    }

    function walk(value: any) {
        if (value == null) return;
        if (typeof value === "string") {
            pushFoto(value);
            const parsed = safeJsonParse(value);
            if (parsed && parsed !== value) walk(parsed);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (typeof value === "object") Object.values(value).forEach(walk);
    }

    for (const log of logs || []) walk((log as any)?.detalhes);

    const ordem = (f: FotoHistorico) => {
        const t = f.titulo.toLowerCase();
        if (t.includes("falecido")) return 0;
        if (t.includes("ornamentação") || t.includes("ornamentacao")) return 1;
        if (t.includes("paramentação") || t.includes("paramentacao")) return 2;
        return 3;
    };

    return out.sort((a, b) => ordem(a) - ordem(b));
}

function isFotoFalecidoUrl(v: any): boolean {
    const s = String(v ?? "").trim();
    return s.includes("/uploads/falecidos/") || s.includes("uploads/falecidos/");
}

function normalizarFotoFalecidoUrl(v: any): string {
    let url = String(v ?? "").trim();
    if (!url) return "";

    url = url.replace(/\\/g, "/");

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

function montarResumoDadosAtendimento(registro: FalecidoItem | null): Record<string, string> {
    if (!registro) return {};

    const out: Record<string, string> = {};

    for (const [key, value] of Object.entries(registro as any)) {
        if (value == null) continue;
        if (typeof value === "object") continue;
        const texto = String(value).trim();
        if (!texto) continue;
        out[key] = texto;
    }

    if (registro.falecido) out.falecido = String(registro.falecido);
    return out;
}

function primeiroLogData(logs: LogItem[]) {
    return [...logs]
        .filter((l) => l.datahora)
        .sort((a, b) => String(a.datahora).localeCompare(String(b.datahora)))[0]?.datahora || "";
}

function ultimoStatus(logs: LogItem[]) {
    const ordenados = [...logs].sort((a, b) =>
        String(a.datahora || "").localeCompare(String(b.datahora || "")),
    );

    for (let i = ordenados.length - 1; i >= 0; i--) {
        const status = String(ordenados[i]?.status_novo || "").trim();
        if (status) return traduzirFase(status) || status;
    }

    return "";
}

export default function ModalDetalheRegistro({ aberto, registro, onFechar }: Props) {
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [materiaisMap, setMateriaisMap] = useState<MateriaisMap>({});
    const [fotosOpen, setFotosOpen] = useState(false);

    useEffect(() => {
        if (!aberto || !registro) return;

        const id = getRegistroId(registro);
        if (!id) {
            setLogs([]);
            return;
        }

        let cancel = false;

        (async () => {
            setLoading(true);
            try {
                const lista = await listarLogPorId(id);
                if (!cancel) setLogs(lista);
            } finally {
                if (!cancel) setLoading(false);
            }
        })();

        return () => {
            cancel = true;
        };
    }, [aberto, registro]);

    useEffect(() => {
        if (!aberto) return;

        let cancel = false;
        (async () => {
            const map = await obterMateriaisMap();
            if (!cancel) setMateriaisMap(map || {});
        })();

        return () => {
            cancel = true;
        };
    }, [aberto]);

    useEffect(() => {
        if (!aberto) setFotosOpen(false);
    }, [aberto]);

    const finalizado = useMemo(() => estaFinalizado(logs), [logs]);

    const dadosAtendimentoResumo = useMemo(
        () => montarResumoDadosAtendimento(registro),
        [registro],
    );

    const resumoAtual = useMemo(
        () => ({
            ...dadosAtendimentoResumo,
            ...montarResumoFinalDoLog(logs, materiaisMap),
        }),
        [dadosAtendimentoResumo, logs, materiaisMap],
    );

    const criacaoSelecionado = useMemo(() => primeiroLogData(logs), [logs]);
    const statusAtual = useMemo(() => ultimoStatus(logs), [logs]);

    const fotos = useMemo(() => {
        const lista = extrairFotosDosLogs(logs);
        const fotoFalecido = normalizarFotoFalecidoUrl((registro as any)?.foto_falecido);

        if (fotoFalecido && isFotoFalecidoUrl(fotoFalecido)) {
            const jaExiste = lista.some((f) => f.url === fotoFalecido);
            if (!jaExiste) {
                lista.unshift({ url: fotoFalecido, titulo: "Foto do Falecido(a)" });
            }
        }

        return lista;
    }, [logs, registro]);

    if (!aberto || !registro) return null;

    const registroId = getRegistroId(registro);

    return (
        <>
            <div
                className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 sm:p-6"
                role="dialog"
                aria-modal="true"
                aria-label={`Histórico de ${registro.falecido}`}
                onClick={(e) => {
                    if (e.target === e.currentTarget) onFechar();
                }}
            >
                <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border bg-white shadow-xl">
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white/95 p-4 backdrop-blur sm:px-5">
                        <div className="min-w-0">
                            <h3 className="truncate text-lg font-semibold leading-tight text-slate-900">
                                {registro.falecido}
                            </h3>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                {registroId && <span>Atendimento #{registroId}</span>}
                                {criacaoSelecionado && (
                                    <span>Criado em {formataDataHora(criacaoSelecionado)}</span>
                                )}
                                {statusAtual && <span>Status: {statusAtual}</span>}
                                <span
                                    className={`rounded-full px-2 py-0.5 font-medium ${finalizado
                                            ? "bg-emerald-50 text-emerald-700"
                                            : "bg-amber-50 text-amber-700"
                                        }`}
                                >
                                    {finalizado ? "Finalizado" : "Em andamento"}
                                </span>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                type="button"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                                title={fotos.length > 0 ? "Ver fotos anexadas" : "Nenhuma foto anexada"}
                                aria-label="Ver fotos anexadas"
                                disabled={loading || fotos.length === 0}
                                onClick={() => setFotosOpen(true)}
                            >
                                <IconPhoto className="size-5" />
                            </button>

                            <div
                                className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                                title="Baixar PDF"
                                aria-label="Baixar PDF"
                            >
                                <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                                    <IconFileTypePdf className="size-5" />
                                </span>

                                <div className="[&_button]:!h-10 [&_button]:!w-10 [&_button]:!overflow-hidden [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!px-0 [&_button]:!text-transparent [&_button]:hover:!bg-transparent">
                                    <BotaoExportarPdf
                                        desabilitado={loading || logs.length === 0}
                                        selecionadoNome={registro.falecido}
                                        criacaoSelecionado={criacaoSelecionado}
                                        logVisiveis={logs}
                                        resumoFinal={resumoAtual}
                                        materiaisMap={materiaisMap}
                                        sepultamentoId={registroId}
                                    />
                                </div>
                            </div>

                            <button
                                type="button"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted"
                                onClick={onFechar}
                                title="Fechar"
                                aria-label="Fechar"
                            >
                                <IconX className="size-5" />
                            </button>
                        </div>
                    </div>

                    <div className="h-[calc(92vh-72px)] overflow-auto bg-slate-50/40 p-4 sm:p-5">
                        {loading ? (
                            <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground">
                                Carregando histórico…
                            </div>
                        ) : logs.length === 0 ? (
                            <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground">
                                Nenhum log encontrado para este registro.
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <ResumoFinal
                                    visivel={Object.keys(resumoAtual).length > 0}
                                    resumo={resumoAtual}
                                    titulo={finalizado ? "Resumo Final" : "Resumo do Atendimento"}
                                    subtitulo="Dados principais separados por assunto. Informações técnicas ficam recolhidas por padrão."
                                />

                                <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
                                    <div className="mb-4">
                                        <h4 className="text-sm font-semibold text-slate-900">Linha do Tempo</h4>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                            Eventos em ordem cronológica, mostrando apenas informações relevantes de cada ação.
                                        </p>
                                    </div>
                                    <LinhaDoTempoLogs logs={logs} materiaisMap={materiaisMap} />
                                </section>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {fotosOpen && (
                <div
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 sm:p-6"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Fotos anexadas"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setFotosOpen(false);
                    }}
                >
                    <div className="w-full max-w-5xl overflow-hidden rounded-2xl border bg-white shadow-2xl">
                        <div className="flex items-center justify-between gap-3 border-b p-3 sm:p-4">
                            <div>
                                <h3 className="text-base font-semibold">Fotos anexadas</h3>
                                <p className="text-xs text-muted-foreground">
                                    Foto do falecido(a), ornamentação e paramentação anexadas ao atendimento.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
                                onClick={() => setFotosOpen(false)}
                                title="Fechar"
                                aria-label="Fechar"
                            >
                                <IconX className="size-5" />
                            </button>
                        </div>

                        <div className="max-h-[78vh] overflow-auto bg-slate-50 p-3 sm:p-4">
                            {fotos.length === 0 ? (
                                <div className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">
                                    Nenhuma foto anexada neste atendimento.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    {fotos.map((foto) => (
                                        <div
                                            key={foto.url}
                                            className="overflow-hidden rounded-xl border bg-white shadow-sm"
                                        >
                                            <div className="border-b px-3 py-2 text-sm font-semibold">
                                                {foto.titulo}
                                            </div>
                                            <div className="bg-slate-50 p-3">
                                                <img
                                                    src={foto.url}
                                                    alt={foto.titulo}
                                                    className="mx-auto max-h-[64vh] w-auto max-w-full rounded-lg border bg-white object-contain"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}