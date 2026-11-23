"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { brl, correcoesJson } from "./api";
import { usePodeCorrigir } from "./CorrecoesAtendimento";
import JanelaCorrecao, { Aviso, BTN_PRINCIPAL, BTN_SECUNDARIO, CampoMotivo, ListaEstornos, Rotulo } from "./JanelaCorrecao";

/* =====================================================================
   Correções do pedido de coroa (18/11/2026) — quem tem a permissão "Correções do atendimento".
   - Trocar modelo/frase: mesmo depois da Coroa Pronta. A coroa volta para Aguardando Confecção
     (precisa ser feita de novo, com foto nova). A OS troca o item; com a OS fechada, a diferença
     vai para o Financeiro (a devolver = reembolso pendente; a receber = anotado na OS).
   - Voltar uma etapa: Entregue → Coroa Pronta (a saída do estoque volta); Coroa Pronta → Aguardando Confecção.
   Coroa do atendimento: a troca é pelo atendimento (Correções › Corrigir itens).
   O servidor (correcoes.php) monta a prévia; nada é gravado até confirmar com o motivo.
   ===================================================================== */

type Modelo = { id: number; nome: string; valor: number; tipo: "natural" | "artificial"; saldo: { MEMORIAL: number; FUNERARIA: number } };
type ItemCoroa = {
    item_id: number;
    ordem: number;
    tipo_coroa: string;
    produto_id: number;
    modelo: string;
    frase: string;
    deposito: string;
    valor: number | null;
    etapa: string;
    etapa_rotulo: string;
    voltar_para: string | null;
    voltar_para_rotulo: string | null;
    estornos_ao_voltar: { produto: string; local: string; qtd: number }[];
    pode_trocar: boolean;
    os: { os_id: number; numero_os: string; status: string; aberta: boolean; prefeitura: boolean; valor_linha: number } | null;
};
type Previa = {
    pedido_id: number;
    falecido: string;
    solicitante: string;
    do_atendimento: boolean;
    atendimento_id: number | null;
    itens: ItemCoroa[];
    modelos: Modelo[];
};
type Modo = "escolher" | "trocar" | "voltar";

const CAMPO =
    "h-12 w-full rounded-xl border-[1.5px] border-[#C9D1DE] bg-white px-3 text-[15px] text-[#313C55] outline-none focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 dark:border-white/25 dark:bg-[#1C2334] dark:text-white";

