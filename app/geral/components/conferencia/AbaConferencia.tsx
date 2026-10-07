"use client";

import React from "react";
import { CampoBusca } from "../ui/BuscaLista";
import { Acordeao, Chave, Segmentado } from "../ui/Controles";
import { Ic } from "../ui/Icones";
import { Janela } from "../ui/Janela";
import { BarcodeScannerModal } from "../ui/LeitorCodigo";
import type { ConferenciasV } from "./useConferencias";

// Aba Conferência: lista (em andamento e concluídas), contagem, revisão e conclusão.

const cols = (c: string) => ({ "--cols": c }) as React.CSSProperties;

function Erro({ v, m }: { v: ConferenciasV; m: boolean }) {
    return v.erro ? (
        <div className="msg-err" role="alert" style={m ? { fontSize: "13px" } : undefined}>
            {v.erro}
        </div>
    ) : null;
}

function NovaConferencia({ v, m }: { v: ConferenciasV; m: boolean }) {
    return (
        <Janela
            m={m}
            titulo="Nova conferência"
            aoFechar={v.fecharNc}
            largura={640}
            rodape={
                <>
                    <button type="button" className="btn" onClick={v.fecharNc}>
                        Cancelar
                    </button>
                    <button type="button" className="btn pri" onClick={v.criarConf} disabled={v.busy}>
                        Criar e começar a contar
                    </button>
                </>
            }
        >
            <div>
                <p className="flbl">Local *</p>
                <CampoBusca b={v.cbNcDep} rotulo="Local" m={m} />
            </div>
            <Acordeao a={v.aNcCat} busca={v.ncCatQ} onBusca={v.onNcCatQ} placeholder="Buscar categoria" itens={v.ncCats} m={m} />
            <Acordeao a={v.aNcFab} busca={v.ncFabQ} onBusca={v.onNcFabQ} placeholder="Buscar fabricante" itens={v.ncFabs} m={m} />
            <Chave ligado={v.ncCega} aoTrocar={v.togCega} rotulo="Contagem cega" alinhar="flex-start">
                <span>
                    <b>Contagem cega</b>
                </span>
            </Chave>
            <Chave ligado={v.ncSem} aoTrocar={v.togSem} rotulo="Incluir itens sem saldo" alinhar="flex-start">
                <span>
                    <b>Incluir produtos sem saldo neste local</b>
                </span>
            </Chave>
            <Erro v={v} m={m} />
        </Janela>
    );
}

function ConcluirConferencia({ v, m }: { v: ConferenciasV; m: boolean }) {
    return (
        <Janela
            m={m}
            titulo={`Concluir ${v.cCod}`}
            sub={`${v.cNDiv} itens com diferença · falta ${v.cFalta} · sobra ${v.cSobra}`}
            aoFechar={v.fecharConcluirConf}
            rodape={
                <>
                    <button type="button" className="btn" onClick={v.concluirSemAjuste} disabled={v.busy}>
                        Concluir sem ajustar
                    </button>
                    {v.temDiv && (
                        <button type="button" className="btn pri" onClick={v.concluirComAjuste} disabled={v.busy}>
                            Concluir e ajustar saldos
                        </button>
                    )}
                </>
            }
        />
    );
}

