"use client";

import React, { useCallback, useEffect, useState } from "react";
import { brl, consultarPodeCorrigir, correcoesJson, dataHoraBR } from "./api";
import JanelaCorrecao, { Aviso, BTN_PERIGO, BTN_PRINCIPAL, BTN_SECUNDARIO, CampoMotivo, ListaEstornos, Rotulo } from "./JanelaCorrecao";

/* =====================================================================
   Correções do atendimento (09/10/2026) — só a Gestão vê.
   - Voltar uma etapa: desfaz a última etapa registrada (um passo por vez). Do Corpo Pronto para o
     Fim da Ornamentação toda a baixa volta para o estoque.
   - Cancelar atendimento: estorna estoque e recebimentos, cancela as OS e os pedidos de coroa do
     atendimento. Não tem desfazer.
   O servidor (correcoes.php) monta a prévia; nada é gravado até confirmar com o motivo.
   ===================================================================== */

export function usePodeCorrigir() {
    const [pode, setPode] = useState({ gestao: false, reembolso: false });
    useEffect(() => {
        let vivo = true;
        void consultarPodeCorrigir().then((p) => vivo && setPode(p));
        return () => {
            vivo = false;
        };
    }, []);
    return pode;
}

type OSPrevia = {
    os_id: number;
    numero_os: string;
    status: string;
    valor_total: number;
    recebido: number;
    recebimentos: { id: number; valor: number; forma: string; data: string }[];
    aguardando_assinatura: boolean;
};

/** OS que serão canceladas, com os recebimentos que serão estornados (usado também no cancelamento da coroa). */
export function ListaOSCancelar({ os, reembolso }: { os: OSPrevia[]; reembolso: number }) {
    if (!os?.length) {
        return <div className="mt-3 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Nenhuma OS para cancelar.</div>;
    }
    return (
        <div className="mt-3 rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.12]">
            <div className="text-sm font-extrabold">OS que serão canceladas</div>
            <ul className="mt-1.5 flex flex-col gap-2">
                {os.map((o) => (
                    <li key={o.os_id} className="text-[13px]">
                        <div className="flex items-baseline gap-3">
                            <b className="min-w-0 flex-1">{o.numero_os}</b>
                            <span className="shrink-0 font-bold">{brl(o.valor_total)}</span>
                        </div>
                        {o.recebimentos.length ? (
                            <div className="mt-0.5 text-xs font-semibold text-[#5B6478] dark:text-[#AEB9CF]">
                                Estorna: {o.recebimentos.map((r) => `${brl(r.valor)} (${r.forma.replace("_", " ").toLowerCase()})`).join(" · ")}
                            </div>
                        ) : (
                            <div className="mt-0.5 text-xs text-[#5B6478] dark:text-[#AEB9CF]">Sem recebimento lançado.</div>
                        )}
                        {o.aguardando_assinatura ? <div className="mt-0.5 text-xs font-semibold">O envelope de assinatura em andamento é cancelado.</div> : null}
                    </li>
                ))}
            </ul>
            {reembolso > 0 ? (
                <Aviso tom="atencao">
                    Reembolso ao cliente: <b>{brl(reembolso)}</b>. Fica pendente no Financeiro até ser devolvido (no site, na operadora do cartão ou em mãos).
                </Aviso>
            ) : null}
        </div>
    );
}

type Modo = "escolher" | "voltar" | "cancelar";

