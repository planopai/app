"use client";

/*
 * Formulário do orçamento (13/10/2026): poucos dados (falecido, contato, telefone) e os itens.
 * A folha é calculada pelo servidor com as mesmas regras da prévia da OS do registro, sempre como Particular.
 * Velório e sepultamento não são pedidos; só a sala do Memorial, que entra na parte financeira.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { calcularPrevia, salvarOrcamento } from "./api";
import EscolhaProduto from "./EscolhaProduto";
import ResumoOrcamento from "./ResumoOrcamento";
import { RASCUNHO_VAZIO, brl, rascunhoDoServidor, rascunhoParaServidor, type CoroaOrc, type Opcoes, type Orcamento, type Previa, type Rascunho, type SimNao } from "./tipos";
import { Aviso, BTN_PRI, BTN_SEC, CAMPO, CARTAO, Campo, EscolhaSimNao, Ic, Icone, MUTED, Opcoes as BotoesOpcoes, mascaraTelefone } from "./ui";

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
    const [r, setR] = useState<Rascunho>(() => (inicial ? rascunhoDoServidor(inicial.rascunho, camposExtras) : RASCUNHO_VAZIO));
    const [previa, setPrevia] = useState<Previa | null>(null);
    const [calculando, setCalculando] = useState(false);
    const [erroCalculo, setErroCalculo] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");
    const topoRef = useRef<HTMLDivElement>(null);

    const mudar = (p: Partial<Rascunho>) => setR((a) => ({ ...a, ...p }));
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

    const precoDe = (chave: string): number | null | undefined => previa?.linhas.find((l) => l.chave === chave)?.valor;

    const faltando = [
        !falecido.trim() && "nome do falecido",
        !contato.trim() && "nome do contato",
        telefone.replace(/\D+/g, "").length < 10 && "telefone com DDD",
        !(previa?.linhas.length) && "pelo menos um item",
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
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="sm:col-span-2">
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

                    <Secao titulo="Itens">
                        <div className="grid gap-4">
                            <EscolhaProduto rotulo="Urna" fonte={{ action: "urnas_buscar", locais: LOCAIS_URNA }} valor={r.urna} preco={precoDe("URNA")} onMudar={(v) => mudar({ urna: v })} />

                            <div>
                                <Linha rotulo="Roupa própria (trazida pela família)?">
                                    <EscolhaSimNao rotulo="Roupa própria" valor={r.roupa_propria ? "Sim" : "Não"} onMudar={(v) => mudar({ roupa_propria: v === "Sim", roupa: v === "Sim" ? null : r.roupa })} />
                                </Linha>
                                {!r.roupa_propria ? (
                                    <div className="mt-3">
                                        <EscolhaProduto rotulo="Roupa" fonte={{ action: "roupas_buscar", locais: LOCAIS_ROUPA }} valor={r.roupa} preco={precoDe("ROUPA")} onMudar={(v) => mudar({ roupa: v })} />
                                    </div>
                                ) : null}
                            </div>

                            <ItemSimNao rotulo="Véu" valor={r.veu} onMudar={(v) => mudar({ veu: v })}>
                                <EscolhaProduto rotulo="Modelo do véu" fonte={{ action: "veus_buscar", locais: LOCAIS_ROUPA }} valor={r.veu_item} preco={precoDe("VEU")} onMudar={(v) => mudar({ veu_item: v })} />
                            </ItemSimNao>
                            <ItemSimNao rotulo="Cordão São Francisco" valor={r.cordao} onMudar={(v) => mudar({ cordao: v })}>
                                <EscolhaProduto rotulo="Modelo do cordão" fonte={{ action: "cordoes_buscar", locais: LOCAIS_ROUPA }} valor={r.cordao_item} preco={precoDe("CORDAO")} onMudar={(v) => mudar({ cordao_item: v })} />
                            </ItemSimNao>
                            <ItemSimNao rotulo="Invol" valor={r.invol} onMudar={(v) => mudar({ invol: v })}>
                                <EscolhaProduto rotulo="Modelo do invol" fonte={{ action: "invols_buscar", locais: LOCAIS_INVOL }} valor={r.invol_item} preco={precoDe("INVOLUCRO")} onMudar={(v) => mudar({ invol_item: v })} />
                            </ItemSimNao>
                        </div>
                    </Secao>

                    <Secao titulo="Serviços">
                        <div className="grid gap-4">
                            <ItemSimNao rotulo="Tanatopraxia" valor={r.tanato} onMudar={(v) => mudar({ tanato: v })}>
                                {opcoes?.tanato_modelos?.length ? (
                                    <BotoesOpcoes
                                        rotulo="Tipo de procedimento"
                                        valor={String(r.tanato_produto_id || "")}
                                        onMudar={(v) => mudar({ tanato_produto_id: Number(v) || 0 })}
                                        colunas="grid gap-2 sm:grid-cols-3"
                                        opcoes={opcoes.tanato_modelos.map((m) => ({ v: String(m.produto_id), r: m.nome, sub: brl(m.preco) }))}
                                    />
                                ) : (
                                    <p className={`text-sm ${MUTED}`}>Tanatopraxia normal (o tipo é escolhido no atendimento).</p>
                                )}
                                <div className="mt-3">
                                    <Linha rotulo={`Reconstituição facial${opcoes?.reconstituicao_preco != null ? ` (${brl(opcoes.reconstituicao_preco)})` : ""}`}>
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
                                <Linha key={s.campo} rotulo={`${s.rotulo}${s.preco != null ? ` (${brl(s.preco)})` : ""}`}>
                                    <EscolhaSimNao rotulo={s.rotulo} valor={extra(s.campo)} onMudar={(v) => mudar({ extras: { ...r.extras, [s.campo]: v } })} />
                                </Linha>
                            ))}

                            <ItemSimNao rotulo="Translado" valor={r.translado} onMudar={(v) => mudar({ translado: v })}>
                                <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
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
                        </div>
                    </Secao>

                    <Secao titulo="Velório no Memorial" sub="Só se a família quiser velar no Memorial Senhor do Bonfim: a sala entra no orçamento.">
                        <BotoesOpcoes
                            rotulo="Sala do velório"
                            valor={r.sala_velorio}
                            onMudar={(v) => mudar({ sala_velorio: v })}
                            colunas="grid grid-cols-2 gap-2 sm:grid-cols-4"
                            opcoes={[
                                { v: "", r: "Não", sub: "outro local ou sem velório" },
                                ...(opcoes?.salas || []).map((s) => ({ v: String(s.valor), r: String(s.valor), sub: `${s.nome.replace(/^SALA\s*\d+\s*-\s*/i, "")}\n${brl(s.preco)}` })),
                            ]}
                        />
                    </Secao>

                    <Secao titulo="Coroas de flores">
                        <div className="flex flex-col gap-3">
                            {r.coroas.map((c, i) => (
                                <div key={i} className="rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.12]">
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
                    <ResumoOrcamento previa={previa} calculando={calculando} erro={erroCalculo} />
                    <button type="button" onClick={() => void salvar()} disabled={salvando} className={`${BTN_PRI} mt-3 hidden w-full lg:inline-flex`}>
                        {salvando ? "Salvando…" : inicial ? "Salvar e atualizar a folha" : "Salvar orçamento"}
                    </button>
                </aside>
            </div>

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

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[15px] font-bold">{rotulo}</span>
            {children}
        </div>
    );
}

/** Pergunta Sim/Não; com Sim, mostra o que escolher. */
function ItemSimNao({ rotulo, valor, onMudar, children }: { rotulo: string; valor: SimNao; onMudar: (v: SimNao) => void; children?: React.ReactNode }) {
    return (
        <div>
            <Linha rotulo={rotulo}>
                <EscolhaSimNao rotulo={rotulo} valor={valor} onMudar={onMudar} />
            </Linha>
            {valor === "Sim" && children ? <div className="mt-3 border-l-[3px] border-[#E3E8F0] pl-3 dark:border-white/[0.15]">{children}</div> : null}
        </div>
    );
}
