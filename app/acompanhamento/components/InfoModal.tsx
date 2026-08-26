"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import type { Registro } from "./types";
import { capitalizeStatus } from "./helpers";

function shown(value: unknown, fallback = "A definir") {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function formatDate(value: unknown) {
    const text = String(value ?? "").trim();
    if (!text) return "A definir";
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return text;
}

function formatCpf(value: unknown) {
    const digits = String(value ?? "").replace(/\D+/g, "").slice(0, 11);
    if (digits.length !== 11) return shown(value);
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[minmax(110px,0.8fr)_minmax(0,1.7fr)] gap-3 border-b py-2 last:border-b-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words text-sm font-medium text-foreground">{value}</dd>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-xl border bg-background p-3">
            <h3 className="mb-1 text-sm font-extrabold text-slate-800 dark:text-slate-100">{title}</h3>
            <dl>{children}</dl>
        </section>
    );
}

export default function InfoModal({
    open,
    setOpen,
    infoIdx,
    abrirWizard,
    abrirAssinatura,
    registro,
    wizardStepTitles,
}: {
    open: boolean;
    setOpen: (b: boolean) => void;
    infoIdx: number | null;
    abrirWizard: (tipo: "novo" | "editar", idx?: number | null, grupoStep?: number | null) => void;
    abrirAssinatura: (idx: number, tipo: "recebimento" | "requisicao") => void;
    registro?: Registro | null;
    wizardStepTitles: Array<string | null>;
}) {
    const [online, setOnline] = useState(true);

    useEffect(() => {
        const update = () => setOnline(navigator.onLine !== false);
        update();
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);

    const materiais = useMemo(() => {
        if (!registro) return [] as Array<{ nome: string; qtd: number }>;
        let source: any = registro.materiais;
        if ((!source || typeof source !== "object") && registro.materiais_json) {
            try {
                source = JSON.parse(registro.materiais_json);
            } catch {
                source = null;
            }
        }
        if (!source || typeof source !== "object") return [];

        return Object.entries(source)
            .map(([key, raw]: [string, any]) => ({
                key,
                nome: String(raw?.nome ?? key),
                qtd: Number(raw?.qtd ?? 0) || 0,
                checked: !!raw?.checked,
            }))
            .filter((item) => item.checked && item.qtd > 0)
            .map(({ nome, qtd }) => ({ nome, qtd }));
    }, [registro]);

    const syncStatus = String((registro as any)?.__syncStatus ?? "synced");
    const pendingCount = Number((registro as any)?.__pendingCount ?? 0) || 0;

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Info" maxWidth={760}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl font-semibold">Informações do Atendimento</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {registro?.falecido ? shown(registro.falecido) : "Registro não encontrado no armazenamento local."}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                    {!online && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">
                            Offline
                        </span>
                    )}
                    {syncStatus === "pending" && (
                        <span className="rounded-full bg-orange-100 px-2.5 py-1 font-semibold text-orange-800">
                            {pendingCount > 0 ? `${pendingCount} ação(ões) pendente(s)` : "Aguardando sincronização"}
                        </span>
                    )}
                    {syncStatus === "requires_attention" && (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-700">
                            Requer atenção
                        </span>
                    )}
                </div>
            </div>

            {!registro ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Este atendimento não está disponível no cache local deste usuário.
                </div>
            ) : (
                <div className="mt-4 max-h-[64vh] space-y-3 overflow-y-auto pr-1">
                    <Section title="Atendimento">
                        <DataRow label="Status" value={capitalizeStatus(registro.status)} />
                        <DataRow label="Falecido(a)" value={shown(registro.falecido)} />
                        <DataRow label="Agente" value={shown(registro.agente)} />
                        <DataRow label="Tipo" value={shown(registro.tipo_atendimento)} />
                        <DataRow label="Convênio" value={shown(registro.convenio)} />
                        <DataRow label="Contato" value={shown(registro.contato)} />
                        <DataRow label="Religião" value={shown(registro.religiao)} />
                    </Section>

                    <Section title="Falecido(a) e responsável">
                        <DataRow label="Nascimento" value={formatDate(registro.data_nascimento)} />
                        <DataRow label="Falecimento" value={formatDate(registro.data_falecimento)} />
                        <DataRow label="Responsável" value={shown(registro.nome_responsavel)} />
                        <DataRow label="CPF" value={formatCpf(registro.cpf_responsavel)} />
                    </Section>

                    <Section title="Itens e preparação">
                        <DataRow label="Urna" value={shown(registro.urna)} />
                        <DataRow label="Roupa" value={shown(registro.roupa)} />
                        <DataRow label="Assistência" value={shown(registro.assistencia)} />
                        <DataRow label="Tanatopraxia" value={shown(registro.tanato)} />
                        <DataRow label="Ornamentação" value={shown(registro.ornamentacao)} />
                        <DataRow label="Tipo orn." value={shown(registro.ornamentacao_tipo)} />
                        <DataRow label="Invol" value={shown(registro.invol)} />
                        <DataRow label="Véu" value={shown(registro.veu)} />
                        <DataRow label="Cordão" value={shown(registro.cordao)} />
                        <DataRow label="Kit lanche" value={shown(registro.kit_lanche)} />
                        <DataRow label="Coroa" value={shown(registro.coroa_flores)} />
                    </Section>

                    <Section title="Velório">
                        <DataRow label="Realiza" value={shown(registro.realiza_velorio)} />
                        <DataRow label="Local" value={shown(registro.local_velorio)} />
                        <DataRow label="Sala" value={shown(registro.sala_velorio)} />
                        <DataRow label="Online" value={shown(registro.velorio_online)} />
                        <DataRow label="Data início" value={formatDate(registro.data_inicio_velorio)} />
                        <DataRow label="Hora início" value={shown(registro.hora_inicio_velorio)} />
                        <DataRow label="Data fim" value={formatDate(registro.data_fim_velorio)} />
                        <DataRow label="Hora fim" value={shown(registro.hora_fim_velorio)} />
                    </Section>

                    <Section title="Sepultamento">
                        <DataRow label="Realiza" value={shown(registro.realiza_sepultamento)} />
                        <DataRow label="Local" value={shown((registro as any).local_sepultamento ?? registro.local)} />
                        <DataRow
                            label="Resp. transporte"
                            value={shown(registro.responsavel_sepultamento_nome)}
                        />
                        <DataRow
                            label="Desde"
                            value={shown(registro.responsavel_sepultamento_desde)}
                        />
                    </Section>

                    <Section title="Responsabilidade do velório">
                        <DataRow label="Agente" value={shown(registro.responsavel_velorio_nome)} />
                        <DataRow label="Desde" value={shown(registro.responsavel_velorio_desde)} />
                    </Section>

                    <Section title="Materiais">
                        <DataRow
                            label="Selecionados"
                            value={
                                materiais.length
                                    ? materiais.map((m) => `${m.nome} (${m.qtd})`).join(" • ")
                                    : "Nenhum material selecionado"
                            }
                        />
                    </Section>

                    <Section title="Observações">
                        <DataRow label="Atendimento" value={shown(registro.observacao_atendimento, "Sem observação")} />
                        <DataRow label="Itens" value={shown(registro.observacao_itens, "Sem observação")} />
                        <DataRow label="Velório 1" value={shown(registro.observacao_velorio01, "Sem observação")} />
                        <DataRow label="Velório 2" value={shown(registro.observacao_velorio02, "Sem observação")} />
                        <DataRow label="Geral" value={shown((registro as any).observacao, "Sem observação")} />
                    </Section>

                    <Section title="Fotos operacionais">
                        <DataRow
                            label="Fim ornament."
                            value={registro.foto_fim_ornamentacao_em ? `${registro.foto_fim_ornamentacao_em} • ${shown(registro.foto_fim_ornamentacao_usuario)}` : "Não registrada"}
                        />
                        <DataRow
                            label="Entrega corpo"
                            value={registro.foto_entrega_corpo_em ? `${registro.foto_entrega_corpo_em} • ${shown(registro.foto_entrega_corpo_usuario)}` : "Não registrada"}
                        />
                    </Section>
                </div>
            )}

            <div className="my-4 h-px bg-slate-200" />

            <div>
                <h3 className="text-sm font-semibold">Editar atendimento</h3>
                {!online && (
                    <p className="mt-1 text-xs text-muted-foreground">
                        A consulta funciona offline. Edição e assinatura permanecem disponíveis somente com internet nesta versão.
                    </p>
                )}
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {(wizardStepTitles || []).map((t, i) => {
                        if (!t) return null;
                        return (
                            <button
                                key={`${t}-${i}`}
                                disabled={!online || infoIdx == null}
                                className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => {
                                    setOpen(false);
                                    if (infoIdx != null) abrirWizard("editar", infoIdx, i);
                                }}
                            >
                                {t}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="my-4 h-px bg-slate-200" />

            <div className="grid gap-2 sm:grid-cols-2">
                <button
                    disabled={!online || infoIdx == null}
                    className="w-full rounded-md bg-[#059de0] px-3 py-2 text-left text-sm text-white hover:bg-[#059de0]/90 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                        if (infoIdx != null) {
                            setOpen(false);
                            abrirAssinatura(infoIdx, "recebimento");
                        }
                    }}
                >
                    Termo de Recebimento de Material
                </button>

                <button
                    disabled={!online || infoIdx == null}
                    className="w-full rounded-md bg-[#059de0] px-3 py-2 text-left text-sm text-white hover:bg-[#059de0]/90 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                        if (infoIdx != null) {
                            setOpen(false);
                            abrirAssinatura(infoIdx, "requisicao");
                        }
                    }}
                >
                    Termo de Requisição de Veículo
                </button>

                {online && registro?.assinatura_recebimento_url && (
                    <a
                        className="w-full rounded-md bg-emerald-600 px-3 py-2 text-center text-sm text-white"
                        href={registro.assinatura_recebimento_url}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Baixar Termo de Recebimento
                    </a>
                )}

                {online && registro?.assinatura_requisicao_url && (
                    <a
                        className="w-full rounded-md bg-emerald-600 px-3 py-2 text-center text-sm text-white"
                        href={registro.assinatura_requisicao_url}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Baixar Termo de Requisição
                    </a>
                )}
            </div>
        </Modal>
    );
}