/** Botão "Correções da Gestão" (Registrar ação). Só aparece para quem tem a página Gestão. */
export function BotaoCorrecoesAtendimento({
    id,
    falecido,
    onFeito,
    className = "",
}: {
    id: string | number | null | undefined;
    falecido?: string;
    onFeito?: (msg: string) => void;
    className?: string;
}) {
    const pode = usePodeCorrigir();
    const [aberto, setAberto] = useState(false);
    if (!pode.gestao || id == null || String(id).startsWith("local")) return null;
    return (
        <>
            <button
                type="button"
                onClick={() => setAberto(true)}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-[#C9D1DE] px-3 text-sm font-extrabold text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/25 dark:text-white dark:hover:bg-white/10 ${className}`}
            >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5" />
                </svg>
                Correções da Gestão
            </button>
            {aberto ? (
                <JanelaCorrecoes
                    id={String(id)}
                    falecido={falecido}
                    onFechar={() => setAberto(false)}
                    onFeito={(msg) => {
                        setAberto(false);
                        onFeito?.(msg);
                    }}
                />
            ) : null}
        </>
    );
}

function JanelaCorrecoes({ id, falecido, onFechar, onFeito }: { id: string; falecido?: string; onFechar: () => void; onFeito: (msg: string) => void }) {
    const [modo, setModo] = useState<Modo>("escolher");
    const [previa, setPrevia] = useState<any>(null);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState("");
    const [motivo, setMotivo] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [confirmaCancelar, setConfirmaCancelar] = useState(false);
    const [feito, setFeito] = useState("");

    const abrir = useCallback(
        async (m: Modo) => {
            setModo(m);
            setErro("");
            setPrevia(null);
            setMotivo("");
            setConfirmaCancelar(false);
            if (m === "escolher") return;
            setCarregando(true);
            try {
                const r = await correcoesJson({ [m === "voltar" ? "previa_voltar" : "previa_cancelar"]: 1, id });
                setPrevia(r.dados);
            } catch (e: any) {
                setErro(e?.message || "Não foi possível montar a prévia.");
            } finally {
                setCarregando(false);
            }
        },
        [id],
    );

    const confirmar = async () => {
        if (salvando || !previa) return;
        setSalvando(true);
        setErro("");
        try {
            const r =
                modo === "voltar"
                    ? await correcoesJson(null, { acao: "voltar_etapa", id: Number(id), etapa_atual: previa.etapa_atual, motivo: motivo.trim() })
                    : await correcoesJson(null, { acao: "cancelar_atendimento", id: Number(id), motivo: motivo.trim() });
            setFeito(r.msg || "Correção feita.");
        } catch (e: any) {
            setErro(e?.message || "Não foi possível concluir.");
        } finally {
            setSalvando(false);
        }
    };

    const motivoOk = motivo.trim().length >= 5;
    const titulo = modo === "voltar" ? "Voltar uma etapa" : modo === "cancelar" ? "Cancelar atendimento" : "Correções da Gestão";

    const rodape = feito ? (
        <button type="button" className={BTN_PRINCIPAL} onClick={() => onFeito(feito)}>
            Fechar
        </button>
    ) : modo === "escolher" ? null : (
            <>
                <button type="button" className={BTN_SECUNDARIO} onClick={() => void abrir("escolher")} disabled={salvando}>
                    Voltar
                </button>
                {modo === "voltar" ? (
                    <button type="button" className={BTN_PRINCIPAL} disabled={!previa || !motivoOk || salvando} onClick={() => void confirmar()}>
                        {salvando ? "Voltando…" : "Voltar a etapa"}
                    </button>
                ) : (
                    <button type="button" className={BTN_PERIGO} disabled={!previa || !motivoOk || !confirmaCancelar || salvando} onClick={() => void confirmar()}>
                        {salvando ? "Cancelando…" : "Cancelar atendimento"}
                    </button>
                )}
            </>
        );

    return (
        <JanelaCorrecao titulo={titulo} subtitulo={falecido || previa?.falecido || `Atendimento #${id}`} onFechar={feito ? () => onFeito(feito) : onFechar} rodape={rodape}>
            {feito ? (
                <Aviso tom="ok">{feito}</Aviso>
            ) : modo === "escolher" ? (
                <div className="flex flex-col gap-2.5">
                    <OpcaoCorrecao
                        titulo="Voltar uma etapa"
                        texto="Desfaz a última etapa registrada (comando errado). Voltando do Corpo Pronto, a baixa volta para o estoque e os itens destravam."
                        onClick={() => void abrir("voltar")}
                    />
                    <OpcaoCorrecao
                        titulo="Cancelar atendimento"
                        texto="Lançamento errado ou duplicado. Cancela as OS, estorna recebimentos e estoque. Não tem desfazer."
                        perigo
                        onClick={() => void abrir("cancelar")}
                    />
                    <div className="mt-1 text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                        Item ou local errado depois do Corpo Pronto: corrija no Editar registro. O estoque é acertado ao salvar.
                    </div>
                </div>
            ) : carregando ? (
                <div className="py-6 text-center text-sm text-[#5B6478] dark:text-[#AEB9CF]">Montando a prévia…</div>
            ) : previa && modo === "voltar" ? (
                <>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-[#F1F4F8] p-3 text-center dark:bg-[#1C2334]">
                        <div>
                            <Rotulo>Agora</Rotulo>
                            <div className="text-sm font-extrabold">{previa.etapa_atual_rotulo}</div>
                        </div>
                        <svg viewBox="0 0 24 24" className="size-5 text-[#5B6478]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                        <div>
                            <Rotulo>Volta para</Rotulo>
                            <div className="text-sm font-extrabold">{previa.etapa_destino_rotulo}</div>
                        </div>
                    </div>
                    <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-[13px]">
                        {(previa.efeitos || []).map((t: string, i: number) => (
                            <li key={i}>{t}</li>
                        ))}
                    </ul>
                    <ListaEstornos itens={previa.estornos || []} />
                    <CampoMotivo valor={motivo} onMudar={setMotivo} exemplo="Ex.: agente registrou Corpo Pronto antes da hora" />
                </>
            ) : previa && modo === "cancelar" ? (
                <>
                    <Aviso tom="erro">O cancelamento não tem desfazer. Se for preciso, abre-se outro atendimento.</Aviso>
                    <div className="mt-3 text-[13px]">
                        Situação atual: <b>{previa.etapa_atual_rotulo}</b>. O atendimento sai da lista, do Quadro e dos relatórios e fica em “Cancelados”.
                    </div>
                    <ListaOSCancelar os={previa.os || []} reembolso={Number(previa.reembolso_total) || 0} />
                    <ListaEstornos itens={previa.estornos || []} />
                    {previa.coroas?.length ? (
                        <div className="mt-3 text-[13px]">
                            {previa.coroas.length === 1 ? "O pedido de coroa deste atendimento é cancelado." : `${previa.coroas.length} pedidos de coroa deste atendimento são cancelados.`}
                        </div>
                    ) : null}
                    <CampoMotivo valor={motivo} onMudar={setMotivo} exemplo="Ex.: atendimento lançado em duplicidade (o certo é o #1130)" />
                    <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold">
                        <input type="checkbox" className="size-5 accent-[#B42318]" checked={confirmaCancelar} onChange={(e) => setConfirmaCancelar(e.target.checked)} />
                        Conferi e quero cancelar este atendimento
                    </label>
                </>
            ) : null}
            {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        </JanelaCorrecao>
    );
}

function OpcaoCorrecao({ titulo, texto, perigo, onClick }: { titulo: string; texto: string; perigo?: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl border border-[#E3E8F0] bg-white px-4 py-3 text-left hover:bg-[#F6F8FB] dark:border-white/[0.12] dark:bg-[#1C2334] dark:hover:bg-white/5"
        >
            <span className="min-w-0 flex-1">
                <span className={`block text-[15px] font-extrabold ${perigo ? "text-[#B42318] dark:text-[#FF9C92]" : ""}`}>{titulo}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[#5B6478] dark:text-[#AEB9CF]">{texto}</span>
            </span>
            <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-[#5B6478]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
            </svg>
        </button>
    );
}

/** Botão "Cancelados" (topo da lista de Atendimentos): consulta dos atendimentos cancelados. Só Gestão. */
export function BotaoAtendimentosCancelados() {
    const pode = usePodeCorrigir();
    const [aberto, setAberto] = useState(false);
    const [lista, setLista] = useState<any[] | null>(null);
    const [erro, setErro] = useState("");

    useEffect(() => {
        if (!aberto) return;
        setLista(null);
        setErro("");
        correcoesJson({ cancelados: 1 })
            .then((r) => setLista(r.dados || []))
            .catch((e) => setErro(e?.message || "Não foi possível carregar."));
    }, [aberto]);

    if (!pode.gestao) return null;
    return (
        <>
            <button
                type="button"
                onClick={() => setAberto(true)}
                className="flex h-12 shrink-0 items-center rounded-[14px] border-[1.5px] border-[#C9D1DE] px-4 text-sm font-bold whitespace-nowrap text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/25 dark:text-white dark:hover:bg-white/10"
            >
                Cancelados
            </button>
            {aberto ? (
                <JanelaCorrecao
                    titulo="Atendimentos cancelados"
                    subtitulo="Últimos 200 · consulta (o cancelamento não tem desfazer)"
                    onFechar={() => setAberto(false)}
                    rodape={
                        <button type="button" className={BTN_SECUNDARIO} onClick={() => setAberto(false)}>
                            Fechar
                        </button>
                    }
                >
                    {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
                    {lista === null && !erro ? <div className="py-6 text-center text-sm text-[#5B6478]">Carregando…</div> : null}
                    {lista && lista.length === 0 ? <div className="py-6 text-center text-sm text-[#5B6478] dark:text-[#AEB9CF]">Nenhum atendimento cancelado.</div> : null}
                    <ul className="flex flex-col divide-y divide-[#E3E8F0] dark:divide-white/[0.12]">
                        {(lista || []).map((a) => (
                            <li key={a.id} className="py-2.5 text-[13px]">
                                <div className="flex items-baseline gap-2">
                                    <b className="min-w-0 flex-1 text-sm">{a.falecido || "—"}</b>
                                    <span className="shrink-0 text-xs text-[#5B6478] dark:text-[#AEB9CF]">#{a.id}</span>
                                </div>
                                <div className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                                    {dataHoraBR(a.cancelado_em)} · {a.cancelado_por_nome || "—"} · estava em {a.etapa_rotulo}
                                    {a.convenio ? ` · ${a.convenio}` : ""}
                                </div>
                                {a.motivo_cancelamento ? <div className="mt-0.5">{a.motivo_cancelamento}</div> : null}
                            </li>
                        ))}
                    </ul>
                </JanelaCorrecao>
            ) : null}
        </>
    );
}
