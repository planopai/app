"use client";

import React from "react";
import { FalecidoItem } from "./TiposHistorico";
import { formataDataHora } from "./UtilDatas";
import type {
    AvaliacaoStatusResumo,
    StatusAvaliacoesItem,
} from "./Api";

interface Props {
    registros: FalecidoItem[];
    loading: boolean;
    pagina: number;
    totalPaginas: number;
    onPaginaAnterior: () => void;
    onPaginaProxima: () => void;
    selecionadoId?: string;
    onSelecionar: (item: FalecidoItem) => void;
    criacaoMap: Record<string, string>;

    avaliacoesMap?: Record<string, StatusAvaliacoesItem>;
    podeVerVisita?: boolean;
    podeVerPosAtendimento?: boolean;
    loadingAvaliacoes?: boolean;

    onAbrirVisita?: (item: FalecidoItem) => void;
    onAbrirPosAtendimento?: (item: FalecidoItem) => void;
}

/* =========================
   Helpers: ID e Datas
   ========================= */

function getRegistroId(item: FalecidoItem): string {
    const anyItem = item as any;
    return String(item?.sepultamento_id ?? anyItem?.id ?? "").trim();
}

function parseBrDate(s: string): Date | null {
    const m = s
        ?.trim()
        .match(
            /^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/,
        );

    if (!m) return null;

    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
    const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);

    return isNaN(d.getTime()) ? null : d;
}

function parseIsoDate(s: string): Date | null {
    const t = s?.trim().replace(" ", "T");
    if (!t) return null;

    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (m) {
        const [, yyyy, mm, dd] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, 0, 0, 0);
        return isNaN(d.getTime()) ? null : d;
    }

    m = t.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
    );

    if (m) {
        const [, yyyy, mm, dd, hh, mi, ss = "00"] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
        return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
}

function parseDateFlex(s?: string | null): Date | null {
    if (!s) return null;
    return parseBrDate(s) || parseIsoDate(s) || null;
}

function getItemDate(
    item: FalecidoItem,
    criacaoMap: Record<string, string>,
): Date | null {
    const id = getRegistroId(item);

    const candidatos = [
        id ? criacaoMap[id] : undefined,
        (item as any).created_at,
        (item as any).data,
        (item as any).data_inicio_velorio,
        (item as any).data_fim_velorio,
    ];

    for (const c of candidatos) {
        const d = parseDateFlex(String(c || ""));
        if (d) return d;
    }

    return null;
}

/* =========================
   Ícones / status
   ========================= */

function IconeVisita() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
        >
            <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
            <circle cx="12" cy="10" r="2.2" />
        </svg>
    );
}

function IconePos() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
        >
            <rect x="5" y="4" width="14" height="17" rx="2" />
            <path d="M9 4.5h6M9 9h6M9 13h6M9 17h4" />
            <path d="m15.5 16.5 1.3 1.3 2.7-3" />
        </svg>
    );
}

function statusVisual(status?: AvaliacaoStatusResumo | null) {
    switch (status?.status) {
        case "concluida":
            return {
                classes:
                    "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#B3CE52] dark:hover:bg-[#B3CE52]/25",
                texto: status.avaliador_nome
                    ? `Concluída por ${status.avaliador_nome}`
                    : "Concluída",
            };

        case "em_andamento":
            return {
                classes:
                    "border-blue-200 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-[#A9BED6] dark:hover:bg-[#3D6A99]/30",
                texto: status.avaliador_nome
                    ? `Em andamento por ${status.avaliador_nome}`
                    : "Em andamento",
            };

        case "pendente":
            return {
                classes:
                    "border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-200 dark:border-[#F2CB3F]/40 dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F] dark:hover:bg-[#F2CB3F]/25",
                texto: "Pendente",
            };

        case "nao_aplicavel":
            return {
                classes:
                    "border-slate-200 bg-slate-100 text-slate-400 cursor-default dark:border-white/12 dark:bg-white/10 dark:text-[#8893AA]",
                texto: "Não aplicável",
            };

        default:
            return {
                classes:
                    "border-slate-200 bg-slate-100 text-slate-400 dark:border-white/12 dark:bg-white/10 dark:text-[#8893AA]",
                texto: "Status indisponível",
            };
    }
}

function BotaoAvaliacao({
    tipo,
    status,
    disabled,
    onClick,
}: {
    tipo: "visita" | "pos";
    status?: AvaliacaoStatusResumo | null;
    disabled?: boolean;
    onClick: () => void;
}) {
    const visual = statusVisual(status);
    const naoAplicavel = status?.status === "nao_aplicavel";

    const titulo =
        `${tipo === "visita" ? "Visita" : "Pós-Atendimento"}: ` +
        visual.texto;

    return (
        <button
            type="button"
            title={titulo}
            aria-label={titulo}
            disabled={disabled || naoAplicavel}
            onClick={(e) => {
                e.stopPropagation();
                if (!disabled && !naoAplicavel) onClick();
            }}
            className={[
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition",
                visual.classes,
                disabled ? "opacity-50 cursor-wait" : "",
            ].join(" ")}
        >
            {tipo === "visita" ? <IconeVisita /> : <IconePos />}
        </button>
    );
}

