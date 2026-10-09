"use client";

import React, { useEffect, useRef } from "react";

import { Ic } from "../ui/Icones";

import type { HistoricoV } from "./useHistorico";

// BUILD DO HISTÓRICO: HISTORICO-PAGINACAO-2026-10-09-V4

// data-historico-build permite comprovar no DevTools que esta versão do componente foi publicada.

// A paginação aparece apenas quando a API devolve total numérico.

// Aba Histórico: um lançamento por linha; ao abrir, a tabela de itens do lançamento.

type Linha = HistoricoV["histRows"][number];

function Itens({ h, m }: { h: Linha; m: boolean }) {

    const gh: React.CSSProperties | undefined = m ? { gap: "6px", padding: "6px 10px", fontSize: "10.5px" } : undefined;

    const gr: React.CSSProperties = m ? { gap: "6px", padding: "6px 10px", minHeight: "0", fontSize: "12.5px" } : { minHeight: "42px" };

    const tab = (cols: string, maxW?: string) => ({ "--cols": cols, maxWidth: m ? undefined : maxW }) as React.CSSProperties;

    return (

        <>

            {h.comLocal && (

                <div className="gt" role="table" aria-label="Itens" style={tab(m ? "minmax(0,1fr) 92px 30px" : "minmax(0,2fr) minmax(0,1fr) 90px", "720px")}>

                    <div className="gh" role="row" style={gh}>

                        <span role="columnheader">Item</span>

                        <span role="columnheader">Local</span>

                        <span className="r" role="columnheader">

                            Qtd

                        </span>

                    </div>

                    {h.itens.map((i, k) => (

                        <div className="gr" role="row" style={gr} key={k}>

                            <span className="pn" role="cell">

                                {i.n}

                            </span>

                            <span className="tx2" role="cell" style={m ? { fontSize: "11.5px" } : undefined}>

                                {i.local}

                            </span>

                            <span className="r" role="cell">

                                <b>{i.q}</b>

                            </span>

                        </div>

                    ))}

                </div>

            )}

            {h.comCusto && (

                <div className="gt" role="table" aria-label="Itens da entrada" style={tab(m ? "minmax(0,1fr) 30px 70px 76px" : "minmax(0,2fr) 80px 150px 130px", "760px")}>

                    <div className="gh" role="row" style={gh}>

                        <span role="columnheader">Item</span>

                        <span className="r" role="columnheader">

                            Qtd

                        </span>

                        <span className="r" role="columnheader">

                            {m ? "Custo un." : "Custo unit. (c/ frete)"}

                        </span>

                        <span className="r" role="columnheader">

                            Total

                        </span>

                    </div>

                    {h.itens.map((i, k) => (

                        <div className="gr" role="row" style={gr} key={k}>

                            <span className="pn" role="cell">

                                {i.n}

                            </span>

                            <span className="r" role="cell">

                                <b>{i.q}</b>

                            </span>

                            <span className="r" role="cell">

                                {i.cu}

                            </span>

                            <span className="r" role="cell">

                                {i.tot}

                            </span>

                        </div>

                    ))}

                    {h.temFrete && (

                        <div className="gr" role="row" style={m ? { ...gr, fontSize: "12px" } : gr}>

                            <span className="tx2" role="cell">

                                {m ? "Frete rateado" : "Frete rateado nos itens"}

                            </span>

                            <span role="cell"></span>

                            <span role="cell"></span>

                            <span className="r tx2" role="cell">

                                {h.frete}

                            </span>

                        </div>

                    )}

                    <div className="gr" role="row" style={{ ...gr, minHeight: m ? "0" : "44px", background: "var(--card)" }}>

                        <span className="pn" role="cell">

                            {m ? "Total" : "Total da entrada"}

                        </span>

                        <span className="r" role="cell">

                            <b>{h.totQ}</b>

                        </span>

                        <span role="cell"></span>

                        <span className="r" role="cell" style={{ fontWeight: "800" }}>

                            {h.totV}

                        </span>

                    </div>

                </div>

            )}

            {h.comES && (

                <div className="gt" role="table" aria-label="Itens" style={tab(m ? "minmax(0,1fr) 40px" : "minmax(0,2fr) 90px", "620px")}>

                    <div className="gh" role="row" style={gh}>

                        <span role="columnheader">Item</span>

                        <span className="r" role="columnheader">

                            Qtd

                        </span>

                    </div>

                    {h.secs.map((g, k) => (

                        <React.Fragment key={k}>

                            <div className="gsec" role="row" style={m ? { padding: "6px 10px", fontSize: "10.5px" } : undefined}>

                                <span role="cell">{g.t}</span>

                            </div>

                            {g.itens.map((i, j) => (

                                <div className="gr" role="row" style={gr} key={j}>

                                    <span className="pn" role="cell">

                                        {i.n}

                                    </span>

                                    <span className="r" role="cell">

                                        <b>{i.q}</b>

                                    </span>

                                </div>

                            ))}

                        </React.Fragment>

                    ))}

                </div>

            )}

            {h.semLocal && (

                <div className="gt" role="table" aria-label="Itens" style={tab(m ? "minmax(0,1fr) 40px" : "minmax(0,2fr) 90px", "620px")}>

                    <div className="gh" role="row" style={gh}>

                        <span role="columnheader">Item</span>

                        <span className="r" role="columnheader">

                            Qtd

                        </span>

                    </div>

                    {h.itens.map((i, k) => (

                        <div className="gr" role="row" style={gr} key={k}>

                            <span className="pn" role="cell">

                                {i.n}

                            </span>

                            <span className="r" role="cell">

                                <b>{i.q}</b>

                            </span>

                        </div>

                    ))}

                </div>

            )}

        </>

    );

}

