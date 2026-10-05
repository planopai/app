"use client";

import React, { useEffect, useMemo, useState } from "react";
import { IconFileTypePdf, IconPhoto, IconX } from "@tabler/icons-react";
import { FalecidoItem, LogItem, RegistroAnalise } from "./TiposHistorico";
import {
    listarLogPorId,
    obterMateriaisMap,
    obterRegistroAnaliticoPorId,
    type MateriaisMap,
    type AvaliacaoStatusResumo,
    type StatusAvaliacoesItem,
} from "./Api";
import LinhaDoTempoLogs from "./LinhaDoTempoLogs";
import BotaoExportarPdf from "./BotaoExportarPdf";
import { estaFinalizado, montarResumoFinalDoLog } from "./Normalizadores";
import { traduzirFase } from "./ConstantesFases";
import { formataDataHora } from "./UtilDatas";
import { organizarResumoRelatorio } from "./FormatadorRelatorio";

interface Props {
    aberto: boolean;
    registro: FalecidoItem | null;
    onFechar: () => void;
    statusAvaliacoes?: StatusAvaliacoesItem;
    podeVerVisita?: boolean;
    podeVerPosAtendimento?: boolean;
    loadingAvaliacoes?: boolean;
    onAbrirVisita?: (item: FalecidoItem) => void;
    onAbrirPosAtendimento?: (item: FalecidoItem) => void;
}

type FotoHistorico = {
    url: string;
    titulo: string;
};

type AbaDetalhe =
    | "falecido"
    | "responsavel"
    | "servicos"
    | "itens"
    | "velorio"
    | "outras"
    | "timeline";

type VisualViewportState = {
    width: number;
    height: number;
    offsetTop: number;
    offsetLeft: number;
};

const ABAS_DETALHE: Array<{ id: AbaDetalhe; label: string }> = [
    { id: "falecido", label: "Dados do falecido" },
    { id: "responsavel", label: "Responsável" },
    { id: "servicos", label: "Serviços e procedimentos" },
    { id: "itens", label: "Itens do atendimento" },
    { id: "velorio", label: "Velório e sepultamento" },
    { id: "outras", label: "Outras informações" },
    { id: "timeline", label: "Linha do Tempo" },
];

function IconeVisita() {
    return (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
            <circle cx="12" cy="10" r="2.2" />
        </svg>
    );
}

function IconePos() {
    return (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="5" y="4" width="14" height="17" rx="2" />
            <path d="M9 4.5h6M9 9h6M9 13h6M9 17h4" />
            <path d="m15.5 16.5 1.3 1.3 2.7-3" />
        </svg>
    );
}

