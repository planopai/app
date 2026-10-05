"use client";

import React, { useMemo, useState } from "react";
import { IconChecklist, IconInfoCircle, IconSearch, IconShare3 } from "@tabler/icons-react";
import { Registro } from "./types";
import { acaoToStatus, capitalizeStatus, proximaFaseDoRegistro } from "./helpers";
import { fases } from "./constants";
import { VisitaBotao, type VisitaStatus } from "./visita";
import { atendimentoDeveFicarNoQuadro } from "@/components/atendimentos/regrasQuadro";

interface Props {
    registros: Registro[];
    onAcao: (id: Registro["id"]) => void;
    onInfo: (id: Registro["id"]) => void;
    onCompartilhar: (id: Registro["id"]) => void;

    // Visita de avaliação
    visitaPermitida?: boolean;
    visitaStatusById?: Record<string, VisitaStatus>;
    onVisita?: (id: Registro["id"]) => void;

    // A avaliação é cega: usuários autorizados à Visita não devem ver o agente.
    ocultarAgente?: boolean;

    // Atendimento aberto no painel "Registrar ação" (destaca a linha).
    selecionadoId?: Registro["id"] | null;
}

/**
 * Cores do status (repaginada): azul no fluxo, amarelo quando está aguardando,
 * verde quando concluiu. Vermelho não é usado aqui.
 */
function statusClasse(s?: string) {
    const k = String(s || "").toLowerCase();
    if (k === "fase11" || k === "fase10" || k === "concluido") {
        return "border-[#7BA11A] bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/20 dark:text-white";
    }
    if (k === "fase02" || k === "fase04" || k === "fase06" || k === "fase00") {
        return "border-[#F2CB3F] bg-[#FCF3CC] text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white";
    }
    return "border-[#8FD6F4] bg-[#E6F7FE] text-[#313C55] dark:border-[#00AEEC]/50 dark:bg-[#00AEEC]/20 dark:text-white";
}

function isTerceiro(r: Registro) {
    return String((r as any).tipo_atendimento ?? "").trim().toLowerCase() === "terceiro";
}

/** Texto da próxima etapa (mesma regra usada em "Registrar ação"). */
function proximaEtapa(r: Registro): string {
    try {
        if (isTerceiro(r)) {
            const ordem = ["fase08", "fase09", "fase10"];
            const i = ordem.indexOf(String(r.status || ""));
            const prox = i < 0 ? ordem[0] : ordem[i + 1];
            return prox ? acaoToStatus(prox) : "—";
        }

        const prox = proximaFaseDoRegistro(
            {
                status: (r.status as string) ?? "fase00",
                local_velorio: (r as any).local_velorio,
                sala_velorio: (r as any).sala_velorio,
                tanato: (r as any).tanato,
                ornamentacao: (r as any).ornamentacao,
                assistencia: (r as any).assistencia,
                realiza_velorio: (r as any).realiza_velorio,
                realiza_sepultamento: (r as any).realiza_sepultamento,
            },
            fases as readonly string[],
        );

        return prox ? acaoToStatus(prox) : "—";
    } catch {
        return "—";
    }
}

function SyncBadge({ registro }: { registro: Registro }) {
    const status = String((registro as any).__syncStatus ?? "synced");
    const count = Number((registro as any).__pendingCount ?? 0) || 0;

    if (status === "requires_attention") {
        return (
            <span className="inline-flex rounded-full border border-[#B42318] bg-[#FDECEA] px-2 py-0.5 text-[10px] font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                Requer atenção
            </span>
        );
    }

    if (status === "pending") {
        return (
            <span className="inline-flex rounded-full border border-[#F2CB3F] bg-[#F2CB3F] px-2 py-0.5 text-[10px] font-bold text-[#313C55]">
                {count > 1 ? `${count} pendentes` : "Pendente"}
            </span>
        );
    }

    return null;
}

const BTN_PRIMARIO =
    "inline-flex h-10 items-center justify-center rounded-xl bg-[#313C55] px-4 text-sm font-extrabold text-white hover:bg-[#232B40] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