// Período (De/Até + atalhos) e paginação (09/10/2026).

function Periodo({ v, m }: { v: HistoricoV; m: boolean }) {

    const campo: React.CSSProperties = m ? { height: "48px", fontSize: "16px" } : { height: "44px", fontSize: "14px", width: "170px" };

    const datas = (

        <>

            <label style={m ? { minWidth: "0" } : { display: "flex", alignItems: "center", gap: "8px" }}>

                <span className="kv" style={m ? { display: "block", marginBottom: "4px" } : undefined}>

                    De

                </span>

                <input type="date" className="inp" value={v.hIni} max={v.hFim || undefined} onChange={v.onIni} aria-label="Data inicial" style={campo} />

            </label>

            <label style={m ? { minWidth: "0" } : { display: "flex", alignItems: "center", gap: "8px" }}>

                <span className="kv" style={m ? { display: "block", marginBottom: "4px" } : undefined}>

                    Até

                </span>

                <input type="date" className="inp" value={v.hFim} min={v.hIni || undefined} onChange={v.onFim} aria-label="Data final" style={campo} />

            </label>

        </>

    );

    const atalhos = (

        <div style={{ display: "flex", gap: "6px", flexWrap: m ? "nowrap" : "wrap", overflowX: m ? "auto" : undefined }} role="group" aria-label="Período">

            {v.hperiodos.map((p) => (

                <button type="button" key={p.k} className="fchip" aria-pressed={p.sel} onClick={p.go} style={m ? { height: "44px", fontSize: "13px", padding: "0 14px", flex: "none" } : undefined}>

                    {p.l}

                </button>

            ))}

        </div>

    );

    if (m) {

        return (

            <>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "8px" }}>{datas}</div>

                {atalhos}

            </>

        );

    }

    return (

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>

            {datas}

            {atalhos}

        </div>

    );

}

