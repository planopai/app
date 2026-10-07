"use client";

import React, { useRef } from "react";
import { CampoBusca } from "../ui/BuscaLista";
import { Chave, Segmentado } from "../ui/Controles";
import { Ic, type NomeIcone } from "../ui/Icones";
import { Janela } from "../ui/Janela";
import type { JanelaProdutoV } from "./useJanelaProduto";

// Janela do produto: Dados, Estoque, Venda e Custo (cadastro novo e edição).

const ICONE_ABA: Record<string, NomeIcone> = { dados: "documento", estoque: "caixa", valor: "etiqueta", custo: "dinheiro" };

export function JanelaProduto({ v, m, aviso }: { v: JanelaProdutoV; m: boolean; aviso?: string }) {
    const arquivo = useRef<HTMLInputElement>(null);
    const grade2 = { display: "grid", gridTemplateColumns: m ? "minmax(0,1fr)" : "repeat(2,minmax(0,1fr))", gap: "12px" } as const;

    const abas = (
        <div style={{ padding: m ? "10px 16px 0" : "12px 24px 0" }}>
            <div className="tabs2" role="tablist" aria-label="Partes do cadastro" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))", border: "0", background: "var(--sunk)" }}>
                {v.abas.map((t) => (
                    <button
                        type="button"
                        key={t.k}
                        className="tab2"
                        role="tab"
                        aria-selected={t.sel}
                        onClick={t.go}
                        style={m ? { height: "46px", fontSize: "11.5px", flexDirection: "column", gap: "2px", padding: "0 2px" } : { height: "40px", fontSize: "14px" }}
                    >
                        <Ic n={ICONE_ABA[t.k]} />
                        <span>{t.l}</span>
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <>
            <Janela
                m={m}
                titulo={v.titulo}
                sub={v.subtitulo || undefined}
                aoFechar={v.fechar}
                largura={860}
                altura="88%"
                antesTitulo={
                    <span className="thumb" style={m ? { width: "44px", height: "44px", borderRadius: "12px" } : { width: "52px", height: "52px", borderRadius: "14px" }}>
                        {v.foto ? <img src={v.foto} alt="" /> : <Ic n="caixa" />}
                    </span>
                }
                depoisTitulo={
                    v.alerta ? (
                        <span className="tag rep" style={{ marginTop: "4px" }}>
                            Repor
                        </span>
                    ) : null
                }
                topo={abas}
                rodape={
                    <>
                        <button type="button" className="btn" onClick={v.fechar}>
                            Cancelar
                        </button>
                        <button type="button" className="btn pri" onClick={v.salvar} disabled={v.busy}>
                            {v.salvarLbl}
                        </button>
                    </>
                }
            >
                {v.erro ? (
                    <div className="msg-err" role="alert">
                        {v.erro}
                    </div>
                ) : null}
                {aviso ? (
                    <div className="msg-ok" role="status">
                        {aviso}
                    </div>
                ) : null}

                {v.aba === "dados" && (
                    <>
                        <div style={grade2}>
                            <div style={{ gridColumn: "1 / -1" }}>
                                <p className="flbl">{v.novo ? "Nome *" : "Nome"}</p>
                                <input className="inp" value={v.nome} onChange={v.onNome} aria-label="Nome" />
                            </div>
                            {v.novo && (
                                <div>
                                    <p className="flbl">Código de barras *</p>
                                    <input className="inp" value={v.cb} onChange={v.onCb} aria-label="Código de barras" />
                                </div>
                            )}
                            <div>
                                <p className="flbl">{v.novo ? "Categoria *" : "Categoria"}</p>
                                <CampoBusca b={v.cbCat} rotulo="Categoria" m={m} />
                            </div>
                            <div>
                                <p className="flbl">Fabricante</p>
                                <CampoBusca b={v.cbFab} rotulo="Fabricante" m={m} />
                            </div>
                            <div>
                                <p className="flbl">Classificação</p>
                                <CampoBusca b={v.cbCls} rotulo="Classificação" m={m} />
                            </div>
                            {v.editando && (
                                <div>
                                    <p className="flbl">Situação</p>
                                    <Segmentado opcoes={v.situacao} />
                                </div>
                            )}
                        </div>
                        <Chave ligado={v.confeccionado} aoTrocar={v.togConfeccionado} rotulo="Confeccionado na casa">
                            Confeccionado na casa
                        </Chave>
                        <div>
                            <p className="flbl">Fotos do produto</p>
                            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                                {v.fotos.length ? (
                                    v.fotos.map((f, i) => (
                                        <span key={i} style={{ position: "relative" }}>
                                            <button
                                                type="button"
                                                className="thumb"
                                                onClick={f.principalGo}
                                                aria-label={f.principal ? "Foto principal" : "Usar como foto principal"}
                                                style={{ width: "72px", height: "72px", borderRadius: "14px", padding: 0, cursor: "pointer", outline: f.principal ? "2px solid #3D6A99" : undefined }}
                                            >
                                                <img src={f.url} alt="" />
                                            </button>
                                            <button
                                                type="button"
                                                className="ib"
                                                onClick={f.tirar}
                                                aria-label="Tirar foto"
                                                style={{ position: "absolute", top: "-10px", right: "-10px", width: "28px", height: "28px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "14px" }}
                                            >
                                                <Ic n="fechar" style={{ width: "14px", height: "14px" }} />
                                            </button>
                                        </span>
                                    ))
                                ) : (
                                    <span className="thumb" style={{ width: "72px", height: "72px", borderRadius: "14px" }}>
                                        <Ic n="imagem" />
                                    </span>
                                )}
                                <button type="button" className="btn" onClick={() => arquivo.current?.click()}>
                                    Adicionar fotos
                                </button>
                                <input
                                    ref={arquivo}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    hidden
                                    onChange={(e) => {
                                        void v.adicionarFotos(e.target.files);
                                        e.target.value = "";
                                    }}
                                />
                            </div>
                        </div>
                        <div>
                            <p className="flbl">Descrição</p>
                            <textarea className="inp" rows={3} placeholder="Descreva o produto..." aria-label="Descrição" value={v.descricao} onChange={v.onDescricao}></textarea>
                        </div>
                    </>
                )}

                {v.aba === "estoque" && v.editando && (
                    <>
                        <div className="gt" role="table" aria-label="Saldo por depósito" style={{ "--cols": m ? "minmax(0,1fr) 48px 44px 44px 48px" : "minmax(0,1.6fr) 80px 80px 80px 100px" } as React.CSSProperties}>
                            <div className="gh" role="row">
                                <span role="columnheader">Depósito</span>
                                <span className="r" role="columnheader">
                                    Saldo
                                </span>
                                <span className="r" role="columnheader">
                                    Mínimo
                                </span>
                                <span className="r" role="columnheader">
                                    Máximo
                                </span>
                                <span className="r" role="columnheader">
                                    Repor
                                </span>
                            </div>
                            {v.edDeps.map((d) => (
                                <div className="gr" role="row" style={{ minHeight: "48px" }} key={String(d.id)}>
                                    <span role="cell" style={{ fontWeight: "800" }}>
                                        {d.d}
                                        {d.low && (
                                            <>
                                                {" "}
                                                <span className="tag rep">Abaixo do mínimo</span>
                                            </>
                                        )}
                                    </span>
                                    <span className="r" role="cell">
                                        <b>{d.q}</b>
                                    </span>
                                    <span className="r tx2" role="cell">
                                        {d.mn}
                                    </span>
                                    <span className="r tx2" role="cell">
                                        {d.mx}
                                    </span>
                                    <span className="r" role="cell">
                                        {d.rep}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            <button type="button" className="btn" onClick={v.abrirMinMax}>
                                Ajustar mínimo e máximo
                            </button>
                            <button type="button" className="btn" onClick={v.abrirVincular}>
                                Vincular a outro depósito
                            </button>
                        </div>
                    </>
                )}

                {v.aba === "estoque" && v.novo && (
                    <div className="gt" role="table" aria-label="Depósitos do produto" style={{ "--cols": m ? "minmax(0,1fr) 84px 84px" : "minmax(0,1.6fr) 110px 110px" } as React.CSSProperties}>
                        <div className="gh" role="row">
                            <span role="columnheader">Depósito</span>
                            <span className="r" role="columnheader">
                                Mínimo
                            </span>
                            <span className="r" role="columnheader">
                                Máximo
                            </span>
                        </div>
                        {v.nvDepsRows.map((d) => (
                            <div className="gr" role="row" style={{ minHeight: "52px" }} key={d.d}>
                                <span role="cell">
                                    <button type="button" className="ck" aria-pressed={d.on} onClick={d.go} style={{ padding: "0" }}>
                                        <i></i>
                                        {d.d}
                                    </button>
                                </span>
                                <span className="r" role="cell">
                                    {d.on && (
                                        <input
                                            className="inp numi"
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={d.mn}
                                            onChange={d.onMn}
                                            aria-label={`Mínimo em ${d.d}`}
                                            style={{ height: "40px", width: m ? "72px" : "90px", display: "inline-block" }}
                                        />
                                    )}
                                </span>
                                <span className="r" role="cell">
                                    {d.on && (
                                        <input
                                            className="inp numi"
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={d.mx}
                                            onChange={d.onMx}
                                            aria-label={`Máximo em ${d.d}`}
                                            style={{ height: "40px", width: m ? "72px" : "90px", display: "inline-block" }}
                                        />
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {v.aba === "valor" && (
                    <div style={grade2}>
                        {v.editando && (
                            <div className="stat">
                                <span className="sm">Valor de venda atual</span>
                                <b>{v.valorAtual}</b>
                                <span className="sm">{v.margem}</span>
                            </div>
                        )}
                        <div>
                            <p className="flbl">Valor de venda</p>
                            <input className="inp" value={v.valor} onChange={v.onValor} placeholder="R$ 0,00" inputMode="decimal" aria-label="Valor de venda" />
                        </div>
                    </div>
                )}

                {v.aba === "custo" && v.editando && (
                    <div style={grade2}>
                        <div className="stat">
                            <span className="sm">Preço de custo atual</span>
                            <b>{v.custoAtual}</b>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <button type="button" className="btn" style={{ justifyContent: "flex-start" }} onClick={v.novoPrecoCusto}>
                                Novo preço de custo
                            </button>
                            <button type="button" className="btn" style={{ justifyContent: "flex-start" }} onClick={v.corrigirLote}>
                                Corrigir custo de um lote
                            </button>
                        </div>
                    </div>
                )}

                {v.aba === "custo" && v.novo && (
                    <div style={{ maxWidth: "320px" }}>
                        <p className="flbl">Preço de custo de referência</p>
                        <input className="inp" value={v.custoNovo} onChange={v.onCustoNovo} placeholder="R$ 0,00" inputMode="decimal" aria-label="Preço de custo" />
                    </div>
                )}
            </Janela>

            {v.sub === "minmax" && (
                <Janela
                    m={m}
                    titulo="Mínimo e máximo"
                    aoFechar={v.fecharSub}
                    largura={520}
                    rodape={
                        <>
                            <button type="button" className="btn" onClick={v.desvincular} disabled={!v.subDep}>
                                Desvincular
                            </button>
                            <button type="button" className="btn pri" onClick={v.salvarMinMax} disabled={!v.subDep}>
                                Salvar
                            </button>
                        </>
                    }
                >
                    <div>
                        <p className="flbl">Depósito</p>
                        <CampoBusca b={v.cbSubDep} rotulo="Depósito" m={m} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px" }}>
                        <div>
                            <p className="flbl">Mínimo</p>
                            <input className="inp" type="text" inputMode="numeric" pattern="[0-9]*" value={v.minDep} onChange={v.onMinDep} aria-label="Mínimo" />
                        </div>
                        <div>
                            <p className="flbl">Máximo</p>
                            <input className="inp" type="text" inputMode="numeric" pattern="[0-9]*" value={v.maxDep} onChange={v.onMaxDep} aria-label="Máximo" />
                        </div>
                    </div>
                </Janela>
            )}

            {v.sub === "vincular" && (
                <Janela
                    m={m}
                    titulo="Vincular a outro depósito"
                    aoFechar={v.fecharSub}
                    largura={520}
                    rodape={
                        <>
                            <button type="button" className="btn" onClick={v.fecharSub}>
                                Cancelar
                            </button>
                            <button type="button" className="btn pri" onClick={v.vincular} disabled={!v.subDep}>
                                Vincular
                            </button>
                        </>
                    }
                >
                    <div>
                        <p className="flbl">Depósito</p>
                        <CampoBusca b={v.cbSubDep} rotulo="Depósito" m={m} />
                    </div>
                </Janela>
            )}
        </>
    );
}