export function BotaoCorrecoesPedidoCoroa({
    pedidoId,
    falecido,
    onFeito,
    className = "",
}: {
    pedidoId: number | null | undefined;
    falecido?: string;
    onFeito?: (msg: string) => void;
    className?: string;
}) {
    const pode = usePodeCorrigir();
    const [aberto, setAberto] = useState(false);
    if (!pode.gestao || !pedidoId) return null;
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
                Correções
            </button>
            {aberto ? (
                <JanelaCorrecoesCoroa
                    pedidoId={pedidoId}
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

function JanelaCorrecoesCoroa({ pedidoId, falecido, onFechar, onFeito }: { pedidoId: number; falecido?: string; onFechar: () => void; onFeito: (msg: string) => void }) {
    const [modo, setModo] = useState<Modo>("escolher");
    const [previa, setPrevia] = useState<Previa | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [feito, setFeito] = useState("");
    const [motivo, setMotivo] = useState("");

    const [itemId, setItemId] = useState<number | null>(null);
    const [tipo, setTipo] = useState<"natural" | "artificial">("natural");
    const [deposito, setDeposito] = useState<"" | "MEMORIAL" | "FUNERARIA">("");
    const [produtoId, setProdutoId] = useState<number>(0);
    const [frase, setFrase] = useState("");

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro("");
        try {
            const r = await correcoesJson({ previa_coroa: 1, id: pedidoId });
            setPrevia(r.dados as Previa);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar o pedido.");
        } finally {
            setCarregando(false);
        }
    }, [pedidoId]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const item = useMemo(() => previa?.itens.find((i) => i.item_id === itemId) ?? null, [previa, itemId]);

    const escolherItem = useCallback(
        (it: ItemCoroa | null) => {
            setItemId(it?.item_id ?? null);
            if (!it) return;
            const t = it.tipo_coroa === "artificial" ? "artificial" : "natural";
            setTipo(t);
            setDeposito(t === "artificial" && (it.deposito === "MEMORIAL" || it.deposito === "FUNERARIA") ? (it.deposito as "MEMORIAL" | "FUNERARIA") : "");
            setProdutoId(it.produto_id || 0);
            setFrase(it.frase || "");
        },
        [],
    );

    const abrir = (m: Modo) => {
        setModo(m);
        setErro("");
        setMotivo("");
        if (m === "escolher" || !previa) return;
        const lista = previa.itens.filter((i) => (m === "trocar" ? i.pode_trocar : !!i.voltar_para));
        escolherItem(lista.length === 1 ? lista[0] : null);
    };

    const modelosDoTipo = useMemo(() => {
        const ms = (previa?.modelos ?? []).filter((m) => m.tipo === tipo);
        if (tipo === "artificial") return deposito ? ms.filter((m) => (m.saldo?.[deposito] ?? 0) > 0 || m.id === item?.produto_id) : [];
        return ms;
    }, [previa, tipo, deposito, item]);

    const modeloNovo = previa?.modelos.find((m) => m.id === produtoId) ?? null;

    /** Diferença de valor na OS (prévia; o servidor confere ao salvar). */
    const diferenca = useMemo(() => {
        if (!item?.os || item.os.prefeitura || !modeloNovo || modeloNovo.id === item.produto_id) return 0;
        return Math.round((modeloNovo.valor - item.os.valor_linha) * 100) / 100;
    }, [item, modeloNovo]);

    const motivoOk = motivo.trim().length >= 5;
    const mudou =
        !!item &&
        (produtoId !== item.produto_id || frase.trim() !== (item.frase || "").trim() || (tipo === "artificial" ? deposito : "") !== (item.tipo_coroa === "artificial" ? item.deposito : ""));
    const trocaValida = !!item && produtoId > 0 && frase.trim() !== "" && (tipo === "natural" || !!deposito) && mudou && !!modeloNovo && modeloNovo.tipo === tipo;

    const confirmar = async () => {
        if (!item || salvando) return;
        setSalvando(true);
        setErro("");
        try {
            const r =
                modo === "trocar"
                    ? await correcoesJson(null, {
                          acao: "trocar_coroa",
                          id: pedidoId,
                          item_id: item.item_id,
                          produto_id: produtoId,
                          deposito_nome: tipo === "artificial" ? deposito : "",
                          frase: frase.trim(),
                          motivo: motivo.trim(),
                      })
                    : await correcoesJson(null, { acao: "voltar_coroa", id: pedidoId, item_id: item.item_id, motivo: motivo.trim() });
            setFeito(r.msg || "Correção feita.");
        } catch (e: any) {
            setErro(e?.message || "Não foi possível concluir.");
        } finally {
            setSalvando(false);
        }
    };

    const titulo = modo === "trocar" ? "Trocar modelo/frase" : modo === "voltar" ? "Voltar uma etapa" : "Correções";
    const subtitulo = falecido || previa?.falecido || `Pedido de coroa #${pedidoId}`;

    const rodape = feito ? (
        <button type="button" className={BTN_PRINCIPAL} onClick={() => onFeito(feito)}>
            Fechar
        </button>
    ) : modo === "escolher" ? null : (
        <>
            <button type="button" className={BTN_SECUNDARIO} onClick={() => abrir("escolher")} disabled={salvando}>
                Voltar
            </button>
            <button
                type="button"
                className={BTN_PRINCIPAL}
                disabled={!item || !motivoOk || salvando || (modo === "trocar" && !trocaValida)}
                onClick={() => void confirmar()}
            >
                {salvando ? "Salvando…" : modo === "trocar" ? "Trocar coroa" : "Voltar a etapa"}
            </button>
        </>
    );

    const listaItens = (previa?.itens ?? []).filter((i) => (modo === "trocar" ? i.pode_trocar : !!i.voltar_para));

    return (
        <JanelaCorrecao titulo={titulo} subtitulo={subtitulo} onFechar={feito ? () => onFeito(feito) : onFechar} rodape={rodape}>
            {feito ? (
                <Aviso tom="ok">{feito}</Aviso>
            ) : carregando ? (
                <div className="py-6 text-center text-sm text-[#5B6478] dark:text-[#AEB9CF]">Carregando o pedido…</div>
            ) : !previa ? (
                <Aviso tom="erro">{erro || "Pedido não encontrado."}</Aviso>
            ) : modo === "escolher" ? (
                <div className="flex flex-col gap-2.5">
                    <Opcao
                        titulo="Trocar modelo/frase"
                        texto={
                            previa.do_atendimento
                                ? "Esta coroa é do atendimento: a troca é feita no atendimento (Correções › Corrigir itens)."
                                : "Troca o modelo, o depósito ou a frase, mesmo depois da Coroa Pronta. A coroa volta para Aguardando Confecção; a OS é ajustada."
                        }
                        desligada={previa.do_atendimento || !previa.itens.some((i) => i.pode_trocar)}
                        onClick={() => abrir("trocar")}
                    />
                    <Opcao
                        titulo="Voltar uma etapa"
                        texto="Coroa Pronta → Aguardando Confecção. Entregue → Coroa Pronta (a saída do estoque volta)."
                        desligada={!previa.itens.some((i) => !!i.voltar_para)}
                        onClick={() => abrir("voltar")}
                    />
                    {!previa.do_atendimento && !previa.itens.some((i) => i.pode_trocar) ? (
                        <div className="mt-1 text-xs text-[#5B6478] dark:text-[#AEB9CF]">Coroa já entregue: volte a etapa antes de trocar.</div>
                    ) : null}
                </div>
            ) : (
                <>
                    {listaItens.length > 1 || !item ? (
                        <div className="mb-3">
                            <Rotulo>Qual coroa?</Rotulo>
                            <div className="flex flex-col gap-2">
                                {listaItens.map((it) => (
                                    <button
                                        key={it.item_id}
                                        type="button"
                                        onClick={() => escolherItem(it)}
                                        className={`flex min-h-12 items-center gap-3 rounded-xl border-[1.5px] px-3 py-2 text-left text-sm ${
                                            itemId === it.item_id ? "border-[#313C55] bg-[#EEF2F7] dark:border-white dark:bg-white/10" : "border-[#E3E8F0] dark:border-white/[0.12]"
                                        }`}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <b>Coroa {it.ordem}</b> · {it.modelo}
                                            <span className="block text-xs text-[#5B6478] dark:text-[#AEB9CF]">{it.etapa_rotulo}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {item && modo === "voltar" ? (
                        <>
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-[#F1F4F8] p-3 text-center dark:bg-[#1C2334]">
                                <div>
                                    <Rotulo>Agora</Rotulo>
                                    <div className="text-sm font-extrabold">{item.etapa_rotulo}</div>
                                </div>
                                <svg viewBox="0 0 24 24" className="size-5 text-[#5B6478]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                                    <path d="M5 12h14M13 6l6 6-6 6" />
                                </svg>
                                <div>
                                    <Rotulo>Volta para</Rotulo>
                                    <div className="text-sm font-extrabold">{item.voltar_para_rotulo}</div>
                                </div>
                            </div>
                            {item.voltar_para === "novo" ? (
                                <Aviso tom="atencao">A coroa volta para a fila de Confecção e vai pedir foto nova na Coroa Pronta.</Aviso>
                            ) : null}
                            <ListaEstornos itens={item.estornos_ao_voltar} />
                            <CampoMotivo valor={motivo} onMudar={setMotivo} exemplo="Ex.: Coroa Pronta registrada na coroa errada." />
                        </>
                    ) : null}

                    {item && modo === "trocar" ? (
                        <>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div className="rounded-xl border border-dashed border-[#C9D1DE] bg-[#F1F4F8] p-3 text-sm dark:border-white/20 dark:bg-[#1C2334]">
                                    <Rotulo>Antes (lançado)</Rotulo>
                                    <div className="font-extrabold">{item.modelo}</div>
                                    <div className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                                        {item.tipo_coroa === "artificial" ? `Artificial · ${item.deposito || "—"}` : "Natural"} · {item.etapa_rotulo}
                                    </div>
                                    <div className="mt-1 text-xs italic">“{item.frase}”</div>
                                </div>
                                <div className="rounded-xl border border-[#7BA11A] bg-[#EEF5D6] p-3 text-sm dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/20">
                                    <Rotulo>Depois (correção)</Rotulo>
                                    <div className="font-extrabold">{modeloNovo?.nome || "Escolha o modelo"}</div>
                                    <div className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                                        {tipo === "artificial" ? `Artificial · ${deposito || "escolha o depósito"}` : "Natural"}
                                    </div>
                                    <div className="mt-1 text-xs italic">“{frase.trim() || "…"}”</div>
                                </div>
                            </div>

                            <div className="mt-4">
                                <Rotulo>Tipo</Rotulo>
                                <div className="grid grid-cols-2 gap-2">
                                    {(["natural", "artificial"] as const).map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => {
                                                setTipo(t);
                                                setProdutoId(0);
                                                if (t === "natural") setDeposito("");
                                            }}
                                            className={`h-11 rounded-xl border-[1.5px] text-sm font-bold ${tipo === t ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]" : "border-[#C9D1DE] dark:border-white/25"}`}
                                        >
                                            {t === "natural" ? "Natural" : "Artificial"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {tipo === "artificial" ? (
                                <div className="mt-3">
                                    <Rotulo>Depósito</Rotulo>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(["MEMORIAL", "FUNERARIA"] as const).map((d) => (
                                            <button
                                                key={d}
                                                type="button"
                                                onClick={() => {
                                                    setDeposito(d);
                                                    const atual = previa.modelos.find((m) => m.id === produtoId);
                                                    if (atual && (atual.saldo?.[d] ?? 0) <= 0) setProdutoId(0);
                                                }}
                                                className={`h-11 rounded-xl border-[1.5px] text-sm font-bold ${deposito === d ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]" : "border-[#C9D1DE] dark:border-white/25"}`}
                                            >
                                                {d === "MEMORIAL" ? "Memorial" : "Funerária"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            <label className="mt-3 block">
                                <Rotulo>Modelo</Rotulo>
                                <select
                                    value={produtoId || ""}
                                    onChange={(e) => setProdutoId(Number(e.target.value) || 0)}
                                    className={CAMPO}
                                    disabled={tipo === "artificial" && !deposito}
                                >
                                    <option value="">{tipo === "artificial" && !deposito ? "Escolha o depósito primeiro" : "Escolha o modelo"}</option>
                                    {modelosDoTipo.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {m.nome}
                                            {m.valor > 0 ? ` · ${brl(m.valor)}` : ""}
                                            {tipo === "artificial" && deposito ? ` · saldo ${m.saldo?.[deposito] ?? 0}` : ""}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="mt-3 block">
                                <Rotulo>Frase da faixa</Rotulo>
                                <textarea value={frase} onChange={(e) => setFrase(e.target.value)} rows={2} maxLength={250} className={`${CAMPO} h-auto py-2.5`} />
                            </label>

                            {item.etapa !== "novo" && (produtoId !== item.produto_id || frase.trim() !== item.frase.trim()) ? (
                                <Aviso tom="atencao">A coroa volta para Aguardando Confecção: precisa ser feita de novo e pede foto nova na Coroa Pronta.</Aviso>
                            ) : null}

                            {item.os && modeloNovo && modeloNovo.id !== item.produto_id ? (
                                item.os.prefeitura ? (
                                    <Aviso tom="atencao">
                                        OS {item.os.numero_os} (Prefeitura): as OS do pedido são refeitas com o modelo novo, com número novo. Modelo fora do pacote gera a diferença
                                        para a família; dentro do pacote, a diferença sai. Se alguma OS estiver fechada, reabra no Financeiro antes.
                                    </Aviso>
                                ) : item.os.aberta ? (
                                    <Aviso tom="atencao">
                                        OS {item.os.numero_os} (aberta): a coroa passa de {brl(item.os.valor_linha)} para {brl(modeloNovo.valor)}
                                        {diferenca !== 0 ? ` (diferença ${brl(diferenca)})` : ""}.
                                    </Aviso>
                                ) : diferenca < 0 ? (
                                    <Aviso tom="atencao">
                                        OS {item.os.numero_os} já fechada: a devolver à família {brl(-diferenca)} (fica como reembolso pendente no Financeiro).
                                    </Aviso>
                                ) : diferenca > 0 ? (
                                    <Aviso tom="atencao">
                                        OS {item.os.numero_os} já fechada: a receber da família {brl(diferenca)} (fica anotado na OS para o Financeiro cobrar).
                                    </Aviso>
                                ) : (
                                    <Aviso tom="atencao">OS {item.os.numero_os}: o item é trocado; o valor não muda.</Aviso>
                                )
                            ) : null}

                            <CampoMotivo valor={motivo} onMudar={setMotivo} exemplo="Ex.: cliente pediu para trocar pelo modelo 12 depois da coroa pronta." />
                        </>
                    ) : null}
                </>
            )}
            {erro && previa && !feito ? <Aviso tom="erro">{erro}</Aviso> : null}
        </JanelaCorrecao>
    );
}

function Opcao({ titulo, texto, desligada, onClick }: { titulo: string; texto: string; desligada?: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={desligada}
            className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl border border-[#E3E8F0] bg-white px-4 py-3 text-left hover:bg-[#F6F8FB] disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/[0.12] dark:bg-[#1C2334] dark:hover:bg-white/5"
        >
            <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold">{titulo}</span>
                <span className="mt-0.5 block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{texto}</span>
            </span>
            <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-[#5B6478]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
            </svg>
        </button>
    );
}
