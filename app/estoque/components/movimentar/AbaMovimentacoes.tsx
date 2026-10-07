"use client";

import React from "react";
import { CampoBusca } from "../ui/BuscaLista";
import { Ic, type NomeIcone } from "../ui/Icones";
import { Janela } from "../ui/Janela";
import { BarcodeScannerModal } from "../ui/LeitorCodigo";
import type { MovimentacoesV } from "./useMovimentacoes";

// Aba Movimentações: Transferência, Entrada e Confecção (mockup "Repaginada do app PAI").

const ICONE_OP: Record<string, NomeIcone> = { transf: "setas", entrada: "baixar", confeccao: "flor" };
const cols = (c: string) => ({ "--cols": c }) as React.CSSProperties;

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="flbl">{rotulo}</p>
            {children}
        </div>
    );
}

function Vazio({ texto, m }: { texto: string; m: boolean }) {
    return (
        <div style={{ padding: m ? "14px" : "22px", border: "1.5px dashed var(--line2)", borderRadius: "14px", textAlign: "center", fontSize: m ? "13px" : undefined }} className="sm">
            {texto}
        </div>
    );
}

function JanelaConfirmar({ v, m }: { v: MovimentacoesV; m: boolean }) {
    return (
        <Janela
            m={m}
            titulo={v.cmovTitulo}
            sub={v.linhaConf}
            aoFechar={v.fecharCmov}
            rodape={
                <>
                    <button type="button" className="btn" onClick={v.fecharCmov}>
                        Voltar
                    </button>
                    <button type="button" className="btn pri" onClick={() => void v.confirmarMov()} disabled={v.busy}>
                        Confirmar
                    </button>
                </>
            }
        >
            {v.cmovQ && (
                <span className="itb">
                    <span className="ih">
                        <span>Produto</span>
                        <span style={{ textAlign: "right" }}>Qtd</span>
                    </span>
                    {v.resumoConf.map((i, k) => (
                        <span className="ir" key={k}>
                            <span className="itn">{i.n}</span>
                            <span className="iq">{i.q}</span>
                        </span>
                    ))}
                </span>
            )}
            {v.cmovES && (
                <span className="itb">
                    <span className="ih">
                        <span>Item</span>
                        <span style={{ textAlign: "right" }}>Qtd</span>
                    </span>
                    {v.cmovSecs.map((g, k) => (
                        <React.Fragment key={k}>
                            <span className="isec">{g.t}</span>
                            {g.itens.map((i, j) => (
                                <span className="ir" key={j}>
                                    <span className="itn">{i.n}</span>
                                    <span className="iq">{i.q}</span>
                                </span>
                            ))}
                        </React.Fragment>
                    ))}
                </span>
            )}
        </Janela>
    );
}

