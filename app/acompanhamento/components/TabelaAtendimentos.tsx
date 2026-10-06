"use client";

import React, { useMemo, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import { Registro } from "./types";
import { capitalizeStatus } from "./helpers";
import { proximaEtapaDoRegistro as proximaEtapa } from "./proximaEtapa";
import { type VisitaStatus } from "./visita";
import { atendimentoDeveFicarNoQuadro } from "@/components/atendimentos/regrasQuadro";
import {
    BTN_ACAO,
    BTN_EDITAR,
    BTN_COMPARTILHAR,
    BotaoRegistrarAcao,
    BotaoEditar,
    BotaoCompartilhar,
    BotaoVisita,
} from "@/components/atendimentos/BotoesAtendimento";

interface Props {
    registros: Registro[];
    onAcao: (id: Registro["id"]) => void;
    /** Opcional: a lista não tem mais o botão de informações (o Editar registro mostra os mesmos dados e os documentos). */
    onInfo?: (id: Registro["id"]) => void;
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

/* Ícones e botões: padrão único em components/atendimentos/BotoesAtendimento.tsx
   (o mesmo da janela "Informações do atendimento" do Quadro). */
export { BTN_ACAO, BTN_EDITAR, BTN_COMPARTILHAR };

const IcMais = () => (
    <svg viewBox="0 0 24 24" className="size-[22px]" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
    </svg>
);

/** Estado do atendimento no padrão do mockup: amarelo = registro novo, verde = concluído, azul = em andamento. */
function chipDoStatus(s?: string): { fundo: string; ponto: string } {
    const k = String(s || "").toLowerCase();
    if (k === "fase11" || k === "fase10" || k === "concluido") return { fundo: "bg-[#EEF5D6] dark:bg-[#B3CE52]/20", ponto: "bg-[#B3CE52]" };
    if (k === "fase00" || k === "") return { fundo: "bg-[#FCF3CC] dark:bg-[#F2CB3F]/16", ponto: "bg-[#F2CB3F]" };
    return { fundo: "bg-[#E9EFF6] dark:bg-[#3D6A99]/20", ponto: "bg-[#3D6A99]" };
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
                                        className={`min-h-[76px] border-t border-[#E3E8F0] dark:border-white/[0.12] ${sel ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/20" : "hover:bg-[#F6F8FB] dark:hover:bg-white/5"}`}
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
                                            <div className="text-[15px] font-extrabold text-[#313C55] dark:text-white">{r.falecido || ""}</div>
                                            {!ocultarAgente && r.agente ? (
                                                <div className="mt-0.5 text-xs text-[#5B6478] dark:text-[#AEB9CF]">Agente: {r.agente}</div>
                                            ) : null}
                                        </td>

                                        <td className="px-3 py-3 align-middle text-[#5B6478] dark:text-[#AEB9CF]">{proxima}</td>

                                        <td className="px-5 py-3 align-middle">
                                            <div className="flex items-center justify-end gap-2">
                                                <BotaoRegistrarAcao onClick={() => r.id != null && onAcao(r.id)} />
                                                {onEditar && <BotaoEditar onClick={() => r.id != null && onEditar(r.id)} />}
                                                <BotaoCompartilhar onClick={() => r.id != null && onCompartilhar(r.id)} />
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

            {/* CELULAR: nome + Registrar ação + "⋯" que abre Editar, Compartilhar e Visita (mesmos botões do computador) */}
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
                                    <BotaoRegistrarAcao onClick={() => r.id != null && onAcao(r.id)} />
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
                                    <div className="flex items-center gap-2 pb-3 pl-9 pr-4">
                                        {onEditar && <BotaoEditar onClick={() => r.id != null && onEditar(r.id)} />}
                                        <BotaoCompartilhar onClick={() => r.id != null && onCompartilhar(r.id)} />
                                        {visitaPermitida && onVisita && (
                                            <BotaoVisita status={statusVisita(r)} onClick={() => r.id != null && onVisita(r.id)} />
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
