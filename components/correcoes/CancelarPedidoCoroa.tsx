"use client";

import React, { useEffect, useState } from "react";
import { correcoesJson, dataHoraBR } from "./api";
import JanelaCorrecao, { Aviso, BTN_PERIGO, BTN_SECUNDARIO, CampoMotivo } from "./JanelaCorrecao";
import { ListaOSCancelar, usePodeCorrigir } from "./CorrecoesAtendimento";

/* Cancelar pedido de coroa avulso (09/10/2026) — só a Gestão.
   Coroa pedida dentro do atendimento não cancela aqui: retira-se no registro do atendimento. */
export function BotaoCancelarPedidoCoroa({
    pedidoId,
    atendimentoOrigemId,
    onFeito,
}: {
    pedidoId: number;
    atendimentoOrigemId?: number | null;
    onFeito?: (msg: string) => void;
}) {
    const pode = usePodeCorrigir();
    const [aberto, setAberto] = useState(false);
    if (!pode.gestao || !pedidoId) return null;

    if (atendimentoOrigemId && Number(atendimentoOrigemId) > 0) {
        return (
            <div className="rounded-lg border border-dashed border-[#C9D1DE] px-3 py-2 text-xs text-[#5B6478] dark:border-white/25 dark:text-[#AEB9CF]">
                Coroa do atendimento #{atendimentoOrigemId}: para cancelar, retire a coroa no registro do atendimento (a OS é refeita junto).
            </div>
        );
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setAberto(true)}
                className="inline-flex h-11 items-center justify-center rounded-xl border-[1.5px] border-[#B42318]/50 px-4 text-sm font-extrabold text-[#B42318] hover:bg-[#FDECEA] dark:border-[#FF9C92]/50 dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/10"
            >
                Cancelar pedido
            </button>
            {aberto ? (
                <JanelaCancelarCoroa
                    pedidoId={pedidoId}
                    onFechar={() => setAberto(false)}
                    onFeito={(m) => {
                        setAberto(false);
                        onFeito?.(m);
                    }}
                />
            ) : null}
        </>
    );
}

function JanelaCancelarCoroa({ pedidoId, onFechar, onFeito }: { pedidoId: number; onFechar: () => void; onFeito: (m: string) => void }) {
    const [previa, setPrevia] = useState<any>(null);
    const [erro, setErro] = useState("");
    const [motivo, setMotivo] = useState("");
    const [conferi, setConferi] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [feito, setFeito] = useState("");
    const [estornar, setEstornar] = useState<number[]>([]);

    useEffect(() => {
        correcoesJson({ previa_cancelar_coroa: 1, id: pedidoId })
            .then((r) => setPrevia(r.dados))
            .catch((e) => setErro(e?.message || "Não foi possível montar a prévia."));
    }, [pedidoId]);

    const confirmar = async () => {
        if (salvando) return;
        setSalvando(true);
        setErro("");
        try {
            const r = await correcoesJson(null, { acao: "cancelar_coroa", id: pedidoId, motivo: motivo.trim(), estornar_movimentos: estornar });
            setFeito(r.msg || "Pedido cancelado.");
        } catch (e: any) {
            setErro(e?.message || "Não foi possível cancelar.");
        } finally {
            setSalvando(false);
        }
    };

    return (
        <JanelaCorrecao
            titulo="Cancelar pedido de coroa"
            subtitulo={previa ? `Pedido #${pedidoId} · ${previa.falecido || previa.solicitante || ""}` : `Pedido #${pedidoId}`}
            onFechar={feito ? () => onFeito(feito) : onFechar}
            rodape={
                feito ? (
                    <button type="button" className={BTN_SECUNDARIO} onClick={() => onFeito(feito)}>
                        Fechar
                    </button>
                ) : (
                <>
                    <button type="button" className={BTN_SECUNDARIO} onClick={onFechar} disabled={salvando}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PERIGO} disabled={!previa || motivo.trim().length < 5 || !conferi || salvando} onClick={() => void confirmar()}>
                        {salvando ? "Cancelando…" : "Cancelar pedido"}
                    </button>
                </>
                )
            }
        >
            {feito ? <Aviso tom="ok">{feito}</Aviso> : null}
            {!feito && !previa && !erro ? <div className="py-6 text-center text-sm text-[#5B6478]">Montando a prévia…</div> : null}
            {previa && !feito ? (
                <>
                    <Aviso tom="erro">O cancelamento não tem desfazer. O pedido sai da Confecção e do Quadro.</Aviso>
                    {previa.online ? (
                        <div className="mt-3 text-[13px]">Pedido do site: não volta na próxima sincronização.</div>
                    ) : null}
                    <ListaOSCancelar os={previa.os || []} reembolso={Number(previa.reembolso_total) || 0} />
                    <SaidasDaCoroa
                        saidas={previa.saidas_candidatas || []}
                        marcadas={estornar}
                        onMudar={setEstornar}
                    />
                    <CampoMotivo valor={motivo} onMudar={setMotivo} exemplo="Ex.: cliente desistiu antes da confecção" />
                    <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold">
                        <input type="checkbox" className="size-5 accent-[#B42318]" checked={conferi} onChange={(e) => setConferi(e.target.checked)} />
                        Conferi e quero cancelar este pedido
                    </label>
                </>
            ) : null}
            {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        </JanelaCorrecao>
    );
}

/** Coroa artificial avulsa: a baixa é feita pelo produto no estoque. A Gestão marca qual saída volta. */
function SaidasDaCoroa({
    saidas,
    marcadas,
    onMudar,
}: {
    saidas: { movimento_id: number; produto: string; local: string; qtd: number; data: string; destino: string; observacao: string }[];
    marcadas: number[];
    onMudar: (ids: number[]) => void;
}) {
    if (!saidas.length) {
        return (
            <div className="mt-3 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                Nenhuma saída de estoque da coroa artificial deste pedido desde o dia do pedido. Coroa natural não mexe no estoque.
            </div>
        );
    }
    const alternar = (id: number) => onMudar(marcadas.includes(id) ? marcadas.filter((x) => x !== id) : [...marcadas, id]);
    return (
        <div className="mt-3 rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.12]">
            <div className="text-sm font-extrabold">A coroa já saiu do estoque?</div>
            <div className="mt-0.5 text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                Saídas do mesmo produto desde o dia do pedido. Marque só a que foi desta coroa: ela volta para o local de onde saiu.
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
                {saidas.map((m) => (
                    <li key={m.movimento_id}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 text-[13px] hover:bg-[#F6F8FB] dark:hover:bg-white/5">
                            <input type="checkbox" className="size-5 shrink-0 accent-[#313C55]" checked={marcadas.includes(m.movimento_id)} onChange={() => alternar(m.movimento_id)} />
                            <span className="min-w-0 flex-1">
                                <b>{m.produto}</b> · {m.qtd} · sai de {m.local}
                                <span className="block text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                                    {dataHoraBR(m.data)}
                                    {m.destino ? ` · ${m.destino}` : ""}
                                    {m.observacao ? ` · ${m.observacao}` : ""}
                                </span>
                            </span>
                        </label>
                    </li>
                ))}
            </ul>
        </div>
    );
}
