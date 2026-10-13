"use client";

/* Orçamento aberto: folha calculada e as ações (folha na tela com PDF e Imprimir, editar, virar atendimento, cancelar). */

import React, { useEffect, useState } from "react";
import { cancelarOrcamento, lerOrcamento } from "./api";
import FolhaOrcamento from "./FolhaOrcamento";
import ResumoOrcamento from "./ResumoOrcamento";
import { dataBR, rascunhoDoServidor, type Orcamento } from "./tipos";
import { Aviso, BTN_PERIGO, BTN_PRI, BTN_SEC, CAMPO, Campo, EtiquetaSituacao, Ic, Icone, Janela, MUTED } from "./ui";

/** Endereço do Novo registro preenchido com o orçamento (Atendimento). */
export const urlVirarAtendimento = (id: number) => `/acompanhamento?orcamento=${id}`;

export default function DetalheOrcamento({ id, onFechar, onEditar, onAlterou }: {
    id: number;
    onFechar: () => void;
    onEditar: (o: Orcamento) => void;
    onAlterou: (msg: string) => void;
}) {
    const [o, setO] = useState<Orcamento | null>(null);
    const [erro, setErro] = useState("");
    const [cancelar, setCancelar] = useState(false);
    const [folha, setFolha] = useState(false);

    useEffect(() => {
        let vivo = true;
        lerOrcamento(id)
            .then((d) => vivo && setO(d))
            .catch((e) => vivo && setErro(e?.message || "Não foi possível abrir o orçamento."));
        return () => {
            vivo = false;
        };
    }, [id]);

    const aberto = o && (o.situacao === "ABERTO" || o.situacao === "VENCIDO");

    return (
        <Janela
            titulo={o ? `Orçamento ${o.numero}` : "Orçamento"}
            subtitulo={o ? `${o.falecido} · ${o.contato} · ${o.telefone}` : undefined}
            onFechar={onFechar}
            largura="max-w-2xl"
            rodape={
                o ? (
                    <>
                        <button type="button" className={BTN_SEC} onClick={() => setFolha(true)}>
                            <Icone d={Ic.folha} />
                            Folha / PDF
                        </button>
                        {aberto ? (
                            <button type="button" className={BTN_SEC} onClick={() => onEditar(o)}>
                                <Icone d={Ic.editar} />
                                Editar
                            </button>
                        ) : null}
                        {aberto ? (
                            <a className={BTN_PRI} href={urlVirarAtendimento(o.id)}>
                                Virar atendimento
                                <Icone d={Ic.seta} />
                            </a>
                        ) : null}
                        {o.situacao === "CONVERTIDO" && o.atendimento_id ? (
                            <a className={BTN_PRI} href={`/acompanhamento?editar=${o.atendimento_id}`}>
                                Ver atendimento #{o.atendimento_id}
                            </a>
                        ) : null}
                    </>
                ) : undefined
            }
        >
            {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
            {!o && !erro ? <p className={`py-6 text-center text-sm ${MUTED}`}>Carregando…</p> : null}
            {o ? (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <EtiquetaSituacao s={o.situacao} />
                        <span className={MUTED}>
                            Feito em {dataBR(o.criado_em)} por {o.criado_por_nome || "—"} · válido até <b>{dataBR(o.validade)}</b>
                        </span>
                    </div>
                    {o.situacao === "VENCIDO" ? (
                        <Aviso>Validade vencida: ao editar e salvar, a folha é refeita com os preços de hoje e ganha nova validade.</Aviso>
                    ) : null}
                    {o.situacao === "CANCELADO" ? (
                        <Aviso tom="erro">
                            Cancelado em {dataBR(o.cancelado_em)} por {o.cancelado_por_nome || "—"}. Motivo: {o.motivo_cancelamento || "—"}
                        </Aviso>
                    ) : null}
                    {o.situacao === "CONVERTIDO" ? (
                        <Aviso tom="ok">Virou o atendimento #{o.atendimento_id} em {dataBR(o.convertido_em)}. Os valores tratados no orçamento foram para a OS do atendimento.</Aviso>
                    ) : null}
                    {aberto ? (
                        <p className={`text-xs ${MUTED}`}>
                            Virar atendimento abre o Novo registro já preenchido com o falecido, o contato e os itens. Ao salvar, os valores tratados aqui (acréscimos e descontos) vão para a OS; depois, desconto a mais só a Gestão.
                        </p>
                    ) : null}
                    <ResumoOrcamento linhas={o.linhas} total={o.valor_total} descontoGeral={rascunhoDoServidor(o.rascunho).desconto_geral} titulo="Folha do orçamento" />
                    {o.observacao ? (
                        <p className="text-sm">
                            <b>Observação:</b> {o.observacao}
                        </p>
                    ) : null}
                    {aberto ? (
                        <button type="button" className={`${BTN_PERIGO} self-start`} onClick={() => setCancelar(true)}>
                            Cancelar orçamento
                        </button>
                    ) : null}
                </div>
            ) : null}

            {folha && o ? <FolhaOrcamento id={o.id} numero={o.numero} onFechar={() => setFolha(false)} /> : null}

            {cancelar && o ? (
                <JanelaCancelar
                    numero={o.numero}
                    onFechar={() => setCancelar(false)}
                    onConfirmar={async (motivo) => {
                        const r = await cancelarOrcamento(o.id, motivo);
                        setCancelar(false);
                        onAlterou(r.msg || "Orçamento cancelado.");
                    }}
                />
            ) : null}
        </Janela>
    );
}

function JanelaCancelar({ numero, onFechar, onConfirmar }: { numero: string; onFechar: () => void; onConfirmar: (motivo: string) => Promise<void> }) {
    const [motivo, setMotivo] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");
    return (
        <Janela
            titulo={`Cancelar ${numero}`}
            subtitulo="O orçamento fica na lista como cancelado."
            onFechar={onFechar}
            largura="max-w-md"
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar} disabled={salvando}>
                        Voltar
                    </button>
                    <button
                        type="button"
                        className={BTN_PERIGO}
                        disabled={salvando || motivo.trim().length < 5}
                        onClick={async () => {
                            setSalvando(true);
                            setErro("");
                            try {
                                await onConfirmar(motivo.trim());
                            } catch (e: any) {
                                setErro(e?.message || "Não foi possível cancelar.");
                                setSalvando(false);
                            }
                        }}
                    >
                        {salvando ? "Cancelando…" : "Cancelar orçamento"}
                    </button>
                </>
            }
        >
            <Campo rotulo="Motivo *">
                <textarea className={`${CAMPO} h-auto min-h-[96px] py-3`} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: família fechou com outra empresa" maxLength={255} />
            </Campo>
            {erro ? (
                <div className="mt-3">
                    <Aviso tom="erro">{erro}</Aviso>
                </div>
            ) : null}
        </Janela>
    );
}