export default function ListaRegistros({
    registros,
    loading,
    pagina,
    totalPaginas,
    onPaginaAnterior,
    onPaginaProxima,
    selecionadoId,
    onSelecionar,
    criacaoMap,

    avaliacoesMap = {},
    podeVerVisita = false,
    podeVerPosAtendimento = false,
    loadingAvaliacoes = false,

    onAbrirVisita,
    onAbrirPosAtendimento,
}: Props) {
    const semDuplicados = React.useMemo(() => {
        const map = new Map<string, FalecidoItem>();

        for (let i = 0; i < (registros || []).length; i++) {
            const it = registros[i];
            let id = getRegistroId(it);

            if (!id) {
                const created = (it as any).created_at || "";
                id = `sem-id-${i}-${String(created)}`;
                map.set(id, it);
                continue;
            }

            const atual = map.get(id);

            if (!atual) {
                map.set(id, it);
            } else {
                const dNovo = getItemDate(it, criacaoMap)?.getTime() ?? 0;
                const dAtual = getItemDate(atual, criacaoMap)?.getTime() ?? 0;

                if (dNovo >= dAtual) {
                    map.set(id, it);
                }
            }
        }

        return Array.from(map.values());
    }, [registros, criacaoMap]);

    const ordenados = React.useMemo(() => {
        const arr = [...semDuplicados];

        arr.sort((a, b) => {
            const da = getItemDate(a, criacaoMap);
            const db = getItemDate(b, criacaoMap);

            const ta = da ? da.getTime() : 0;
            const tb = db ? db.getTime() : 0;

            return tb - ta;
        });

        return arr;
    }, [semDuplicados, criacaoMap]);

    return (
        <div className="flex w-full flex-col overflow-hidden rounded border">
            <div className="bg-gray-100 p-3 font-semibold dark:bg-white/10">Registros</div>

            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="p-4 text-center">Carregando...</div>
                ) : ordenados.length === 0 ? (
                    <div className="p-4 text-center">
                        Nenhum registro encontrado.
                    </div>
                ) : (
                    <ul>
                        {ordenados.map((item, idx) => {
                            const id = getRegistroId(item);

                            const criadoEm =
                                (id ? criacaoMap[id] : "") ||
                                (item as any).created_at ||
                                "";

                            const key =
                                (id ? `id-${id}` : `sem-id-${idx}`) +
                                `-${criadoEm || "s-data"}`;

                            const status =
                                id && avaliacoesMap[id]
                                    ? avaliacoesMap[id]
                                    : undefined;

                            return (
                                <li
                                    key={key}
                                    className={[
                                        "border-b",
                                        selecionadoId === id
                                            ? "bg-blue-50 dark:bg-[#3D6A99]/20"
                                            : "bg-white dark:bg-[#232B3F]",
                                    ].join(" ")}
                                >
                                    <div className="px-3 py-3 hover:bg-muted/40">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                                            <button
                                                type="button"
                                                className="min-w-0 flex-1 text-left"
                                                onClick={() => onSelecionar(item)}
                                            >
                                                <div className="break-words text-sm font-medium leading-5 text-slate-900 sm:truncate sm:text-base dark:text-white">
                                                    {item.falecido}
                                                </div>
                                            </button>

                                            <div className="flex min-w-0 items-center justify-between gap-3 sm:shrink-0 sm:justify-end">
                                                <div className="min-w-0 text-xs text-muted-foreground sm:text-right">
                                                    {criadoEm
                                                        ? formataDataHora(criadoEm)
                                                        : "—"}
                                                </div>

                                                <div className="flex shrink-0 items-center gap-2">
                                                    {id && podeVerVisita ? (
                                                        <BotaoAvaliacao
                                                            tipo="visita"
                                                            status={status?.visita}
                                                            disabled={
                                                                loadingAvaliacoes
                                                            }
                                                            onClick={() =>
                                                                onAbrirVisita?.(
                                                                    item,
                                                                )
                                                            }
                                                        />
                                                    ) : null}

                                                    {id &&
                                                        podeVerPosAtendimento ? (
                                                        <BotaoAvaliacao
                                                            tipo="pos"
                                                            status={
                                                                status?.pos_atendimento
                                                            }
                                                            disabled={
                                                                loadingAvaliacoes
                                                            }
                                                            onClick={() =>
                                                                onAbrirPosAtendimento?.(
                                                                    item,
                                                                )
                                                            }
                                                        />
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="flex items-center justify-between border-t bg-gray-50 p-2 dark:bg-[#1C2334]">
                <button
                    onClick={onPaginaAnterior}
                    disabled={pagina <= 1}
                    className="rounded border px-2 py-1 disabled:opacity-50"
                >
                    ← Anterior
                </button>

                <span className="text-sm">
                    Página {pagina} / {Math.max(1, totalPaginas)}
                </span>

                <button
                    onClick={onPaginaProxima}
                    disabled={pagina >= totalPaginas}
                    className="rounded border px-2 py-1 disabled:opacity-50"
                >
                    Próxima →
                </button>
            </div>
        </div>
    );
}
