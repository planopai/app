"use client";

import React, { useMemo, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import { Registro } from "./types";
import { acaoToStatus, capitalizeStatus, proximaFaseDoRegistro } from "./helpers";
import { fases } from "./constants";
import { type VisitaStatus } from "./visita";
import { atendimentoDeveFicarNoQuadro } from "@/components/atendimentos/regrasQuadro";

interface Props {
    registros: Registro[];
    onAcao: (id: Registro["id"]) => void;
    onInfo: (id: Registro["id"]) => void;
    onCompartilhar: (id: Registro["id"]) => void;
    /** Abre o cadastro do atendimento para edição (botão amarelo do mockup). */
    onEditar?: (id: Registro["id"]) => void;

    // Visita de avaliação
    visitaPermitida?: boolean;
    visitaStatusById?: Record<string, VisitaStatus>;
    onVisita?: (id: Registro["id"]) => void;

    // A avaliação é cega: usuários autorizados à Visita não devem ver o agente.
    ocultarAgente?: boolean;

    // Atendimento aberto na janela "Registrar ação" (destaca a linha).
    selecionadoId?: Registro["id"] | null;
}

/* =====================================================================================
   Ícones: exatamente os do mockup (Atendimentos.dc.html e AtendimentosCelular.dc.html).
   24×24, traço 1,8, pontas arredondadas, cor = currentColor.
   ===================================================================================== */
function Ic({ children, className = "size-5" }: { children: React.ReactNode; className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {children}
        </svg>
    );
}
const IcAcaoSeta = () => (<Ic><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="m12 8 4 4-4 4" /></Ic>);
const IcAcaoLista = () => (<Ic className="size-[22px]"><path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" /></Ic>);
const IcInfo = ({ className }: { className?: string }) => (<Ic className={className}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></Ic>);
const IcEditar = ({ className }: { className?: string }) => (<Ic className={className}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Ic>);
const IcCompartilhar = ({ className }: { className?: string }) => (<Ic className={className}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4" /><path d="m15.4 6.5-6.8 4" /></Ic>);
const IcOlho = ({ className }: { className?: string }) => (<Ic className={className}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Ic>);
const IcMais = () => (
    <svg viewBox="0 0 24 24" className="size-[22px]" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
    </svg>
);

/* =====================================================================================
   Botões padronizados (44 × 44, raio 12). Mesma cor em todas as telas:
   • Registrar ação ......... azul-marinho #313C55, ícone branco   (no escuro: ciano #00AEEC, ícone #313C55)
   • Informações ............ contorno azul-marinho, fundo do cartão
   • Editar ................. amarelo #F2CB3F, ícone #313C55
   • Compartilhar ........... verde-lima #B3CE52, ícone #313C55
   • Visita ................. contorno (visitar) · ciano (em andamento) · verde (finalizada) · apagado (indisponível)
   ===================================================================================== */
const BASE = "inline-flex h-11 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00AEEC]";
export const BTN_ACAO = `${BASE} w-11 bg-[#313C55] text-white hover:bg-[#232B40] dark:bg-[#00AEEC] dark:text-[#313C55] dark:hover:bg-[#0097CC]`;
export const BTN_INFO = `${BASE} w-11 border-[1.5px] border-[#313C55] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/40 dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/10`;
export const BTN_EDITAR = `${BASE} w-11 border-[1.5px] border-[#F2CB3F] bg-[#F2CB3F] text-[#313C55] hover:bg-[#E4BC30]`;
export const BTN_COMPARTILHAR = `${BASE} w-11 border-[1.5px] border-[#B3CE52] bg-[#B3CE52] text-[#313C55] hover:bg-[#A3BE45]`;

function classeVisita(s: VisitaStatus): string {
    if (s === "em_andamento") return "border-[1.5px] border-[#00AEEC] bg-[#00AEEC] text-[#313C55]";
    if (s === "visitado") return "border-[1.5px] border-[#B3CE52] bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/20 dark:text-white";
    if (s === "visitar") return "border-[1.5px] border-[#313C55] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/60 dark:bg-[#232B3F] dark:text-white";
    return "border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] opacity-45 cursor-not-allowed dark:border-white/25 dark:bg-[#232B3F] dark:text-white";
}
function rotuloVisita(s: VisitaStatus): { aria: string; curto: string } {
    if (s === "visitar") return { aria: "Iniciar visita", curto: "Visitar" };
    if (s === "em_andamento") return { aria: "Visita em andamento", curto: "Em andamento" };
    if (s === "visitado") return { aria: "Visita finalizada", curto: "Finalizada" };
    return { aria: "Visita indisponível", curto: "Visita" };
}
function BotaoVisita({ status, onClick, comRotulo = false }: { status: VisitaStatus; onClick: () => void; comRotulo?: boolean }) {
    const { aria, curto } = rotuloVisita(status);
    const off = status === "indisponivel";
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={off}
            aria-label={aria}
            title={off ? "Visita disponível somente durante o velório." : aria}
            className={`${BASE} ${comRotulo ? "flex-[1.35] gap-1.5 px-3 text-sm font-extrabold" : "w-11"} ${classeVisita(status)}`}
        >
            <IcOlho />
            {comRotulo ? curto : null}
        </button>
    );
}

/** Estado do atendimento no padrão do mockup: amarelo = registro novo, verde = concluído, ciano = em andamento. */
function chipDoStatus(s?: string): { fundo: string; ponto: string } {
    const k = String(s || "").toLowerCase();
    if (k === "fase11" || k === "fase10" || k === "concluido") return { fundo: "bg-[#EEF5D6] dark:bg-[#B3CE52]/20", ponto: "bg-[#B3CE52]" };
    if (k === "fase00" || k === "") return { fundo: "bg-[#FCF3CC] dark:bg-[#F2CB3F]/16", ponto: "bg-[#F2CB3F]" };
    return { fundo: "bg-[#E6F7FE] dark:bg-[#00AEEC]/20", ponto: "bg-[#00AEEC]" };
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

export default function TabelaAtendimentos({
    registros,
    onAcao,
    onInfo,
    onCompartilhar,
    onEditar,
    visitaPermitida = false,
    visitaStatusById = {},
    onVisita,
    ocultarAgente = false,
    selecionadoId = null,
}: Props) {
    const [busca, setBusca] = useState("");
    const [abertoId, setAbertoId] = useState<string | null>(null);

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

    const vazio = visiveis.length === 0 ? "Nenhum registro disponível neste aparelho." : "Nenhum atendimento encontrado.";
    const statusVisita = (r: Registro): VisitaStatus => visitaStatusById[String(r.id ?? "")] ?? "indisponivel";

    return (
        <div>
            <label className="mb-4 flex h-11 items-center gap-2.5 rounded-xl border border-[#E3E8F0] bg-white px-3.5 text-[#5B6478] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#AEB9CF]">
                <IconSearch size={18} />
                <input
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por nome ou status"
                    aria-label="Buscar atendimento"
                    className="min-w-0 flex-1 bg-transparent text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] dark:text-white sm:text-sm"
                />
            </label>

            {/* COMPUTADOR: tabela (largura toda; o "Registrar ação" abre numa janela) */}
            <div className="hidden overflow-hidden rounded-[18px] border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F] lg:block">
                <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#F6F8FB] text-xs font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                        <tr>
                            <th className="w-60 px-5 py-3">Status</th>
                            <th className="px-3 py-3">Falecido(a)</th>
                            <th className="px-3 py-3">Próxima etapa</th>
                            <th className="w-[300px] px-5 py-3 text-right">Ações</th>
                        </tr>
                    </thead>

                    <tbody id="tb-registros">
                        {linhas.length === 0 ? (
                            <tr>
                                <td className="px-5 py-9 text-center text-[#5B6478] dark:text-[#AEB9CF]" colSpan={4}>
                                    {vazio}
                                </td>
                            </tr>
                        ) : (
                            linhas.map(({ r, status, proxima }, idx) => {
                                const chip = chipDoStatus(r.status as string);
                                const sel = selecionadoId != null && String(selecionadoId) === String(r.id);
                                return (
                                    <tr
                                        key={String(r.id ?? `row-${idx}`)}
                                        className={`min-h-[76px] border-t border-[#E3E8F0] dark:border-white/[0.12] ${sel ? "bg-[#E6F7FE] dark:bg-[#00AEEC]/20" : "hover:bg-[#F6F8FB] dark:hover:bg-white/5"}`}
                                    >
                                        <td className="px-5 py-3 align-middle">
                                            <div className="flex flex-col items-start gap-1">
                                                <span className={`inline-flex min-h-7 max-w-full items-center gap-2 rounded-[14px] px-3 py-1 text-[13px] font-bold leading-tight text-[#313C55] dark:text-white ${chip.fundo}`}>
                                                    <span className={`size-2 shrink-0 rounded-full ${chip.ponto}`} />
                                                    {status}
                                                </span>
                                                <SyncBadge registro={r} />
                                            </div>
                                        </td>

                                        <td className="px-3 py-3 align-middle">
                                            <button
                                                type="button"
                                                onClick={() => r.id != null && onInfo(r.id)}
                                                className="text-left text-[15px] font-extrabold text-[#313C55] hover:underline dark:text-white"
                                                title="Ver informações do atendimento"
                                            >
                                                {r.falecido || ""}
                                            </button>
                                            {!ocultarAgente && r.agente ? (
                                                <div className="mt-0.5 text-xs text-[#5B6478] dark:text-[#AEB9CF]">Agente: {r.agente}</div>
                                            ) : null}
                                        </td>

                                        <td className="px-3 py-3 align-middle text-[#5B6478] dark:text-[#AEB9CF]">{proxima}</td>

                                        <td className="px-5 py-3 align-middle">
                                            <div className="flex items-center justify-end gap-2">
                                                <button type="button" className={BTN_ACAO} onClick={() => r.id != null && onAcao(r.id)} title="Registrar ação" aria-label="Registrar ação">
                                                    <IcAcaoSeta />
                                                </button>
                                                <button type="button" className={BTN_INFO} onClick={() => r.id != null && onInfo(r.id)} title="Informações" aria-label="Informações">
                                                    <IcInfo />
                                                </button>
                                                {onEditar && (
                                                    <button type="button" className={BTN_EDITAR} onClick={() => r.id != null && onEditar(r.id)} title="Editar" aria-label="Editar">
                                                        <IcEditar />
                                                    </button>
                                                )}
                                                <button type="button" className={BTN_COMPARTILHAR} onClick={() => r.id != null && onCompartilhar(r.id)} title="Compartilhar" aria-label="Compartilhar atendimento">
                                                    <IcCompartilhar />
                                                </button>
                                                {visitaPermitida && onVisita && (
                                                    <BotaoVisita status={statusVisita(r)} onClick={() => r.id != null && onVisita(r.id)} />
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* CELULAR: nome + ícone de ações + "⋯" que abre as outras opções (AtendimentosCelular.dc.html) */}
            <div className="overflow-hidden rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F] lg:hidden">
                {linhas.length === 0 ? (
                    <div className="p-8 text-center text-sm text-[#5B6478] dark:text-[#AEB9CF]">{vazio}</div>
                ) : (
                    linhas.map(({ r, status, proxima }, idx) => {
                        const id = String(r.id ?? `row-${idx}`);
                        const aberto = abertoId === id;
                        const chip = chipDoStatus(r.status as string);
                        const novo = String(r.status || "fase00").toLowerCase() === "fase00";
                        const sub = novo ? "Novo registro" : proxima !== "—" ? `Aguardando ${proxima}` : status;
                        return (
                            <div key={id} className={`border-b border-[#E3E8F0] last:border-b-0 dark:border-white/[0.12] ${aberto ? "bg-[#F6F8FB] dark:bg-[#1C2334]" : ""}`}>
                                <div className="flex min-h-[68px] items-center gap-2.5 py-2 pl-4 pr-1">
                                    <span className={`size-2.5 shrink-0 rounded-full ${chip.ponto}`} aria-hidden="true" />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-base font-extrabold text-[#313C55] dark:text-white" title={`${r.falecido || ""} · ${status}`}>
                                            {r.falecido || ""}
                                        </div>
                                        <div className="mt-px flex items-center gap-2">
                                            <span className="truncate text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{sub}</span>
                                            <SyncBadge registro={r} />
                                        </div>
                                    </div>
                                    <button type="button" className={BTN_ACAO} onClick={() => r.id != null && onAcao(r.id)} title="Ações" aria-label="Ações">
                                        <IcAcaoLista />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAbertoId(aberto ? null : id)}
                                        aria-expanded={aberto}
                                        aria-label="Mais opções"
                                        className="grid size-11 shrink-0 place-items-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/10"
                                    >
                                        <IcMais />
                                    </button>
                                </div>

                                {aberto && (
                                    <div className="flex gap-2 pb-3 pl-9 pr-4">
                                        <button type="button" className={`${BASE} h-12 flex-1 border-[1.5px] border-[#313C55] bg-white text-[#313C55] dark:border-white/40 dark:bg-[#232B3F] dark:text-white`} onClick={() => r.id != null && onInfo(r.id)} title="Informações" aria-label="Informações">
                                            <IcInfo className="size-[22px]" />
                                        </button>
                                        {onEditar && (
                                            <button type="button" className={`${BASE} h-12 flex-1 border-[1.5px] border-[#F2CB3F] bg-[#F2CB3F] text-[#313C55]`} onClick={() => r.id != null && onEditar(r.id)} title="Editar" aria-label="Editar">
                                                <IcEditar className="size-[22px]" />
                                            </button>
                                        )}
                                        <button type="button" className={`${BASE} h-12 flex-1 border-[1.5px] border-[#B3CE52] bg-[#B3CE52] text-[#313C55]`} onClick={() => r.id != null && onCompartilhar(r.id)} title="Compartilhar" aria-label="Compartilhar">
                                            <IcCompartilhar className="size-[22px]" />
                                        </button>
                                        {visitaPermitida && onVisita && (
                                            <BotaoVisita comRotulo status={statusVisita(r)} onClick={() => r.id != null && onVisita(r.id)} />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