// Paginação visual no mesmo padrão da aba Produtos.
// A quantidade é fixa em 100 movimentos; os registros são buscados no servidor.
function Paginacao({ v, m }: { v: HistoricoV; m: boolean }) {
    // Enquanto o PHP não devolver `total`, não há como calcular o número real de páginas.
    // O erro da integração é mostrado acima da tabela; jamais inventamos páginas.
    if (!v.temPaginas) return null;

    return (
        <nav
            aria-label="Paginação do histórico"
            className="sm"
            style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}
        >
            <span>Movimentos por página</span>
            <span className="inp" aria-label="100 movimentos por página" style={{ width: "64px", minHeight: "40px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>100</span>
            <button type="button" className="ib" onClick={v.voltar} disabled={!v.podeVoltar} aria-label="Página anterior" title="Página anterior">
                <Ic n="esquerda" />
            </button>
            <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>Página {v.pagina} de {v.paginas}</span>
            <button type="button" className="ib" onClick={v.avancar} disabled={!v.podeAvancar} aria-label="Próxima página" title="Próxima página">
                <Ic n="direita" />
            </button>
            {!m && <span style={{ marginLeft: "6px", whiteSpace: "nowrap" }}>{v.resumoPag}</span>}
        </nav>
    );
}

export function AbaHistorico({ v, m }: { v: HistoricoV; m: boolean }) {

    // Ao trocar de página, volta para o topo da lista.

    const topo = useRef<HTMLElement | null>(null);

    const paginaAnterior = useRef(v.pagina);

    useEffect(() => {

        if (paginaAnterior.current === v.pagina) return;

        paginaAnterior.current = v.pagina;

        topo.current?.scrollIntoView({ block: "start", behavior: "smooth" });

    }, [v.pagina]);

    const avisoServidor = v.semPeriodoNoServidor ? (

        <div className="msg-err" role="status">

            O servidor ainda não tem o filtro de período: suba o materiais_gerais.php novo. Por enquanto aparecem só os movimentos mais recentes.

        </div>

    ) : null;

    const erro = v.erro ? (

        <div className="msg-err" role="alert">

            {v.erro}

        </div>

    ) : null;

    const carregando = v.carregando && !v.histRows.length ? <div className="sm">Carregando…</div> : null;

    if (m) {

        return (

            <section ref={topo} data-historico-build="HISTORICO-PAGINACAO-2026-10-09-V4" style={{ display: "flex", flexDirection: "column", gap: "10px", scrollMarginTop: "12px" }} aria-label="Histórico">

                <label className="cbin">

                    <Ic n="busca" />

                    <input type="search" value={v.hb} onChange={v.onHb} placeholder="Lançamento, produto ou nome" aria-label="Buscar no histórico" style={{ fontSize: "16px" }} />

                </label>

                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>

                    {v.htipos.map((h) => (

                        <button type="button" key={h.k} className="fchip" aria-pressed={h.sel} onClick={h.go} style={{ height: "36px", fontSize: "13px", padding: "0 12px" }}>

                            {h.l}

                        </button>

                    ))}

                </div>

                <Periodo v={v} m />

                {avisoServidor}

                {erro}

                {carregando}

                <div className="box" style={{ overflow: "hidden", opacity: v.carregando && v.histRows.length ? 0.55 : undefined }}>

                    {v.histRows.map((h) => (

                        <div key={h.chave} style={{ borderBottom: "1px solid var(--line)" }}>

                            <button type="button" className="rowlink" onClick={h.go} style={{ padding: "10px 12px", flexDirection: "column", alignItems: "stretch", gap: "3px" }}>

                                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>

                                    <span className={`tag ${h.tc}`}>{h.tl}</span>

                                    <b style={{ flex: "1", fontSize: "13.5px" }}>{h.cod}</b>

                                    <span className="cbx">{h.n}</span>

                                </span>

                                <span className="cbx">

                                    {h.dt} · {h.u} · {h.rota}

                                </span>

                            </button>

                            {h.aberto && (

                                <div style={{ padding: "0 12px 12px" }}>

                                    <Itens h={h} m />

                                </div>

                            )}

                        </div>

                    ))}

                    {v.vazioHist && (

                        <div style={{ padding: "20px", textAlign: "center" }} className="sm">

                            Nada encontrado no período.

                        </div>

                    )}

                </div>

                <Paginacao v={v} m />

            </section>

        );

    }

    return (

        <section ref={topo} data-historico-build="HISTORICO-PAGINACAO-2026-10-09-V4" className="box" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", scrollMarginTop: "16px" }} aria-label="Histórico">

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>

                <label

                    style={{

                        flex: "1",

                        minWidth: "260px",

                        height: "44px",

                        borderRadius: "12px",

                        background: "var(--field)",

                        display: "flex",

                        alignItems: "center",

                        gap: "10px",

                        padding: "0 14px",

                        boxSizing: "border-box",

                        color: "var(--text2)",

                    }}

                >

                    <Ic n="busca" />

                    <input

                        type="search"

                        value={v.hb}

                        onChange={v.onHb}

                        placeholder="Lançamento, produto, depósito ou requisição"

                        aria-label="Buscar no histórico"

                        style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", fontFamily: "inherit", fontSize: "14px", color: "var(--text)", outline: "none" }}

                    />

                </label>

                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>

                    {v.htipos.map((h) => (

                        <button type="button" key={h.k} className="fchip" aria-pressed={h.sel} onClick={h.go}>

                            {h.l}

                        </button>

                    ))}

                </div>

            </div>

            <Periodo v={v} m={false} />

            {avisoServidor}

            {erro}

            {carregando}

            <div

                className="gt"

                role="table"

                aria-label="Lançamentos"

                style={{ "--cols": "150px 110px 120px minmax(0,1.6fr) minmax(0,1.4fr) 110px", opacity: v.carregando && v.histRows.length ? 0.55 : undefined } as React.CSSProperties}

            >

                <div className="gh" role="row">

                    <span role="columnheader">Lançamento</span>

                    <span role="columnheader">Quando</span>

                    <span role="columnheader">Tipo</span>

                    <span role="columnheader">Itens</span>

                    <span role="columnheader">Origem → destino</span>

                    <span role="columnheader">Por</span>

                </div>

                {v.histRows.map((h) => (

                    <div key={h.chave}>

                        <button type="button" className="gr hov rowbtn2" onClick={h.go} aria-expanded={h.aberto}>

                            <span className="pn">{h.cod}</span>

                            <span className="tx2">{h.dt}</span>

                            <span>

                                <span className={`tag ${h.tc}`}>{h.tl}</span>

                            </span>

                            <span>

                                <b>{h.n}</b> <span className="tx2">· {h.resumo}</span>

                            </span>

                            <span className="tx2">{h.rota}</span>

                            <span className="tx2">{h.u}</span>

                        </button>

                        {h.aberto && (

                            <div style={{ padding: "10px 14px 14px", background: "var(--sunk)" }}>

                                <Itens h={h} m={false} />

                            </div>

                        )}

                    </div>

                ))}

                {v.vazioHist && (

                    <div style={{ padding: "28px", textAlign: "center" }} className="sm">

                        Nada encontrado no período.

                    </div>

                )}

            </div>

            <Paginacao v={v} m={false} />

        </section>

    );

}