function ConfeccoesRegistradas({ v, m }: { v: MovimentacoesV; m: boolean }) {
    if (m) {
        return (
            <>
                <p className="flbl" style={{ margin: "4px 0 0" }}>
                    Confecções registradas
                </p>
                <div className="box" style={{ overflow: "hidden" }}>
                    {v.cfHistRows.map((h) => (
                        <div key={h.id} style={{ borderBottom: "1px solid var(--line)" }}>
                            <button type="button" className="rowlink" onClick={h.go} style={{ padding: "10px 12px", flexDirection: "column", alignItems: "stretch", gap: "2px" }}>
                                <span style={{ display: "flex", gap: "8px" }}>
                                    <b style={{ flex: "1" }}>
                                        {h.n} × {h.q}
                                    </b>
                                    <b>{h.tot}</b>
                                </span>
                                <span className="cbx">
                                    {h.cod} · {h.dt} · {h.u} · {h.un}/un
                                </span>
                            </button>
                            {h.aberto && (
                                <div style={{ padding: "0 12px 12px" }}>
                                    <div className="gt" role="table" aria-label="Itens usados" style={cols("minmax(0,1fr) 34px 70px 76px")}>
                                        <div className="gh" role="row" style={{ gap: "6px", padding: "6px 10px", fontSize: "10.5px" }}>
                                            <span role="columnheader">Item</span>
                                            <span className="r" role="columnheader">
                                                Qtd
                                            </span>
                                            <span className="r" role="columnheader">
                                                Custo
                                            </span>
                                            <span className="r" role="columnheader">
                                                Total
                                            </span>
                                        </div>
                                        {h.itens.map((i, k) => (
                                            <div className="gr" role="row" key={k} style={{ gap: "6px", padding: "6px 10px", minHeight: "0", fontSize: "12.5px" }}>
                                                <span className="pn" role="cell">
                                                    {i.n}
                                                </span>
                                                <span className="r" role="cell">
                                                    {i.q}
                                                </span>
                                                <span className="r" role="cell">
                                                    {i.cu}
                                                </span>
                                                <span className="r" role="cell">
                                                    {i.t}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginTop: "8px" }}>
                                        <span>Total da confecção</span>
                                        <b>{h.tot}</b>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                                        <span>Preço unitário do produto final</span>
                                        <b>{h.un}</b>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </>
        );
    }
    return (
        <div className="box" style={{ padding: "20px 24px" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: "800" }}>Confecções registradas</h2>
            <div className="gt" role="table" aria-label="Confecções registradas" style={cols("140px 110px minmax(0,1.6fr) 60px 130px 120px 120px")}>
                <div className="gh" role="row">
                    <span role="columnheader">Lançamento</span>
                    <span role="columnheader">Quando</span>
                    <span role="columnheader">Produto</span>
                    <span className="r" role="columnheader">
                        Qtd
                    </span>
                    <span className="r" role="columnheader">
                        Preço unitário
                    </span>
                    <span className="r" role="columnheader">
                        Total
                    </span>
                    <span role="columnheader">Por</span>
                </div>
                {v.cfHistRows.map((h) => (
                    <div key={h.id}>
                        <button type="button" className="gr hov rowbtn2" onClick={h.go} aria-expanded={h.aberto}>
                            <span className="pn">{h.cod}</span>
                            <span className="tx2">{h.dt}</span>
                            <span className="pn">
                                {h.n} <span className="tx2">→ {h.dep}</span>
                            </span>
                            <span className="r">
                                <b>{h.q}</b>
                            </span>
                            <span className="r">{h.un}</span>
                            <span className="r" style={{ fontWeight: "800" }}>
                                {h.tot}
                            </span>
                            <span className="tx2">{h.u}</span>
                        </button>
                        {h.aberto && (
                            <div style={{ padding: "12px 14px 16px", background: "var(--sunk)" }}>
                                <div className="gt" role="table" aria-label="Itens usados" style={{ ...cols("minmax(0,2fr) 110px 120px 120px"), maxWidth: "720px" }}>
                                    <div className="gh" role="row">
                                        <span role="columnheader">Item (saiu de {h.de})</span>
                                        <span className="r" role="columnheader">
                                            Quantidade
                                        </span>
                                        <span className="r" role="columnheader">
                                            Custo
                                        </span>
                                        <span className="r" role="columnheader">
                                            Total
                                        </span>
                                    </div>
                                    {h.itens.map((i, k) => (
                                        <div className="gr" role="row" style={{ minHeight: "44px" }} key={k}>
                                            <span className="pn" role="cell">
                                                {i.n}
                                            </span>
                                            <span className="r" role="cell">
                                                {i.q}
                                            </span>
                                            <span className="r" role="cell">
                                                {i.cu}
                                            </span>
                                            <span className="r" role="cell">
                                                {i.t}
                                            </span>
                                        </div>
                                    ))}
                                    <div className="gr" role="row" style={{ minHeight: "44px", background: "var(--card)" }}>
                                        <span className="pn" role="cell">
                                            Total da confecção
                                        </span>
                                        <span role="cell"></span>
                                        <span role="cell"></span>
                                        <span className="r" role="cell" style={{ fontWeight: "800" }}>
                                            {h.tot}
                                        </span>
                                    </div>
                                    <div className="gr" role="row" style={{ minHeight: "44px", background: "var(--card)" }}>
                                        <span className="pn" role="cell">
                                            Entrada: {h.q} × {h.n} em {h.dep}
                                        </span>
                                        <span role="cell"></span>
                                        <span className="r tx2" role="cell">
                                            por unidade
                                        </span>
                                        <span className="r" role="cell" style={{ fontWeight: "800" }}>
                                            {h.un}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Bloco da Confecção (locais, produto, insumos, prontos e totais). */
function Confeccao({ v, m }: { v: MovimentacoesV; m: boolean }) {
    const caixaAdd = { padding: "12px", borderRadius: "14px", background: "var(--sunk)", border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "10px" } as const;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: m ? "10px" : "14px" }}>
            <div style={m ? { display: "contents" } : { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px" }}>
                <Campo rotulo="Origem de insumos">
                    <CampoBusca b={v.cbCfOri} rotulo="Origem de insumos" m={m} />
                </Campo>
                <Campo rotulo="Destino de produto">
                    <CampoBusca b={v.cbCfDes} rotulo="Destino de produto" m={m} />
                </Campo>
            </div>
            <Campo rotulo="Produto">
                <CampoBusca b={v.cbCfProd} rotulo="Produto confeccionado" placeholder="Digite o nome do que está confeccionando" m={m} />
            </Campo>
            {v.temCfP && (
                <div style={{ display: "flex", flexDirection: "column", gap: m ? "10px" : "12px" }}>
                    {m ? (
                        <div className="addbox" style={caixaAdd}>
                            <Campo rotulo="Insumo">
                                <CampoBusca b={v.cbIns} rotulo="Insumo" placeholder="Digite parte do nome do insumo" m={m} />
                            </Campo>
                            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                                <div>
                                    <p className="flbl">Qtd usada</p>
                                    <input className="inp numi" type="text" inputMode="numeric" pattern="[0-9]*" value={v.cfInsQ} onChange={v.onCfInsQ} aria-label="Quantidade usada" style={{ width: "80px", textAlign: "center", fontSize: "16px" }} />
                                </div>
                                <span style={{ flex: "1" }}></span>
                                <button type="button" className="btn pri sq" onClick={v.addInsumo} aria-label="Adicionar insumo">
                                    <Ic n="mais" style={{ strokeWidth: "2.4" }} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="addrow">
                            <div style={{ flex: "1", minWidth: "280px" }}>
                                <p className="flbl">Insumo</p>
                                <CampoBusca b={v.cbIns} rotulo="Insumo" placeholder="Digite parte do nome do insumo" aoLer={v.abrirLeitor} />
                            </div>
                            <div>
                                <p className="flbl">Qtd usada</p>
                                <input className="inp numi" type="text" inputMode="numeric" pattern="[0-9]*" value={v.cfInsQ} onChange={v.onCfInsQ} aria-label="Quantidade usada" style={{ width: "84px", textAlign: "center" }} />
                            </div>
                            <button type="button" className="btn pri sq" onClick={v.addInsumo} aria-label="Adicionar insumo">
                                <Ic n="mais" style={{ strokeWidth: "2.4" }} />
                            </button>
                        </div>
                    )}

                    {!m && v.cfVazio && <Vazio texto="Nenhum insumo ainda." m={m} />}

                    {v.cfTem && m && (
                        <div className="itb">
                            {v.cfRows.map((i) => (
                                <div key={i.k} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 4px 6px 12px", borderBottom: "1px solid var(--line)" }}>
                                    <div style={{ flex: "1", minWidth: "0" }}>
                                        <div className="pn" style={{ fontSize: "13.5px" }}>
                                            {i.n}
                                        </div>
                                        <div className="cbx">
                                            {i.cu} · total {i.custo}
                                            {i.falta && (
                                                <>
                                                    {" "}
                                                    · <b style={{ color: "var(--text)" }}>só tem {i.sd}</b>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <input className="inp numi" type="text" inputMode="numeric" pattern="[0-9]*" value={i.q} onChange={i.onQ} aria-label={`Quantidade usada de ${i.n}`} style={{ width: "60px", textAlign: "center", height: "40px", fontSize: "16px" }} />
                                    <button type="button" className="xb" onClick={i.rm} aria-label={`Remover ${i.n}`}>
                                        <Ic n="lixeira" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {v.cfTem && !m && (
                        <div className="gt" role="table" aria-label="Insumos usados" style={cols("minmax(0,2fr) 110px 110px 120px 150px 44px")}>
                            <div className="gh" role="row">
                                <span role="columnheader">Insumo</span>
                                <span className="r" role="columnheader">
                                    Quantidade
                                </span>
                                <span className="r" role="columnheader">
                                    Custo
                                </span>
                                <span className="r" role="columnheader">
                                    Total
                                </span>
                                <span role="columnheader">Situação</span>
                                <span role="columnheader"></span>
                            </div>
                            {v.cfRows.map((i) => (
                                <div className="gr" role="row" key={i.k}>
                                    <span className="pn" role="cell">
                                        {i.n}
                                    </span>
                                    <span className="r" role="cell">
                                        <input
                                            className="inp numi"
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={i.q}
                                            onChange={i.onQ}
                                            aria-label={`Quantidade usada de ${i.n}`}
                                            style={{ width: "76px", textAlign: "center", height: "40px", display: "inline-block" }}
                                        />
                                    </span>
                                    <span className="r" role="cell">
                                        {i.cu}
                                    </span>
                                    <span className="r" role="cell" style={{ fontWeight: "800" }}>
                                        {i.custo}
                                    </span>
                                    <span role="cell">
                                        {i.ok && <span className="tag ok">Tem saldo ({i.sd})</span>}
                                        {i.falta && <span className="tag dif">Só tem {i.sd}</span>}
                                    </span>
                                    <span role="cell">
                                        <button type="button" className="ib" onClick={i.rm} aria-label={`Remover ${i.n}`}>
                                            <Ic n="lixeira" />
                                        </button>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {m ? (
                        <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: "8px", alignItems: "end" }}>
                            <div>
                                <p className="flbl">Prontos</p>
                                <input className="inp numi" type="text" inputMode="numeric" pattern="[0-9]*" value={v.cfQtd} onChange={v.onCfQtd} aria-label="Quantidade produzida" style={{ width: "100%", textAlign: "center", fontSize: "18px", fontWeight: "800" }} />
                            </div>
                            <div className="stat" style={{ padding: "8px 12px" }}>
                                <span className="sm" style={{ fontSize: "12px" }}>
                                    Total · preço unitário
                                </span>
                                <b style={{ fontSize: "15px" }}>
                                    {v.cfCusto} · {v.cfUn}
                                </b>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "200px repeat(2,minmax(0,1fr))", gap: "12px", alignItems: "end" }}>
                            <div>
                                <p className="flbl">Prontos</p>
                                <input className="inp numi" type="text" inputMode="numeric" pattern="[0-9]*" value={v.cfQtd} onChange={v.onCfQtd} aria-label="Quantidade produzida" style={{ width: "100%", textAlign: "center", fontSize: "18px", fontWeight: "800" }} />
                            </div>
                            <div className="stat">
                                <span className="sm">Total da confecção</span>
                                <b>{v.cfCusto}</b>
                            </div>
                            <div className="stat">
                                <span className="sm">Preço unitário do produto final</span>
                                <b>{v.cfUn}</b>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function AbaMovimentacoes({ v, m }: { v: MovimentacoesV; m: boolean }) {
    const leitor = <BarcodeScannerModal open={v.scan} title="Ler código de barras" onClose={v.fecharLeitor} onDetected={v.lerCodigo} />;
    const erro = v.erro ? (
        <div className="msg-err" role="alert" style={m ? { fontSize: "13px" } : undefined}>
            {v.erro}
        </div>
    ) : null;

    if (m) {
        return (
            <section style={{ display: "flex", flexDirection: "column", gap: "12px" }} aria-label="Movimentações">
                <div className="segb">
                    {v.ops.map((o) => (
                        <button type="button" key={o.k} aria-pressed={o.sel} onClick={o.go}>
                            {o.l}
                        </button>
                    ))}
                </div>
                <div className="box" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    {v.isT && (
                        <>
                            <Campo rotulo="Origem">
                                <CampoBusca b={v.cbOrig} rotulo="Origem" m />
                            </Campo>
                            <Campo rotulo="Destino">
                                <CampoBusca b={v.cbDest} rotulo="Destino" m />
                            </Campo>
                        </>
                    )}
                    {v.isE && (
                        <Campo rotulo="Local de entrada">
                            <CampoBusca b={v.cbDepE} rotulo="Local de entrada" m />
                        </Campo>
                    )}
                    {v.notC && (
                        <>
                            <div className="addbox" style={{ padding: "12px", borderRadius: "14px", background: "var(--sunk)", border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "10px" }}>
                                <Campo rotulo="Produto">
                                    <CampoBusca b={v.cbProd} rotulo="Produto" placeholder="Digite parte do nome ou do código" m aoLer={v.abrirLeitor} />
                                </Campo>
                                <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                                    <div>
                                        <p className="flbl">Qtd</p>
                                        <input className="inp numi" type="text" inputMode="numeric" pattern="[0-9]*" value={v.qtd} onChange={v.onQtd} aria-label="Quantidade" style={{ width: "80px", textAlign: "center", fontSize: "16px" }} />
                                    </div>
                                    {v.isE && (
                                        <div style={{ flex: "1" }}>
                                            <p className="flbl">Custo/un.</p>
                                            <input className="inp" value={v.custoU} onChange={v.onCustoU} placeholder="R$ 0,00" inputMode="decimal" aria-label="Custo por unidade" style={{ fontSize: "16px" }} />
                                        </div>
                                    )}
                                    {!v.isE && <span style={{ flex: "1" }}></span>}
                                    <button type="button" className="btn pri sq" onClick={v.addItem} aria-label="Adicionar à lista">
                                        <Ic n="mais" style={{ strokeWidth: "2.4" }} />
                                    </button>
                                </div>
                            </div>
                            <div>
                                <p className="flbl">Itens · {v.nFila}</p>
                                {v.filaVazia && <Vazio texto="Nenhum item ainda." m />}
                                {v.temFila && (
                                    <div className="itb">
                                        {v.filaRows.map((f) => (
                                            <div key={f.k} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 4px 8px 12px", borderBottom: "1px solid var(--line)" }}>
                                                <div style={{ flex: "1", minWidth: "0" }}>
                                                    <div className="pn" style={{ fontSize: "14px" }}>
                                                        {f.n}
                                                    </div>
                                                    {v.isE && (
                                                        <div className="cbx">
                                                            {f.q} × {f.fin} = <b style={{ color: "var(--text)" }}>{f.tot}</b>
                                                        </div>
                                                    )}
                                                    {v.isT && <div className="cbx">Saldo na origem: {f.sd}</div>}
                                                </div>
                                                <b style={{ fontSize: "16px" }}>{f.q}</b>
                                                <button type="button" className="xb" onClick={f.rm} aria-label={`Remover ${f.n}`}>
                                                    <Ic n="lixeira" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {v.isE && (
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "8px", marginTop: "10px" }}>
                                        <div>
                                            <p className="flbl">Frete total</p>
                                            <input className="inp" value={v.frete} onChange={v.onFrete} placeholder="R$ 0,00" inputMode="decimal" aria-label="Frete total" style={{ fontSize: "16px" }} />
                                        </div>
                                        <div className="stat" style={{ padding: "8px 12px" }}>
                                            <span className="sm" style={{ fontSize: "12px" }}>
                                                Total
                                            </span>
                                            <b style={{ fontSize: "15px" }}>{v.totEntrada}</b>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    {v.isC && <Confeccao v={v} m />}
                    {erro}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "8px" }}>
                        <button type="button" className="btn" onClick={v.limparMov}>
                            Limpar
                        </button>
                        <button type="button" className="btn pri" onClick={v.pedirConcluir} disabled={v.concluirOff}>
                            {v.concluirLbl}
                        </button>
                    </div>
                </div>
                {v.isC && <ConfeccoesRegistradas v={v} m />}
                {v.cmov && <JanelaConfirmar v={v} m />}
                {leitor}
            </section>
        );
    }

    return (
        <section style={{ display: "flex", flexDirection: "column", gap: "14px" }} aria-label="Movimentações">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "10px" }}>
                {v.ops.map((o) => (
                    <button type="button" key={o.k} className="opt" aria-pressed={o.sel} onClick={o.go}>
                        <span className="chip">
                            <Ic n={ICONE_OP[o.k]} />
                        </span>
                        <span style={{ minWidth: "0" }}>
                            <span style={{ display: "block", fontSize: "15px", fontWeight: "800" }}>{o.l}</span>
                            <span style={{ display: "block", fontSize: "12.5px", color: "var(--text2)", marginTop: "2px", lineHeight: "1.35" }}>{o.d}</span>
                        </span>
                    </button>
                ))}
            </div>

            <div className="box" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                    <h2 style={{ margin: "0", fontSize: "19px", fontWeight: "800" }}>{v.opTitulo}</h2>
                </div>

                {v.isT && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "12px" }}>
                        <Campo rotulo="Origem">
                            <CampoBusca b={v.cbOrig} rotulo="Origem" />
                        </Campo>
                        <Campo rotulo="Destino">
                            <CampoBusca b={v.cbDest} rotulo="Destino" />
                        </Campo>
                        <Campo rotulo="Solicitante">
                            <CampoBusca b={v.cbSol} rotulo="Solicitante" />
                        </Campo>
                    </div>
                )}

                {v.isE && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "12px" }}>
                        <Campo rotulo="Local de entrada">
                            <CampoBusca b={v.cbDepE} rotulo="Local de entrada" />
                        </Campo>
                        <Campo rotulo="Frete total da entrada">
                            <input className="inp" value={v.frete} onChange={v.onFrete} placeholder="R$ 0,00" inputMode="decimal" aria-label="Frete total" />
                        </Campo>
                        <div className="stat">
                            <span className="sm">Frete por unidade ({v.unid} un.)</span>
                            <b>{v.freteU}</b>
                        </div>
                    </div>
                )}

                {v.notC && (
                    <div className="addrow">
                        <div style={{ flex: "1", minWidth: "280px" }}>
                            <p className="flbl">Produto</p>
                            <CampoBusca b={v.cbProd} rotulo="Produto" placeholder="Digite parte do nome ou do código" aoLer={v.abrirLeitor} />
                        </div>
                        <div>
                            <p className="flbl">Qtd</p>
                            <input className="inp numi" type="text" inputMode="numeric" pattern="[0-9]*" value={v.qtd} onChange={v.onQtd} aria-label="Quantidade" style={{ width: "84px", textAlign: "center" }} />
                        </div>
                        {v.isE && (
                            <div>
                                <p className="flbl">Custo/un.</p>
                                <input className="inp" style={{ width: "130px" }} value={v.custoU} onChange={v.onCustoU} placeholder="R$ 0,00" inputMode="decimal" aria-label="Custo por unidade" />
                            </div>
                        )}
                        <button type="button" className="btn pri sq" onClick={v.addItem} aria-label="Adicionar à lista">
                            <Ic n="mais" style={{ strokeWidth: "2.4" }} />
                        </button>
                    </div>
                )}

                {v.isC && <Confeccao v={v} m={false} />}

                {erro}

                {v.notC && (
                    <div>
                        <p className="flbl">Itens do lançamento · {v.nFila}</p>
                        {v.filaVazia && <Vazio texto="Nenhum item ainda." m={false} />}
                        {v.temFila && v.isT && (
                            <div className="gt" role="table" aria-label="Itens" style={cols("minmax(0,2fr) 140px 80px 44px")}>
                                <div className="gh" role="row">
                                    <span role="columnheader">Produto</span>
                                    <span className="r" role="columnheader">
                                        Saldo na origem
                                    </span>
                                    <span className="r" role="columnheader">
                                        Qtd
                                    </span>
                                    <span role="columnheader"></span>
                                </div>
                                {v.filaRows.map((f) => (
                                    <div className="gr" role="row" key={f.k}>
                                        <span className="pn" role="cell">
                                            {f.n}
                                        </span>
                                        <span className="r tx2" role="cell">
                                            {f.sd}
                                        </span>
                                        <span className="r" role="cell">
                                            <b>{f.q}</b>
                                        </span>
                                        <span role="cell">
                                            <button type="button" className="ib" onClick={f.rm} aria-label={`Remover ${f.n}`}>
                                                <Ic n="lixeira" />
                                            </button>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {v.temFila && v.isE && (
                            <>
                                <div className="gt" role="table" aria-label="Itens da entrada" style={cols("minmax(0,2fr) 56px 100px 90px 100px 110px 44px")}>
                                    <div className="gh" role="row">
                                        <span role="columnheader">Produto</span>
                                        <span className="r" role="columnheader">
                                            Qtd
                                        </span>
                                        <span className="r" role="columnheader">
                                            Custo base
                                        </span>
                                        <span className="r" role="columnheader">
                                            Frete/un
                                        </span>
                                        <span className="r" role="columnheader">
                                            Custo final
                                        </span>
                                        <span className="r" role="columnheader">
                                            Total
                                        </span>
                                        <span role="columnheader"></span>
                                    </div>
                                    {v.filaRows.map((f) => (
                                        <div className="gr" role="row" key={f.k}>
                                            <span className="pn" role="cell">
                                                {f.n}
                                            </span>
                                            <span className="r" role="cell">
                                                <b>{f.q}</b>
                                            </span>
                                            <span className="r" role="cell">
                                                {f.base}
                                            </span>
                                            <span className="r" role="cell">
                                                {f.fu}
                                            </span>
                                            <span className="r" role="cell">
                                                {f.fin}
                                            </span>
                                            <span className="r" role="cell" style={{ fontWeight: "800" }}>
                                                {f.tot}
                                            </span>
                                            <span role="cell">
                                                <button type="button" className="ib" onClick={f.rm} aria-label={`Remover ${f.n}`}>
                                                    <Ic n="lixeira" />
                                                </button>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px", fontSize: "15px" }}>
                                    Total da entrada:{" "}
                                    <b>{v.totEntrada}</b>
                                </div>
                            </>
                        )}
                    </div>
                )}

                <Campo rotulo="Observação (opcional)">
                    <input className="inp" value={v.obs} onChange={v.onObs} placeholder="Ex.: NF 123, motivo" aria-label="Observação" />
                </Campo>

                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
                    <button type="button" className="btn" onClick={v.limparMov}>
                        Limpar
                    </button>
                    <button type="button" className="btn pri" onClick={v.pedirConcluir} disabled={v.concluirOff} style={{ minWidth: "200px" }}>
                        {v.concluirLbl}
                    </button>
                </div>
            </div>

            {v.isC && <ConfeccoesRegistradas v={v} m={false} />}
            {v.cmov && <JanelaConfirmar v={v} m={false} />}
            {leitor}
        </section>
    );
}