const ICONE_PRIMARIO =
    "grid h-11 flex-1 place-items-center rounded-xl bg-[#313C55] text-white hover:bg-[#232B40] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
const ICONE_SECUNDARIO =
    "grid h-11 flex-1 place-items-center rounded-xl border-[1.5px] border-[#313C55] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/40 dark:bg-transparent dark:text-white dark:hover:bg-white/10";
const BTN_SECUNDARIO =
    "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-[#313C55] bg-white dark:bg-[#232B3F] px-4 text-sm font-bold text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/40 dark:text-white dark:hover:bg-white/10";

export default function TabelaAtendimentos({
    registros,
    onAcao,
    onInfo,
    onCompartilhar,
    visitaPermitida = false,
    visitaStatusById = {},
    onVisita,
    ocultarAgente = false,
    selecionadoId = null,
}: Props) {
    const [busca, setBusca] = useState("");

    // Concluídos não aparecem aqui: a regra é a mesma do Quadro de Acompanhamento.
    const visiveis = useMemo(() => registros.filter((r) => atendimentoDeveFicarNoQuadro(r as any)), [registros]);

    const linhas = useMemo(() => {
        const q = busca.trim().toLocaleLowerCase("pt-BR");
        return visiveis
            .map((r) => ({
                r,
                status: capitalizeStatus(r.status),
                proxima: proximaEtapa(r),
            }))
            .filter(({ r, status }) => !q || `${r.falecido || ""} ${status}`.toLocaleLowerCase("pt-BR").includes(q));
    }, [visiveis, busca]);

    return (
        <div>
            <div className="mb-3 flex h-11 items-center gap-2.5 rounded-xl border border-[#E3E8F0] bg-white dark:bg-[#232B3F] px-3.5 text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]">
                <IconSearch size={18} />
                <input
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por nome ou status"
                    aria-label="Buscar atendimento"
                    className="min-w-0 flex-1 bg-transparent text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] dark:text-white sm:text-sm"
                />
            </div>

            {/* COMPUTADOR: tabela */}
            <div className="hidden overflow-hidden rounded-[18px] border border-[#E3E8F0] bg-white dark:bg-[#232B3F] dark:border-white/[0.12] lg:block">
                <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#F6F8FB] text-xs font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                        <tr>
                            <th className="w-52 px-5 py-3">Status</th>
                            <th className="px-3 py-3">Falecido(a)</th>
                            <th className="px-3 py-3">Próxima etapa</th>
                            <th className="px-5 py-3 text-right">Ações</th>
                        </tr>
                    </thead>

                    <tbody id="tb-registros">
                        {linhas.length === 0 ? (
                            <tr>
                                <td className="px-5 py-8 text-center text-[#5B6478] dark:text-[#AEB9CF]" colSpan={4}>
                                    {visiveis.length === 0 ? "Nenhum registro disponível neste aparelho." : "Nenhum atendimento encontrado."}
                                </td>
                            </tr>
                        ) : (
                            linhas.map(({ r, status, proxima }, idx) => (
                                <tr key={String(r.id ?? `row-${idx}`)} className={["border-t border-[#E3E8F0] hover:bg-[#EEF2F7] dark:border-white/[0.12] dark:hover:bg-white/10", selecionadoId != null && String(selecionadoId) === String(r.id) ? "bg-[#E6F7FE] dark:bg-[#00AEEC]/20" : ""].join(" ")}>
                                    <td className="px-5 py-3 align-middle">
                                        <div className="flex flex-col items-start gap-1">
                                            <span className={["inline-flex rounded-full border px-3 py-1 text-xs font-extrabold border-[#E3E8F0] dark:border-white/[0.12]", statusClasse(r.status)].join(" ")}>
                                                {status}
                                            </span>
                                            <SyncBadge registro={r} />
                                        </div>
                                    </td>

                                    <td className="px-3 py-3 align-middle">
                                        <div className="font-extrabold text-[#313C55] dark:text-white">{r.falecido || ""}</div>
                                        {!ocultarAgente && r.agente ? (
                                            <div className="mt-0.5 text-xs text-[#5B6478] dark:text-[#AEB9CF]">Agente: {r.agente}</div>
                                        ) : null}
                                    </td>

                                    <td className="px-3 py-3 align-middle font-semibold text-[#313C55] dark:text-[#D6DCE8]">{proxima}</td>

                                    <td className="px-5 py-3 align-middle">
                                        <div className="flex items-center justify-end gap-2">
                                            <button className={BTN_PRIMARIO} onClick={() => r.id != null && onAcao(r.id)}>
                                                Ações
                                            </button>
                                            <button className={BTN_SECUNDARIO} onClick={() => r.id != null && onInfo(r.id)}>
                                                Info
                                            </button>
                                            <button
                                                className={BTN_SECUNDARIO}
                                                onClick={() => r.id != null && onCompartilhar(r.id)}
                                                title="Compartilhar"
                                                aria-label="Compartilhar"
                                            >
                                                <IconShare3 className="size-4" />
                                            </button>
                                            {visitaPermitida && onVisita && (
                                                <VisitaBotao
                                                    status={visitaStatusById[String(r.id ?? "")] ?? "indisponivel"}
                                                    onClick={() => r.id != null && onVisita(r.id)}
                                                />
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* CELULAR (vertical e horizontal): linhas compactas */}
            <div className="grid grid-cols-1 gap-2.5 sm:landscape:grid-cols-2 lg:hidden">
                {linhas.length === 0 ? (
                    <div className="rounded-2xl border border-[#E3E8F0] bg-white dark:bg-[#232B3F] p-5 text-center text-sm text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]">
                        {visiveis.length === 0 ? "Nenhum registro disponível neste aparelho." : "Nenhum atendimento encontrado."}
                    </div>
                ) : (
                    linhas.map(({ r, status, proxima }, idx) => (
                        <div
                            key={String(r.id ?? `row-${idx}`)}
                            className="rounded-2xl border border-[#E3E8F0] bg-white dark:bg-[#232B3F] p-3 dark:border-white/[0.12]"
                        >
                            <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[15px] font-extrabold text-[#313C55] dark:text-white">{r.falecido || ""}</div>
                                    {proxima !== "—" ? (
                                        <div className="mt-0.5 truncate text-xs text-[#5B6478] dark:text-[#AEB9CF]">Próxima etapa: <b className="text-[#313C55] dark:text-[#D6DCE8]">{proxima}</b></div>
                                    ) : null}
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                    <span className={["inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold border-[#E3E8F0] dark:border-white/[0.12]", statusClasse(r.status)].join(" ")}>
                                        {status}
                                    </span>
                                    <SyncBadge registro={r} />
                                </div>
                            </div>

                            <div className="mt-2.5 flex items-center gap-2">
                                <button
                                    className={ICONE_PRIMARIO}
                                    onClick={() => r.id != null && onAcao(r.id)}
                                    title="Ações"
                                    aria-label="Ações"
                                >
                                    <IconChecklist className="size-[22px]" />
                                </button>
                                <button
                                    className={ICONE_SECUNDARIO}
                                    onClick={() => r.id != null && onInfo(r.id)}
                                    title="Info"
                                    aria-label="Info"
                                >
                                    <IconInfoCircle className="size-[22px]" />
                                </button>
                                <button
                                    className={ICONE_SECUNDARIO}
                                    onClick={() => r.id != null && onCompartilhar(r.id)}
                                    title="Compartilhar"
                                    aria-label="Compartilhar"
                                >
                                    <IconShare3 className="size-[22px]" />
                                </button>
                                {visitaPermitida && onVisita && (
                                    <VisitaBotao
                                        somenteIcone
                                        className="flex-1"
                                        status={visitaStatusById[String(r.id ?? "")] ?? "indisponivel"}
                                        onClick={() => r.id != null && onVisita(r.id)}
                                    />
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