function Celular({ v }: { v: ConferenciasV }) {
    return (
        <section style={{ display: "flex", flexDirection: "column", gap: "10px" }} aria-label="Conferência">
            {v.cLista && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <button type="button" className="btn pri" onClick={v.abrirNc}>
                        + Nova conferência
                    </button>
                    <Erro v={v} m />
                    <p className="grp-t" style={{ margin: "4px 0 0" }}>
                        Em andamento
                    </p>
                    {v.abertas.map((a) => (
                        <button type="button" key={a.id} className="cadc" onClick={a.abrir} style={{ flexDirection: "column", alignItems: "stretch", gap: "6px", padding: "12px" }}>
                            <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <b style={{ flex: "1" }}>
                                    {a.cod} · {a.dep}
                                </b>
                                <span className="tag t-TRANSFERENCIA">{a.stl}</span>
                            </span>
                            <span className="cbx">{a.cats}</span>
                            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span className="pbar">
                                    <span style={{ width: a.pct }}></span>
                                </span>
                                <span className="cbx">{a.prog}</span>
                            </span>
                        </button>
                    ))}
                    {!v.temAbertas && (
                        <div style={{ padding: "14px", border: "1.5px dashed var(--line2)", borderRadius: "14px", textAlign: "center", fontSize: "13px" }} className="sm">
                            Nenhuma em andamento.
                        </div>
                    )}
                    <p className="grp-t" style={{ margin: "8px 0 0" }}>
                        Concluídas
                    </p>
                    {v.concluidas.map((c) => (
                        <button type="button" key={c.id} className="cadc" onClick={c.ver} style={{ flexDirection: "column", alignItems: "stretch", gap: "2px", padding: "10px 12px", minHeight: "0" }}>
                            <span style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                                <b style={{ fontSize: "14px" }}>
                                    {c.cod} · {c.dep}
                                </b>
                                <span className="sm">{c.acc}</span>
                            </span>
                            <span className="cbx">
                                {c.dt} · {c.u} · {c.it} itens · dif. {c.dif} · {c.aj || "Sem ajuste"}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {v.cVerOn && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button type="button" className="xb" onClick={v.fecharVer} aria-label="Voltar às conferências">
                            <Ic n="esquerda" />
                        </button>
                        <div style={{ flex: "1", minWidth: "0" }}>
                            <b>
                                {v.cvCod} · {v.cvDep}
                            </b>
                            <div className="cbx">{v.cvU}</div>
                        </div>
                        <span className="tag ok">Concluída</span>
                    </div>
                    <div className="cbx">
                        {v.cvCats} · {v.cvAj}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "6px" }}>
                        {[
                            ["Sistema", v.cvSis],
                            ["Contado", v.cvFi],
                            ["Diferença", v.cvDif],
                        ].map(([l, x]) => (
                            <div className="stat" style={{ padding: "8px 10px" }} key={l}>
                                <span className="sm" style={{ fontSize: "11.5px" }}>
                                    {l}
                                </span>
                                <b style={{ fontSize: "15px" }}>{x}</b>
                            </div>
                        ))}
                    </div>
                    {v.cvTemDet && (
                        <>
                            <Segmentado opcoes={v.cvFil} />
                            <div className="box" style={{ overflow: "hidden" }}>
                                {v.cvRows.map((r, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
                                        <div style={{ flex: "1", minWidth: "0" }}>
                                            <div className="pn" style={{ fontSize: "13px" }}>
                                                {r.n}
                                            </div>
                                            <div className="cbx">
                                                Sistema {r.sis} · contado {r.fi}
                                            </div>
                                        </div>
                                        {r.ok && <span className="tag ok">Confere</span>}
                                        {r.diff && <span className="tag dif">{r.st}</span>}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {v.cAberta && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button type="button" className="xb" onClick={v.voltarLista} aria-label="Voltar às conferências">
                            <Ic n="esquerda" />
                        </button>
                        <div style={{ flex: "1", minWidth: "0" }}>
                            <b>
                                {v.cCod} · {v.cDep}
                            </b>
                            <div className="cbx">{v.cSalvo}</div>
                        </div>
                        {v.cCont && (
                            <button type="button" className="btn" onClick={v.abrirLeitor} style={{ height: "44px", padding: "0 12px", fontSize: "14px" }}>
                                Bipar +1
                            </button>
                        )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span className="pbar">
                            <span style={{ width: v.cPct }}></span>
                        </span>
                        <b style={{ fontSize: "13px", whiteSpace: "nowrap" }}>{v.cProg}</b>
                    </div>
                    {v.cRev && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "6px" }}>
                            {[
                                ["Diferenças", v.cNDiv],
                                ["Falta", v.cFalta],
                                ["Sobra", v.cSobra],
                            ].map(([l, x]) => (
                                <div className="stat" style={{ padding: "8px 10px" }} key={l}>
                                    <span className="sm" style={{ fontSize: "11.5px" }}>
                                        {l}
                                    </span>
                                    <b style={{ fontSize: "15px" }}>{x}</b>
                                </div>
                            ))}
                        </div>
                    )}
                    <Segmentado opcoes={v.cFil} className="seg4" />
                    <div className="box" style={{ overflow: "hidden" }}>
                        {v.cRows.map((r) => (
                            <div key={String(r.id)} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
                                <div style={{ flex: "1", minWidth: "0" }}>
                                    <div className="pn" style={{ fontSize: "13.5px" }}>
                                        {r.n}
                                    </div>
                                    <div className="cbx" style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px", flexWrap: "wrap" }}>
                                        {r.mostraSis && <>Sistema {r.sis}</>}
                                        {r.mostraSis && (
                                            <>
                                                {r.ok && <span className="tag ok">Confere</span>}
                                                {r.diff && <span className="tag dif">{r.st}</span>}
                                            </>
                                        )}
                                        {v.cRev && r.diff && (
                                            <button type="button" className="lnk" onClick={r.recontar}>
                                                Recontar
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <input
                                    className="inp numi"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={r.v}
                                    onChange={r.onV}
                                    aria-label={`Quantidade contada de ${r.n}`}
                                    style={{ width: "72px", textAlign: "center", fontSize: "16px" }}
                                />
                            </div>
                        ))}
                    </div>
                    <Erro v={v} m />
                    {v.cCont && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "8px" }}>
                            <button type="button" className="btn" onClick={v.voltarLista}>
                                Salvar e sair
                            </button>
                            <button type="button" className="btn pri" onClick={v.irRevisao}>
                                Revisar
                            </button>
                        </div>
                    )}
                    {v.cRev && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "8px" }}>
                            <button type="button" className="btn" onClick={v.voltarContagem}>
                                Recontar
                            </button>
                            <button type="button" className="btn pri" onClick={v.pedirConcluirConf}>
                                Concluir
                            </button>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

function Computador({ v }: { v: ConferenciasV }) {
    return (
        <section style={{ display: "flex", flexDirection: "column", gap: "16px" }} aria-label="Conferência">
            {v.cLista && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ flex: "1" }}>
                            <h2 style={{ margin: "0", fontSize: "19px", fontWeight: "800" }}>Conferências</h2>
                        </div>
                        <button type="button" className="btn pri" onClick={v.abrirNc}>
                            <Ic n="mais" style={{ strokeWidth: "2.2" }} />
                            Nova conferência
                        </button>
                    </div>
                    <Erro v={v} m={false} />
                    <div>
                        <p className="grp-t">Em andamento</p>
                        {v.temAbertas ? (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px" }}>
                                {v.abertas.map((a) => (
                                    <button type="button" key={a.id} className="cadc" onClick={a.abrir} style={{ alignItems: "flex-start", flexDirection: "column", gap: "8px" }}>
                                        <span style={{ display: "flex", width: "100%", alignItems: "center", gap: "8px" }}>
                                            <b style={{ fontSize: "16px", flex: "1" }}>
                                                {a.cod} · {a.dep}
                                            </b>
                                            <span className="tag t-TRANSFERENCIA">{a.stl}</span>
                                        </span>
                                        <span className="sm">
                                            {a.cats} · aberta em {a.dt} por {a.u}
                                        </span>
                                        <span style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%" }}>
                                            <span className="pbar">
                                                <span style={{ width: a.pct }}></span>
                                            </span>
                                            <span className="sm" style={{ whiteSpace: "nowrap" }}>
                                                {a.prog}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div style={{ padding: "18px", border: "1.5px dashed var(--line2)", borderRadius: "14px", textAlign: "center" }} className="sm">
                                Nenhuma conferência em andamento.
                            </div>
                        )}
                    </div>
                    <div>
                        <p className="grp-t">Concluídas</p>
                        <div className="gt" role="table" aria-label="Conferências concluídas" style={cols("140px 130px minmax(0,1.4fr) 70px 80px 90px minmax(0,1fr) 120px")}>
                            <div className="gh" role="row">
                                <span role="columnheader">Conferência</span>
                                <span role="columnheader">Local</span>
                                <span role="columnheader">O que conferiu</span>
                                <span className="r" role="columnheader">
                                    Itens
                                </span>
                                <span className="r" role="columnheader">
                                    Dif. (un)
                                </span>
                                <span className="r" role="columnheader">
                                    Acerto
                                </span>
                                <span role="columnheader">Ajuste</span>
                                <span role="columnheader">Data</span>
                            </div>
                            {v.concluidas.map((c) => (
                                <button type="button" key={c.id} className="gr hov rowbtn2" onClick={c.ver} aria-label={`Abrir ${c.cod}`}>
                                    <span className="pn" role="cell">
                                        {c.cod}
                                    </span>
                                    <span role="cell" style={{ fontWeight: "700" }}>
                                        {c.dep}
                                    </span>
                                    <span className="tx2" role="cell">
                                        {c.cats}
                                    </span>
                                    <span className="r" role="cell">
                                        {c.it}
                                    </span>
                                    <span className="r" role="cell">
                                        <b>{c.dif}</b>
                                    </span>
                                    <span className="r" role="cell">
                                        {c.acc}
                                    </span>
                                    <span role="cell">{c.temAj ? <span className="tag ok">{c.aj}</span> : <span className="tx2">Sem ajuste</span>}</span>
                                    <span className="tx2" role="cell">
                                        {c.dt} · {c.u}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {v.cVerOn && (
                <div className="box" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                        <button type="button" className="btn" onClick={v.fecharVer} style={{ padding: "0 12px" }}>
                            <Ic n="esquerda" />
                            Conferências
                        </button>
                        <div style={{ flex: "1", minWidth: "260px" }}>
                            <h2 style={{ margin: "0", fontSize: "19px", fontWeight: "800" }}>
                                {v.cvCod} · {v.cvDep}
                            </h2>
                            <p className="sm" style={{ margin: "2px 0 0" }}>
                                {v.cvCats} · {v.cvU} · {v.cvAj}
                            </p>
                        </div>
                        <span className="tag ok">Concluída</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "10px" }}>
                        {[
                            ["Itens conferidos", v.cvIt],
                            ["Unidades no sistema", v.cvSis],
                            ["Unidades contadas", v.cvFi],
                            ["Diferença (un)", v.cvDif],
                        ].map(([l, x]) => (
                            <div className="stat" key={l}>
                                <span className="sm">{l}</span>
                                <b>{x}</b>
                            </div>
                        ))}
                    </div>
                    {v.cvTemDet && (
                        <>
                            <div style={{ display: "flex", gap: "6px" }}>
                                {v.cvFil.map((f) => (
                                    <button type="button" key={f.l} className="fchip" aria-pressed={f.on} onClick={f.go}>
                                        {f.l}
                                    </button>
                                ))}
                            </div>
                            <div className="gt" role="table" aria-label="Itens da conferência" style={cols("minmax(0,2fr) 100px 100px 100px 130px")}>
                                <div className="gh" role="row">
                                    <span role="columnheader">Produto</span>
                                    <span className="r" role="columnheader">
                                        Sistema
                                    </span>
                                    <span className="r" role="columnheader">
                                        Contado
                                    </span>
                                    <span className="r" role="columnheader">
                                        Diferença
                                    </span>
                                    <span role="columnheader">Situação</span>
                                </div>
                                {v.cvRows.map((r, i) => (
                                    <div className="gr" role="row" style={{ minHeight: "48px" }} key={i}>
                                        <span className="pn" role="cell">
                                            {r.n}
                                        </span>
                                        <span className="r" role="cell">
                                            {r.sis}
                                        </span>
                                        <span className="r" role="cell">
                                            {r.fi}
                                        </span>
                                        <span className="r" role="cell">
                                            <b>{r.dif}</b>
                                        </span>
                                        <span role="cell">
                                            {r.ok && <span className="tag ok">Confere</span>}
                                            {r.diff && <span className="tag dif">{r.st}</span>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                                <button type="button" className="btn" onClick={v.pdfVer}>
                                    Imprimir / PDF
                                </button>
                                <button type="button" className="btn" onClick={v.csvVer}>
                                    Exportar CSV
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {v.cAberta && (
                <div className="box" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                        <button type="button" className="btn" onClick={v.voltarLista} style={{ padding: "0 12px" }}>
                            <Ic n="esquerda" />
                            Conferências
                        </button>
                        <div style={{ flex: "1", minWidth: "260px" }}>
                            <h2 style={{ margin: "0", fontSize: "19px", fontWeight: "800" }}>
                                {v.cCod} · {v.cDep}
                            </h2>
                            <p className="sm" style={{ margin: "2px 0 0" }}>
                                {v.cCats} · {v.cSalvo}
                            </p>
                        </div>
                        <button type="button" className="btn" onClick={v.imprimirLista}>
                            Imprimir lista
                        </button>
                        {v.cCont && (
                            <button type="button" className="btn" onClick={v.abrirLeitor}>
                                <Ic n="leitor" />
                                Bipar (+1)
                            </button>
                        )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span className="pbar" style={{ height: "10px" }}>
                            <span style={{ width: v.cPct }}></span>
                        </span>
                        <b style={{ whiteSpace: "nowrap" }}>{v.cProg}</b>
                    </div>
                    {v.cRev && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "10px" }}>
                            {[
                                ["Itens com diferença", v.cNDiv],
                                ["Falta (a custo)", v.cFalta],
                                ["Sobra (a custo)", v.cSobra],
                                ["Itens sem diferença", v.cAcc],
                            ].map(([l, x]) => (
                                <div className="stat" key={l}>
                                    <span className="sm">{l}</span>
                                    <b>{x}</b>
                                </div>
                            ))}
                        </div>
                    )}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {v.cFil.map((f) => (
                            <button type="button" key={f.l} className="fchip" aria-pressed={f.on} onClick={f.go}>
                                {f.l}
                            </button>
                        ))}
                    </div>
                    <div className="gt" role="table" aria-label="Itens da conferência" style={cols("minmax(0,2fr) 90px 120px 90px 120px 110px")}>
                        <div className="gh" role="row">
                            <span role="columnheader">Produto</span>
                            <span className="r" role="columnheader">
                                Sistema
                            </span>
                            <span className="r" role="columnheader">
                                Contado
                            </span>
                            <span className="r" role="columnheader">
                                Diferença
                            </span>
                            <span role="columnheader">Situação</span>
                            <span role="columnheader"></span>
                        </div>
                        {v.cRows.map((r) => (
                            <div className="gr" role="row" key={String(r.id)}>
                                <span role="cell">
                                    <span className="pn" style={{ display: "block" }}>
                                        {r.n}
                                    </span>
                                    <span className="cbx" style={{ display: "block" }}>
                                        CB {r.cb}
                                    </span>
                                </span>
                                <span className="r" role="cell">
                                    {r.mostraSis && <>{r.sis}</>}
                                    {v.cCega && v.cCont && <span className="tx2">oculto</span>}
                                </span>
                                <span className="r" role="cell">
                                    <input
                                        className="inp numi"
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={r.v}
                                        onChange={r.onV}
                                        placeholder="—"
                                        aria-label={`Quantidade contada de ${r.n}`}
                                        style={{ height: "40px", width: "96px", display: "inline-block", textAlign: "center" }}
                                    />
                                </span>
                                <span className="r" role="cell">
                                    {r.mostraSis && <b>{r.dif}</b>}
                                </span>
                                <span role="cell">
                                    {r.pend && <span className="tag pend">Pendente</span>}
                                    {r.tem && r.mostraSis && (
                                        <>
                                            {r.ok && <span className="tag ok">Confere</span>}
                                            {r.diff && <span className="tag dif">{r.st}</span>}
                                        </>
                                    )}
                                    {v.cCont && v.cCega && r.tem && <span className="tag ok">Contado</span>}
                                </span>
                                <span role="cell">
                                    {v.cRev && r.diff && (
                                        <button type="button" className="lnk" onClick={r.recontar}>
                                            Recontar
                                        </button>
                                    )}
                                </span>
                            </div>
                        ))}
                        {v.cVazio && (
                            <div style={{ padding: "24px", textAlign: "center" }} className="sm">
                                Nenhum item neste filtro.
                            </div>
                        )}
                    </div>
                    <Erro v={v} m={false} />
                    <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
                        {v.cCont && (
                            <>
                                <button type="button" className="btn" onClick={v.voltarLista}>
                                    Salvar e sair
                                </button>
                                <button type="button" className="btn pri" onClick={v.irRevisao}>
                                    Revisar diferenças
                                </button>
                            </>
                        )}
                        {v.cRev && (
                            <>
                                <button type="button" className="btn" onClick={v.voltarContagem}>
                                    Voltar à contagem
                                </button>
                                <button type="button" className="btn pri" onClick={v.pedirConcluirConf}>
                                    Concluir conferência
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}

export function AbaConferencia({ v, m }: { v: ConferenciasV; m: boolean }) {
    return (
        <>
            {m ? <Celular v={v} /> : <Computador v={v} />}
            {v.ncOpen && <NovaConferencia v={v} m={m} />}
            {v.cConcluir && <ConcluirConferencia v={v} m={m} />}
            <BarcodeScannerModal open={v.scan} title="Bipar produto" onClose={v.fecharLeitor} onDetected={v.bipar} />
        </>
    );
}
