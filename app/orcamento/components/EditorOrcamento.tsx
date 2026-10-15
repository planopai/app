"use client";

/*
 * Formulário do orçamento (13/10/2026): poucos dados (falecido, contato, telefone) e os itens.
 * A folha é calculada pelo servidor com as mesmas regras da prévia da OS do registro, sempre como Particular.
 * Velório e sepultamento não são pedidos; só a sala do Memorial, que entra na parte financeira.
 * Ajuste de valores (14/10/2026): ícone em cada item e no desconto geral do resumo, com as regras da OS (AjusteValor.tsx).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { JanelaAjusteItem, JanelaDescontoGeral } from "./AjusteValor";
import { calcularPrevia, salvarOrcamento } from "./api";
import EscolhaProduto from "./EscolhaProduto";
import ResumoOrcamento from "./ResumoOrcamento";
import { FORMAS_PAGAMENTO, FORMA_CREDITO, PARCELAS_MAX, RASCUNHO_VAZIO, brl, dataBR, pagamentoDoTexto, rascunhoDoServidor, textoPagamento, type Pagamento, rascunhoParaServidor, type CoroaOrc, type Linha as LinhaFolha, type Opcoes, type Orcamento, type Previa, type Rascunho, type SimNao } from "./tipos";
import { Aviso, BTN_PRI, BTN_SEC, CAMPO, CARTAO, Campo, EscolhaSimNao, Ic, Icone, Janela, MUTED, Opcoes as BotoesOpcoes, ROTULO, mascaraTelefone } from "./ui";

const LOCAIS_URNA = ["MEMORIAL", "FUNERARIA"];
const LOCAIS_ROUPA = ["ARMARIO SANDRO", "ARMARIO ILDO", "FUNERARIA"];
const LOCAIS_INVOL = ["ARMARIO SANDRO", "ARMARIO ILDO"];

export default function EditorOrcamento({ inicial, opcoes, onSalvo, onVoltar }: {
    inicial: Orcamento | null;
    opcoes: Opcoes | null;
    onSalvo: (o: Orcamento, msg: string) => void;
    onVoltar: () => void;
}) {
    const camposExtras = useMemo(() => (opcoes?.sim_nao || []).map((s) => s.campo), [opcoes]);
    const [falecido, setFalecido] = useState(inicial?.falecido || "");
    const [contato, setContato] = useState(inicial?.contato || "");
    const [telefone, setTelefone] = useState(inicial?.telefone || "");
    const [observacao, setObservacao] = useState(inicial?.observacao || "");
    const [pagamento, setPagamento] = useState<Pagamento>(() => pagamentoDoTexto(inicial?.forma_pagamento, inicial?.pagamento_obs));
    const credito = pagamento.formas.includes(FORMA_CREDITO);
    const parcelasOk = !credito || (Number(pagamento.parcelas) >= 1 && Number(pagamento.parcelas) <= PARCELAS_MAX);
    const [r, setR] = useState<Rascunho>(() => (inicial ? rascunhoDoServidor(inicial.rascunho, camposExtras) : RASCUNHO_VAZIO));
    const [previa, setPrevia] = useState<Previa | null>(null);
    const [calculando, setCalculando] = useState(false);
    const [erroCalculo, setErroCalculo] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");
    const topoRef = useRef<HTMLDivElement>(null);
    const [ajusteItem, setAjusteItem] = useState<LinhaFolha | null>(null);
    const [ajusteGeral, setAjusteGeral] = useState(false);
    const aplicarAjuste = (novo: Rascunho, p: Previa) => {
        setR(novo);
        setPrevia(p);
        setAjusteItem(null);
        setAjusteGeral(false);
    };

    const mudar = (p: Partial<Rascunho>) => setR((a) => ({ ...a, ...p }));
    // Sim | Não das perguntas que não têm campo próprio no rascunho (urna, roupa, velório no Memorial, coroa): vêm do que foi escolhido
    const [uso, setUso] = useState<Record<"urna" | "roupa" | "velorio" | "coroas", SimNao | "">>(() =>
        inicial
            ? { urna: r.urna ? "Sim" : "Não", roupa: r.roupa || r.roupa_propria ? "Sim" : "Não", velorio: r.sala_velorio ? "Sim" : "Não", coroas: r.coroas.length ? "Sim" : "Não" }
            : { urna: "", roupa: "", velorio: "", coroas: "" },
    );
    const procedimentos = useMemo(() => ordenarProcedimentos(opcoes?.tanato_modelos || []), [opcoes]);
    const extra = (campo: string): SimNao => r.extras[campo] || "Não";

    // Folha em tempo real (o servidor calcula; nada é gravado)
    const corpo = useMemo(() => JSON.stringify(rascunhoParaServidor(r)), [r]);
    useEffect(() => {
        let vivo = true;
        const t = window.setTimeout(async () => {
            setCalculando(true);
            setErroCalculo("");
            try {
                const p = await calcularPrevia(JSON.parse(corpo));
                if (vivo) setPrevia(p);
            } catch (e: any) {
                if (vivo) setErroCalculo(e?.message || "Não foi possível calcular.");
            } finally {
                if (vivo) setCalculando(false);
            }
        }, 450);
        return () => {
            vivo = false;
            window.clearTimeout(t);
        };
    }, [corpo]);

    const precoDe = (chave: string): number | null | undefined => {
        const l = previa?.linhas.find((x) => x.chave === chave);
        return l ? (l.final ?? l.valor) : undefined;
    };

    const faltando = [
        !falecido.trim() && "nome do falecido",
        !contato.trim() && "nome do contato",
        telefone.replace(/\D+/g, "").length < 10 && "telefone com DDD",
        (Object.entries({ urna: "Urna", roupa: "Roupa", velorio: "Velório no Memorial", coroas: "Coroa de flores" }) as [keyof typeof uso, string][])
            .filter(([k]) => uso[k] === "")
            .map(([, n]) => n)
            .join(", ")
            .replace(/^(.+)$/, "Sim ou Não em: $1"),
        uso.urna === "Sim" && !r.urna && "a urna",
        uso.roupa === "Sim" && !r.roupa_propria && !r.roupa && "a roupa",
        r.tanato === "Sim" && procedimentos.length > 0 && !r.tanato_produto_id && "o tipo de procedimento",
        uso.velorio === "Sim" && !r.sala_velorio && "a sala do velório",
        uso.coroas === "Sim" && r.coroas.some((c) => !c.produto_id) && "o modelo da coroa",
        !(previa?.linhas.length) && "pelo menos um item",
        !pagamento.formas.length && "a forma de pagamento combinada",
        !parcelasOk && `as parcelas do cartão de crédito (1 a ${PARCELAS_MAX})`,
    ].filter(Boolean) as string[];

    const salvar = async () => {
        if (salvando) return;
        if (faltando.length) {
            setErro(`Falta: ${faltando.join(", ")}.`);
            topoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        setSalvando(true);
        setErro("");
        try {
            const { dados, msg } = await salvarOrcamento({
                id: inicial?.id,
                falecido: falecido.trim(),
                contato: contato.trim(),
                telefone: telefone.trim(),
                observacao: observacao.trim(),
                forma_pagamento: textoPagamento(pagamento),
                pagamento_obs: pagamento.obs.trim(),
                rascunho: rascunhoParaServidor(r) as any,
            });
            onSalvo(dados, msg);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar o orçamento.");
        } finally {
            setSalvando(false);
        }
    };

    const coroa = (i: number, p: Partial<CoroaOrc>) => mudar({ coroas: r.coroas.map((c, j) => (j === i ? { ...c, ...p } : c)) });

    return (
        <div ref={topoRef} className="px-4 pb-40 pt-2 lg:px-0 lg:pb-12">
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={onVoltar} className={BTN_SEC}>
                    Voltar
                </button>
                <div className="min-w-0 flex-1">
                    <h2 className="text-[20px] font-black leading-tight lg:text-[24px]">{inicial ? `Orçamento ${inicial.numero}` : "Novo orçamento"}</h2>
                    <p className={`text-sm ${MUTED}`}>
                        Sempre Particular · válido por {opcoes?.validade_dias || 7} dias depois de salvar
                    </p>
                </div>
            </div>

            {erro ? (
                <div className="mb-4">
                    <Aviso tom="erro">{erro}</Aviso>
                </div>
            ) : null}

            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
                <div className="flex flex-col gap-4">
                    <Secao titulo="Dados">
                        <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-[#F6F8FB] px-3.5 py-2.5 text-sm dark:bg-[#1C2334]">
                            <div className="min-w-0">
                                <span className={`block text-[11.5px] font-extrabold uppercase tracking-[0.05em] ${MUTED}`}>Data do orçamento</span>
                                <b className="block truncate">{dataBR(inicial?.criado_em || hojeISO())}</b>
                            </div>
                            <div className="min-w-0">
                                <span className={`block text-[11.5px] font-extrabold uppercase tracking-[0.05em] ${MUTED}`}>Responsável</span>
                                <b className="block break-words">{inicial?.criado_por_nome || opcoes?.usuario_nome || "—"}</b>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="min-w-0 sm:col-span-2">
                                <Campo rotulo="Nome do falecido *">
                                    <input className={CAMPO} value={falecido} onChange={(e) => setFalecido(e.target.value)} placeholder="Nome completo" autoComplete="off" />
                                </Campo>
                            </div>
                            <Campo rotulo="Contato *">
                                <input className={CAMPO} value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Quem pediu o orçamento" autoComplete="off" />
                            </Campo>
                            <Campo rotulo="Telefone *">
                                <input className={CAMPO} value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} placeholder="(77) 99999-9999" inputMode="tel" autoComplete="off" />
                            </Campo>
                        </div>
                    </Secao>

                    {/* Mesmo padrão do registro do atendimento: primeiro Sim | Não; com Sim, aparecem as opções. */}
                    <Secao titulo="Itens">
                        <div className="grid grid-cols-1 gap-3">
                            <ItemSimNao
                                rotulo="Urna"
                                valor={uso.urna}
                                onMudar={(v) => {
                                    setUso((u) => ({ ...u, urna: v }));
                                    if (v === "Não") mudar({ urna: null });
                                }}
                            >
                                <EscolhaProduto rotulo="Urna para selecionar" fonte={{ action: "urnas_buscar", locais: LOCAIS_URNA }} valor={r.urna} preco={precoDe("URNA")} onMudar={(v) => mudar({ urna: v })} />
                            </ItemSimNao>

                            <ItemSimNao
                                rotulo="Roupa"
                                valor={uso.roupa}
                                onMudar={(v) => {
                                    setUso((u) => ({ ...u, roupa: v }));
                                    if (v === "Não") mudar({ roupa: null, roupa_propria: false });
                                }}
                            >
                                <div className="grid grid-cols-1 gap-3">
                                    <Linha rotulo="Roupa própria (trazida pela família)?">
                                        <EscolhaSimNao rotulo="Roupa própria" valor={r.roupa_propria ? "Sim" : "Não"} onMudar={(v) => mudar({ roupa_propria: v === "Sim", roupa: v === "Sim" ? null : r.roupa })} />
                                    </Linha>
                                    {!r.roupa_propria ? (
                                        <EscolhaProduto rotulo="Roupa para selecionar" fonte={{ action: "roupas_buscar", locais: LOCAIS_ROUPA }} valor={r.roupa} preco={precoDe("ROUPA")} onMudar={(v) => mudar({ roupa: v })} />
                                    ) : null}
                                </div>
                            </ItemSimNao>

                            <ItemSimNao rotulo="Véu" valor={r.veu} onMudar={(v) => mudar({ veu: v })}>
                                <EscolhaProduto rotulo="Véu para selecionar" fonte={{ action: "veus_buscar", locais: LOCAIS_ROUPA }} valor={r.veu_item} preco={precoDe("VEU")} onMudar={(v) => mudar({ veu_item: v })} />
                            </ItemSimNao>
                            <ItemSimNao rotulo="Cordão São Francisco" valor={r.cordao} onMudar={(v) => mudar({ cordao: v })}>
                                <EscolhaProduto rotulo="Cordão para selecionar" fonte={{ action: "cordoes_buscar", locais: LOCAIS_ROUPA }} valor={r.cordao_item} preco={precoDe("CORDAO")} onMudar={(v) => mudar({ cordao_item: v })} />
                            </ItemSimNao>
                            <ItemSimNao rotulo="Invol" valor={r.invol} onMudar={(v) => mudar({ invol: v })}>
                                <EscolhaProduto rotulo="Invol para selecionar" fonte={{ action: "invols_buscar", locais: LOCAIS_INVOL }} valor={r.invol_item} preco={precoDe("INVOLUCRO")} onMudar={(v) => mudar({ invol_item: v })} />
                            </ItemSimNao>
                        </div>
                    </Secao>

                    <Secao titulo="Serviços">
                        <div className="grid grid-cols-1 gap-3">
                            <ItemSimNao rotulo="Tanatopraxia" valor={r.tanato} onMudar={(v) => mudar({ tanato: v })}>
                                <div className="grid grid-cols-1 gap-3">
                                    {procedimentos.length ? (
                                        <EscolhaDaLista
                                            rotulo="Tipo de procedimento"
                                            opcoes={procedimentos.map((m) => ({ v: String(m.produto_id), nome: rotuloProcedimento(m.nome), preco: m.preco }))}
                                            valor={String(r.tanato_produto_id || "")}
                                            onMudar={(v) => mudar({ tanato_produto_id: Number(v) || 0 })}
                                        />
                                    ) : (
                                        <p className={`text-sm ${MUTED}`}>Tanatopraxia normal (o tipo é escolhido no atendimento).</p>
                                    )}
                                    <Linha rotulo="Reconstituição facial" sub={opcoes?.reconstituicao_preco != null ? `Adicional · ${brl(opcoes.reconstituicao_preco)}` : "Adicional"}>
                                        <EscolhaSimNao rotulo="Reconstituição facial" valor={r.reconstituicao_facial} onMudar={(v) => mudar({ reconstituicao_facial: v })} />
                                    </Linha>
                                </div>
                            </ItemSimNao>

                            {opcoes?.ornamentacao?.length ? (
                                <ItemSimNao rotulo="Ornamentação" valor={r.ornamentacao} onMudar={(v) => mudar({ ornamentacao: v })}>
                                    <BotoesOpcoes
                                        rotulo="Tipo de ornamentação"
                                        valor={r.ornamentacao_tipo}
                                        onMudar={(v) => mudar({ ornamentacao_tipo: v })}
                                        colunas="grid grid-cols-2 gap-2"
                                        opcoes={opcoes.ornamentacao.map((o) => ({ v: String(o.valor), r: String(o.valor), sub: brl(o.preco) }))}
                                    />
                                </ItemSimNao>
                            ) : null}

                            {(opcoes?.sim_nao || []).map((s) => (
                                <Linha key={s.campo} rotulo={s.rotulo} sub={s.preco != null ? brl(s.preco) : undefined}>
                                    <EscolhaSimNao rotulo={s.rotulo} valor={extra(s.campo)} onMudar={(v) => mudar({ extras: { ...r.extras, [s.campo]: v } })} />
                                </Linha>
                            ))}

                            <ItemSimNao rotulo="Translado" valor={r.translado} onMudar={(v) => mudar({ translado: v })}>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
                                    <Campo rotulo="Distância (km) *" dica={opcoes?.translado_km_preco != null ? `${brl(opcoes.translado_km_preco)} por km` : undefined}>
                                        <input className={CAMPO} inputMode="decimal" value={r.translado_km} onChange={(e) => mudar({ translado_km: e.target.value.replace(/[^\d,.]/g, "") })} placeholder="0" />
                                    </Campo>
                                    <Campo rotulo="Saindo de">
                                        <input className={CAMPO} value={r.translado_origem} onChange={(e) => mudar({ translado_origem: e.target.value })} placeholder="Cidade / local" />
                                    </Campo>
                                    <Campo rotulo="Indo para">
                                        <input className={CAMPO} value={r.translado_destino} onChange={(e) => mudar({ translado_destino: e.target.value })} placeholder="Cidade / local" />
                                    </Campo>
                                </div>
                            </ItemSimNao>

                            <ItemSimNao
                                rotulo="Velório no Memorial"
                                sub="Memorial Senhor do Bonfim"
                                valor={uso.velorio}
                                onMudar={(v) => {
                                    setUso((u) => ({ ...u, velorio: v }));
                                    if (v === "Não") mudar({ sala_velorio: "" });
                                }}
                            >
                                <p className={`mb-2 text-xs ${MUTED}`}>A sala entra no orçamento. Velório em outro local não é cobrado aqui.</p>
                                <BotoesOpcoes
                                    rotulo="Sala do velório"
                                    valor={r.sala_velorio}
                                    onMudar={(v) => mudar({ sala_velorio: v })}
                                    colunas="grid grid-cols-3 gap-2"
                                    opcoes={(opcoes?.salas || []).map((s) => ({ v: String(s.valor), r: String(s.valor), sub: `${s.nome.replace(/^SALA\s*\d+\s*-\s*/i, "")}\n${brl(s.preco)}` }))}
                                />
                            </ItemSimNao>

                            <ItemSimNao
                                rotulo="Coroa de flores"
                                valor={uso.coroas}
                                onMudar={(v) => {
                                    setUso((u) => ({ ...u, coroas: v }));
                                    if (v === "Não") mudar({ coroas: [] });
                                    else if (!r.coroas.length) mudar({ coroas: [{ tipo: "natural", produto_id: 0, nome: "" }] });
                                }}
                            >
                                <div className="flex flex-col gap-3">
                                    {r.coroas.map((c, i) => (
                                        <div key={i} className="min-w-0 rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.12]">
                                            <div className="mb-2 flex items-center gap-2">
                                                <b className="flex-1 text-sm">Coroa {i + 1}</b>
                                                <button type="button" onClick={() => mudar({ coroas: r.coroas.filter((_, j) => j !== i) })} className="inline-flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-bold text-[#B42318] hover:bg-[#FDECEA] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/10">
                                                    <Icone d={Ic.lixo} tam={18} />
                                                    Tirar
                                                </button>
                                            </div>
                                            <BotoesOpcoes
                                                rotulo="Tipo da coroa"
                                                valor={c.tipo}
                                                onMudar={(v) => coroa(i, { tipo: v, produto_id: 0, nome: "" })}
                                                colunas="mb-3 grid grid-cols-2 gap-2"
                                                opcoes={[
                                                    { v: "natural", r: "Natural" },
                                                    { v: "artificial", r: "Artificial" },
                                                ]}
                                            />
                                            <EscolhaProduto
                                                rotulo="Modelo"
                                                fonte={{ coroa: c.tipo }}
                                                valor={c.produto_id ? { produto_id: c.produto_id, nome: c.nome, local: c.local } : null}
                                                onMudar={(v) => coroa(i, { produto_id: v?.produto_id || 0, nome: v?.nome || "", local: v?.local })}
                                            />
                                        </div>
                                    ))}
                                    {r.coroas.length < 20 ? (
                                        <button type="button" className={BTN_SEC} onClick={() => mudar({ coroas: [...r.coroas, { tipo: "natural", produto_id: 0, nome: "" }] })}>
                                            <Icone d={Ic.mais} />
                                            Adicionar coroa
                                        </button>
                                    ) : null}
                                </div>
                            </ItemSimNao>
                        </div>
                    </Secao>

                    <Secao titulo="Forma de pagamento combinada *">
                        <div role="group" aria-label="Forma de pagamento" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {FORMAS_PAGAMENTO.map((f) => {
                                const on = pagamento.formas.includes(f);
                                return (
                                    <button
                                        key={f}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => setPagamento((p) => ({ ...p, formas: on ? p.formas.filter((x) => x !== f) : [...p.formas, f] }))}
                                        className={`inline-flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl border-[1.5px] px-2 py-2 text-center text-[15px] font-extrabold leading-tight ${on
                                                ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                                                : "border-[#C9D1DE] bg-white text-[#313C55] dark:border-white/25 dark:bg-transparent dark:text-white"
                                            }`}
                                    >
                                        {on ? <Icone d={<path d="M5 12l5 5 9-10" />} tam={16} /> : null}
                                        {f}
                                    </button>
                                );
                            })}
                        </div>
                        <div className={`mt-3 grid grid-cols-1 gap-3 ${credito ? "sm:grid-cols-[160px_minmax(0,1fr)]" : ""}`}>
                            {credito ? (
                                <Campo rotulo="Parcelas no crédito *">
                                    <input
                                        className={CAMPO}
                                        inputMode="numeric"
                                        value={pagamento.parcelas}
                                        onChange={(e) => setPagamento((p) => ({ ...p, parcelas: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
                                        placeholder="1"
                                    />
                                </Campo>
                            ) : null}
                            <Campo rotulo="Observação do pagamento">
                                <input
                                    className={CAMPO}
                                    value={pagamento.obs}
                                    onChange={(e) => setPagamento((p) => ({ ...p, obs: e.target.value }))}
                                    placeholder="Ex.: entrada de R$ 500 no PIX e o restante no cartão"
                                    maxLength={255}
                                    autoComplete="off"
                                />
                            </Campo>
                        </div>
                    </Secao>

                    <Secao titulo="Observação">
                        <textarea
                            className={`${CAMPO} h-auto min-h-[96px] py-3`}
                            value={observacao}
                            onChange={(e) => setObservacao(e.target.value)}
                            placeholder="Ex.: família vai confirmar até amanhã; velório na residência"
                            maxLength={1000}
                        />
                    </Secao>
                </div>

                {/* Resumo: coluna fixa no computador; no celular, embaixo dos itens */}
                <aside className="mt-4 lg:sticky lg:top-6 lg:mt-0">
                    <ResumoOrcamento
                        previa={previa}
                        calculando={calculando}
                        erro={erroCalculo}
                        editavel
                        onAjustarItem={(l) => setAjusteItem(l)}
                        onAjustarGeral={() => setAjusteGeral(true)}
                    />
                    <button type="button" onClick={() => void salvar()} disabled={salvando} className={`${BTN_PRI} mt-3 hidden w-full lg:inline-flex`}>
                        {salvando ? "Salvando…" : inicial ? "Salvar e atualizar a folha" : "Salvar orçamento"}
                    </button>
                </aside>
            </div>

            {ajusteItem ? <JanelaAjusteItem linha={ajusteItem} rascunho={r} previa={previa} onAplicar={aplicarAjuste} onFechar={() => setAjusteItem(null)} /> : null}
            {ajusteGeral ? <JanelaDescontoGeral rascunho={r} previa={previa} onAplicar={aplicarAjuste} onFechar={() => setAjusteGeral(false)} /> : null}

            {/* Celular: total e Salvar fixos, acima da barra de baixo do app */}
            <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 border-t border-[#E3E8F0] bg-white/95 px-4 py-2.5 backdrop-blur dark:border-white/[0.12] dark:bg-[#232B3F]/95 lg:hidden">
                <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <div className={`text-[11px] font-extrabold uppercase tracking-[0.06em] ${MUTED}`}>Total</div>
                        <div className="truncate text-lg font-black tabular-nums">{calculando && !previa ? "…" : brl(previa?.total ?? 0)}</div>
                    </div>
                    <button type="button" onClick={() => void salvar()} disabled={salvando} className={BTN_PRI}>
                        {salvando ? "Salvando…" : "Salvar"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
    return (
        <section className={`${CARTAO} p-4 lg:p-5`}>
            <h3 className="text-[17px] font-black">{titulo}</h3>
            {sub ? <p className={`mt-0.5 text-sm ${MUTED}`}>{sub}</p> : null}
            <div className="mt-3">{children}</div>
        </section>
    );
}

/** Linha em cartão + Sim | Não à direita (CheckboxChoiceGroup do registro do atendimento). */
function Linha({ rotulo, sub, children }: { rotulo: string; sub?: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-[68px] min-w-0 items-center gap-2.5 rounded-[14px] border border-[#E3E8F0] bg-white px-3.5 py-2.5 dark:border-white/[0.12] dark:bg-[#232B3F]">
            <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold leading-tight [overflow-wrap:anywhere]">{rotulo}</span>
                {sub ? <span className={`mt-0.5 block text-xs font-semibold ${MUTED}`}>{sub}</span> : null}
            </span>
            {children}
        </div>
    );
}

/** Pergunta Sim/Não; com Sim, mostra o que escolher (como Urna, Véu, Invol no registro do atendimento). */
function ItemSimNao({ rotulo, sub, valor, onMudar, children }: { rotulo: string; sub?: string; valor: SimNao | ""; onMudar: (v: SimNao) => void; children?: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <Linha rotulo={rotulo} sub={sub}>
                <EscolhaSimNao rotulo={rotulo} valor={valor} onMudar={onMudar} />
            </Linha>
            {valor === "Sim" && children ? <div className="mt-3 min-w-0 border-l-[3px] border-[#E3E8F0] pl-3 dark:border-white/[0.15]">{children}</div> : null}
        </div>
    );
}

/** Escolha numa lista (mesmo jeito dos itens do estoque): o campo mostra o escolhido e abre a lista com os preços. */
function EscolhaDaLista({ rotulo, opcoes, valor, onMudar }: { rotulo: string; opcoes: { v: string; nome: string; preco: number | null }[]; valor: string; onMudar: (v: string) => void }) {
    const [aberto, setAberto] = useState(false);
    const atual = opcoes.find((o) => o.v === valor);
    return (
        <div className="min-w-0">
            <span className={ROTULO}>{rotulo} *</span>
            <button type="button" onClick={() => setAberto(true)} className={`${CAMPO.replace("h-12 ", "")} flex min-h-12 items-center justify-between gap-2 py-2.5 text-left`}>
                <span className={`min-w-0 flex-1 break-words ${atual ? "text-[14px] leading-snug" : "font-normal text-[#8A93A6]"}`}>{atual ? atual.nome : "Escolher na lista…"}</span>
                {atual ? <span className={`shrink-0 text-[13px] font-bold ${MUTED}`}>{brl(atual.preco)}</span> : <Icone d={Ic.busca} tam={18} />}
            </button>
            {aberto ? (
                <Janela titulo={rotulo} onFechar={() => setAberto(false)} largura="max-w-xl">
                    <ul className="flex flex-col">
                        {opcoes.map((o) => (
                            <li key={o.v}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onMudar(o.v);
                                        setAberto(false);
                                    }}
                                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[#EEF2F7] dark:hover:bg-white/10 ${o.v === valor ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/20" : ""}`}
                                >
                                    <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug">{o.nome}</span>
                                    <span className="shrink-0 text-[15px] font-extrabold tabular-nums">{brl(o.preco)}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </Janela>
            ) : null}
        </div>
    );
}

/** Ordem e nome do procedimento como no registro do atendimento: Tanatopraxia, Tanatopraxia Avançada, Embalsamamento. */
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function ordenarProcedimentos<T extends { nome: string }>(modelos: T[]): T[] {
    const peso = (nome: string) => {
        const n = semAcento(nome);
        if (n.startsWith("embalsam")) return 3;
        if (n.startsWith("tanatopraxia")) return /avanc/.test(n) ? 2 : 1;
        return 0;
    };
    const lista = modelos.filter((m) => peso(m.nome) > 0).sort((a, b) => peso(a.nome) - peso(b.nome));
    return lista.length ? lista : modelos;
}
function rotuloProcedimento(nome: string): string {
    return nome.trim().toLocaleLowerCase("pt-BR").replace(/(^|\s)(\p{L})/gu, (_m, e: string, c: string) => e + c.toLocaleUpperCase("pt-BR"));
}

const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