function statusVisualAvaliacao(status?: AvaliacaoStatusResumo | null) {
    switch (status?.status) {
        case "concluida":
            return { classes: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100", texto: status.avaliador_nome ? `Concluída por ${status.avaliador_nome}` : "Concluída" };
        case "em_andamento":
            return { classes: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100", texto: status.avaliador_nome ? `Em andamento por ${status.avaliador_nome}` : "Em andamento" };
        case "pendente":
            return { classes: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100", texto: "Pendente" };
        case "nao_aplicavel":
            return { classes: "border-slate-200 bg-slate-50 text-slate-400", texto: "Não aplicável" };
        default:
            return { classes: "border-slate-200 bg-white text-slate-700 hover:bg-muted", texto: "Abrir" };
    }
}

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

function temValorRelatorio(value: any): boolean {
    if (value == null) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
}

function montarResumoDadosAtendimento(
    registro: FalecidoItem | RegistroAnalise | null,
): Record<string, any> {
    if (!registro) return {};

    const out: Record<string, any> = {};

    for (const [key, value] of Object.entries(registro as any)) {
        if (!temValorRelatorio(value)) continue;

        // Mantém também objetos e arrays estruturados. O FormatadorRelatorio
        // decide como transformá-los em conteúdo humano.
        out[key] = value;
    }

    if ((registro as any).falecido) {
        out.falecido = String((registro as any).falecido);
    }

    return out;
}

function mesclarResumoAtendimento(
    ...fontes: Array<Record<string, any> | null | undefined>
): Record<string, any> {
    const out: Record<string, any> = {};

    for (const fonte of fontes) {
        if (!fonte) continue;

        for (const [key, value] of Object.entries(fonte)) {
            if (!temValorRelatorio(value)) continue;
            out[key] = value;
        }
    }

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

function CamposAba({
    titulo,
    campos,
}: {
    titulo: string;
    campos: Array<{ chave: string; label: string; valor: string }>;
}) {
    if (!campos.length) {
        return (
            <div className="rounded-2xl border bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                Nenhuma informação disponível nesta seção.
            </div>
        );
    }

    return (
        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b bg-slate-50 px-4 py-3 sm:px-5">
                <h4 className="text-sm font-semibold text-slate-900">{titulo}</h4>
            </div>

            <dl className="divide-y divide-slate-100">
                {campos.map((campo, index) => (
                    <div
                        key={`${campo.chave}-${index}`}
                        className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4 sm:px-5"
                    >
                        <dt className="text-xs font-medium text-slate-500">
                            {campo.label}
                        </dt>
                        <dd className="min-w-0 break-words text-sm text-slate-900">
                            {campo.valor}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

export default function ModalDetalheRegistro({
    aberto,
    registro,
    onFechar,
    statusAvaliacoes,
    podeVerVisita = false,
    podeVerPosAtendimento = false,
    loadingAvaliacoes = false,
    onAbrirVisita,
    onAbrirPosAtendimento,
}: Props) {
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [registroCompleto, setRegistroCompleto] =
        useState<RegistroAnalise | null>(null);
    const [loading, setLoading] = useState(false);
    const [materiaisMap, setMateriaisMap] = useState<MateriaisMap>({});
    const [fotosOpen, setFotosOpen] = useState(false);
    const [abaAtiva, setAbaAtiva] = useState<AbaDetalhe | null>(null);
    const [viewport, setViewport] =
        useState<VisualViewportState | null>(null);

    useEffect(() => {
        if (!aberto || !registro) return;

        const id = getRegistroId(registro);
        if (!id) {
            setLogs([]);
            setRegistroCompleto(null);
            return;
        }

        let cancel = false;

        (async () => {
            setLoading(true);
            setRegistroCompleto(null);

            try {
                // O histórico explica o que aconteceu; o informativo.php fornece
                // a fotografia atual e completa do atendimento.
                const [listaLogs, atual] = await Promise.all([
                    listarLogPorId(id),
                    obterRegistroAnaliticoPorId(id),
                ]);

                if (cancel) return;

                setLogs(Array.isArray(listaLogs) ? listaLogs : []);
                setRegistroCompleto(atual);
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
        if (!aberto) {
            setFotosOpen(false);
            setAbaAtiva(null);
        }
    }, [aberto]);

    useEffect(() => {
        if (!aberto || typeof window === "undefined") return;

        const html = document.documentElement;
        const body = document.body;

        const oldHtmlOverflow = html.style.overflow;
        const oldBodyOverflow = body.style.overflow;
        const oldBodyOverscroll = body.style.overscrollBehavior;
        const oldBodyTouchAction = body.style.touchAction;

        const updateViewport = () => {
            const vv = window.visualViewport;

            setViewport({
                width: Math.max(
                    1,
                    Math.round(vv?.width ?? window.innerWidth),
                ),
                height: Math.max(
                    1,
                    Math.round(vv?.height ?? window.innerHeight),
                ),
                offsetTop: Math.max(
                    0,
                    Math.round(vv?.offsetTop ?? 0),
                ),
                offsetLeft: Math.max(
                    0,
                    Math.round(vv?.offsetLeft ?? 0),
                ),
            });
        };

        updateViewport();

        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        body.style.overscrollBehavior = "none";
        body.style.touchAction = "none";

        const vv = window.visualViewport;

        vv?.addEventListener("resize", updateViewport);
        vv?.addEventListener("scroll", updateViewport);
        window.addEventListener("resize", updateViewport);
        window.addEventListener("orientationchange", updateViewport);

        return () => {
            vv?.removeEventListener("resize", updateViewport);
            vv?.removeEventListener("scroll", updateViewport);
            window.removeEventListener("resize", updateViewport);
            window.removeEventListener(
                "orientationchange",
                updateViewport,
            );

            html.style.overflow = oldHtmlOverflow;
            body.style.overflow = oldBodyOverflow;
            body.style.overscrollBehavior = oldBodyOverscroll;
            body.style.touchAction = oldBodyTouchAction;

            setViewport(null);
        };
    }, [aberto]);

    const finalizado = useMemo(() => estaFinalizado(logs), [logs]);

    const dadosListaResumo = useMemo(
        () => montarResumoDadosAtendimento(registro),
        [registro],
    );

    const dadosBancoResumo = useMemo(
        () => montarResumoDadosAtendimento(registroCompleto),
        [registroCompleto],
    );

    const dadosLogsResumo = useMemo(
        () => montarResumoFinalDoLog(logs, materiaisMap),
        [logs, materiaisMap],
    );

    const resumoAtual = useMemo(
        () =>
            mesclarResumoAtendimento(
                dadosListaResumo,
                dadosLogsResumo,
                dadosBancoResumo,
            ),
        [dadosListaResumo, dadosLogsResumo, dadosBancoResumo],
    );

    const resumoOrganizado = useMemo(
        () => organizarResumoRelatorio(resumoAtual, materiaisMap),
        [resumoAtual, materiaisMap],
    );

    const secoesPorId = useMemo(() => {
        const map = new Map<
            string,
            { id: string; titulo: string; campos: Array<{ chave: string; label: string; valor: string }> }
        >();

        for (const secao of resumoOrganizado.secoes) {
            map.set(String(secao.id), secao);
        }

        return map;
    }, [resumoOrganizado]);

    const camposOutrasInformacoes = useMemo(() => {
        const observacoes = secoesPorId.get("observacoes")?.campos ?? [];
        const outras = secoesPorId.get("outras")?.campos ?? [];

        return [...observacoes, ...outras];
    }, [secoesPorId]);

    const criacaoSelecionado = useMemo(
        () =>
            primeiroLogData(logs) ||
            String((registroCompleto as any)?.created_at ?? (registro as any)?.criacao ?? ""),
        [logs, registroCompleto, registro],
    );

    const statusAtual = useMemo(() => {
        const atual = String((registroCompleto as any)?.status ?? "").trim();
        return atual ? traduzirFase(atual) || atual : ultimoStatus(logs);
    }, [registroCompleto, logs]);

    const nomeFalecidoAtual =
        String(
            (registroCompleto as any)?.falecido ??
            registro?.falecido ??
            "",
        ).trim();

    const fotos = useMemo(() => {
        const lista = extrairFotosDosLogs(logs);
        const fotoFalecido = normalizarFotoFalecidoUrl(
            (registroCompleto as any)?.foto_falecido ??
            (registro as any)?.foto_falecido,
        );

        if (fotoFalecido && isFotoFalecidoUrl(fotoFalecido)) {
            const jaExiste = lista.some((f) => f.url === fotoFalecido);
            if (!jaExiste) {
                lista.unshift({ url: fotoFalecido, titulo: "Foto do Falecido(a)" });
            }
        }

        return lista;
    }, [logs, registro, registroCompleto]);

    if (!aberto || !registro) return null;

    const registroId = getRegistroId(registro);

    return (
        <>
            <div
                className="fixed z-50 flex items-center justify-center overflow-hidden bg-black/50 p-2 sm:p-6"
                style={{
                    top: viewport?.offsetTop ?? 0,
                    left: viewport?.offsetLeft ?? 0,
                    width: viewport ? `${viewport.width}px` : "100vw",
                    height: viewport ? `${viewport.height}px` : "100dvh",
                }}
                role="dialog"
                aria-modal="true"
                aria-label={`Histórico de ${nomeFalecidoAtual}`}
                onClick={(e) => {
                    if (e.target === e.currentTarget) onFechar();
                }}
            >
                <div
                    className="flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border bg-white shadow-xl"
                    style={{
                        maxHeight: viewport
                            ? `${Math.max(1, viewport.height - 16)}px`
                            : "calc(100dvh - 1rem)",
                    }}
                >
                    <div className="shrink-0 border-b bg-white/95 p-3 backdrop-blur sm:px-5 sm:py-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <h3 className="break-words text-base font-semibold leading-tight text-slate-900 sm:text-lg">
                                    {nomeFalecidoAtual}
                                </h3>

                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                    {registroId && (
                                        <span>Atendimento #{registroId}</span>
                                    )}

                                    {criacaoSelecionado && (
                                        <span>
                                            Criado em{" "}
                                            {formataDataHora(
                                                criacaoSelecionado,
                                            )}
                                        </span>
                                    )}

                                    {statusAtual && (
                                        <span>Status: {statusAtual}</span>
                                    )}

                                    <span
                                        className={`rounded-full px-2 py-0.5 font-medium ${finalizado
                                            ? "bg-emerald-50 text-emerald-700"
                                            : "bg-amber-50 text-amber-700"
                                            }`}
                                    >
                                        {finalizado
                                            ? "Finalizado"
                                            : "Em andamento"}
                                    </span>
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                                    title={
                                        fotos.length > 0
                                            ? "Ver fotos anexadas"
                                            : "Nenhuma foto anexada"
                                    }
                                    aria-label="Ver fotos anexadas"
                                    disabled={
                                        loading || fotos.length === 0
                                    }
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
                                            desabilitado={
                                                loading ||
                                                logs.length === 0
                                            }
                                            selecionadoNome={
                                                nomeFalecidoAtual
                                            }
                                            criacaoSelecionado={
                                                criacaoSelecionado
                                            }
                                            logVisiveis={logs}
                                            resumoFinal={resumoAtual}
                                            materiaisMap={materiaisMap}
                                            sepultamentoId={registroId}
                                        />
                                    </div>
                                </div>

                                {registro && podeVerVisita && (
                                    <button
                                        type="button"
                                        className={[
                                            "inline-flex h-10 w-10 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50",
                                            statusVisualAvaliacao(statusAvaliacoes?.visita).classes,
                                        ].join(" ")}
                                        onClick={() => onAbrirVisita?.(registro)}
                                        disabled={loadingAvaliacoes || statusAvaliacoes?.visita?.status === "nao_aplicavel"}
                                        title={`Visita: ${statusVisualAvaliacao(statusAvaliacoes?.visita).texto}`}
                                        aria-label={`Visualizar visita. ${statusVisualAvaliacao(statusAvaliacoes?.visita).texto}`}
                                    >
                                        <IconeVisita />
                                    </button>
                                )}

                                {registro && podeVerPosAtendimento && (
                                    <button
                                        type="button"
                                        className={[
                                            "inline-flex h-10 w-10 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50",
                                            statusVisualAvaliacao(statusAvaliacoes?.pos_atendimento).classes,
                                        ].join(" ")}
                                        onClick={() => onAbrirPosAtendimento?.(registro)}
                                        disabled={loadingAvaliacoes || statusAvaliacoes?.pos_atendimento?.status === "nao_aplicavel"}
                                        title={`Pós-Atendimento: ${statusVisualAvaliacao(statusAvaliacoes?.pos_atendimento).texto}`}
                                        aria-label={`Visualizar pós-atendimento. ${statusVisualAvaliacao(statusAvaliacoes?.pos_atendimento).texto}`}
                                    >
                                        <IconePos />
                                    </button>
                                )}

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
                    </div>

                    <div className="shrink-0 bg-white px-3 py-3 sm:px-5 sm:py-4">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                            {ABAS_DETALHE.map((aba) => (
                                <button
                                    key={aba.id}
                                    type="button"
                                    onClick={() => setAbaAtiva(aba.id)}
                                    className="min-h-12 min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-xs font-medium leading-tight text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] sm:text-sm"
                                >
                                    <span className="block break-words">
                                        {aba.label}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <p className="mt-3 text-center text-xs text-slate-500">
                            Toque em uma opção para abrir as informações.
                        </p>
                    </div>
                </div>
            </div>

            {abaAtiva ? (
                <div
                    className="fixed z-[80] flex items-center justify-center overflow-hidden bg-black/60 p-2 sm:p-5"
                    style={{
                        top: viewport?.offsetTop ?? 0,
                        left: viewport?.offsetLeft ?? 0,
                        width: viewport
                            ? `${viewport.width}px`
                            : "100vw",
                        height: viewport
                            ? `${viewport.height}px`
                            : "100dvh",
                    }}
                    role="dialog"
                    aria-modal="true"
                    aria-label={
                        ABAS_DETALHE.find(
                            (aba) => aba.id === abaAtiva,
                        )?.label ?? "Detalhes do atendimento"
                    }
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setAbaAtiva(null);
                        }
                    }}
                >
                    <div
                        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl"
                        style={{
                            maxHeight: viewport
                                ? `${Math.max(
                                    1,
                                    viewport.height - 16,
                                )}px`
                                : "calc(100dvh - 1rem)",
                        }}
                    >
                        <div className="flex shrink-0 items-start justify-between gap-3 border-b bg-white px-4 py-3 sm:px-5 sm:py-4">
                            <div className="min-w-0">
                                <div className="text-xs text-slate-500">
                                    {nomeFalecidoAtual}
                                </div>

                                <h3 className="mt-0.5 break-words text-base font-semibold text-slate-950 sm:text-lg">
                                    {ABAS_DETALHE.find(
                                        (aba) =>
                                            aba.id === abaAtiva,
                                    )?.label ?? "Detalhes"}
                                </h3>
                            </div>

                            <button
                                type="button"
                                onClick={() => setAbaAtiva(null)}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                title="Fechar"
                                aria-label="Fechar"
                            >
                                <IconX className="size-5" />
                            </button>
                        </div>

                        <div
                            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/50 p-3 sm:p-5"
                            style={{
                                WebkitOverflowScrolling: "touch",
                                overscrollBehaviorY: "contain",
                                touchAction: "pan-y",
                            }}
                        >
                            {abaAtiva === "timeline" ? (
                                <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
                                    <div className="mb-4">
                                        <h4 className="text-sm font-semibold text-slate-900">
                                            Linha do Tempo
                                        </h4>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                            Eventos em ordem cronológica,
                                            mostrando apenas informações
                                            relevantes de cada ação.
                                        </p>
                                    </div>

                                    <LinhaDoTempoLogs
                                        logs={logs}
                                        materiaisMap={materiaisMap}
                                    />
                                </section>
                            ) : abaAtiva === "outras" ? (
                                <div className="space-y-4">
                                    <CamposAba
                                        titulo="Outras informações"
                                        campos={
                                            camposOutrasInformacoes
                                        }
                                    />

                                    {resumoOrganizado.tecnicos.length >
                                        0 ? (
                                        <details className="rounded-2xl border bg-white shadow-sm">
                                            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700 sm:px-5">
                                                Dados técnicos (
                                                {
                                                    resumoOrganizado
                                                        .tecnicos
                                                        .length
                                                }
                                                )
                                            </summary>

                                            <dl className="divide-y divide-slate-100 border-t">
                                                {resumoOrganizado.tecnicos.map(
                                                    (
                                                        campo,
                                                        index,
                                                    ) => (
                                                        <div
                                                            key={`${campo.chave}-${index}`}
                                                            className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4 sm:px-5"
                                                        >
                                                            <dt className="text-xs font-medium text-slate-500">
                                                                {
                                                                    campo.label
                                                                }
                                                            </dt>
                                                            <dd className="min-w-0 break-all text-xs text-slate-700">
                                                                {
                                                                    campo.valor
                                                                }
                                                            </dd>
                                                        </div>
                                                    ),
                                                )}
                                            </dl>
                                        </details>
                                    ) : null}
                                </div>
                            ) : (
                                <CamposAba
                                    titulo={
                                        ABAS_DETALHE.find(
                                            (aba) =>
                                                aba.id ===
                                                abaAtiva,
                                        )?.label ??
                                        "Informações"
                                    }
                                    campos={
                                        secoesPorId.get(
                                            abaAtiva,
                                        )?.campos ?? []
                                    }
                                />
                            )}
                        </div>
                    </div>
                </div>
            ) : null}

            {fotosOpen && (
                <div
                    className="fixed z-[90] flex items-center justify-center overflow-hidden bg-black/70 p-3 sm:p-6"
                    style={{
                        top: viewport?.offsetTop ?? 0,
                        left: viewport?.offsetLeft ?? 0,
                        width: viewport
                            ? `${viewport.width}px`
                            : "100vw",
                        height: viewport
                            ? `${viewport.height}px`
                            : "100dvh",
                    }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Fotos anexadas"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setFotosOpen(false);
                    }}
                >
                    <div
                        className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl"
                        style={{
                            maxHeight: viewport
                                ? `${Math.max(1, viewport.height - 24)}px`
                                : "calc(100dvh - 1.5rem)",
                        }}
                    >
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

                        <div
                            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 p-3 sm:p-4"
                            style={{
                                WebkitOverflowScrolling: "touch",
                                overscrollBehaviorY: "contain",
                                touchAction: "pan-y",
                            }}
                        >
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