"use client";

import React from "react";
import { Ic } from "../ui/Icones";
import { Janela } from "../ui/Janela";
import type { AbaProdutosV } from "./useAbaProdutos";

// Aba Produtos (mockup "Repaginada do app PAI", quadros EstoqueAbas e EstoqueAbasCelular).

type Acoes = {
    novoProduto: () => void;
    expCSV: () => void;
    expXLS: () => void;
    expPDF: () => void;
    expTAG: () => void;
};

function Miniatura({ foto, m }: { foto: string | null; m?: boolean }) {
    return (
        <span className="thumb">
            {foto ? <img src={foto} alt="" loading="lazy" /> : <Ic n="caixa" style={m ? { width: "18px", height: "18px" } : undefined} />}
        </span>
    );
}

function Chips({ v }: { v: AbaProdutosV }) {
    if (!v.temChips) return null;
    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
            {v.chips.map((c, i) => (
                <span className="fx" key={i}>
                    {c.l}
                    <button type="button" onClick={c.x} aria-label={`Tirar filtro ${c.l}`}>
                        <Ic n="fechar" />
                    </button>
                </span>
            ))}
            <button type="button" className="lnk" onClick={v.limparTudo} style={{ marginLeft: "4px" }}>
                Limpar tudo
            </button>
        </div>
    );
}

function Paginacao({ v }: { v: AbaProdutosV }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }} className="sm">
            Itens por página{" "}
            <select className="inp" aria-label="Itens por página" style={{ width: "90px", height: "40px", fontSize: "14px" }} value={v.tamanhoPagina} onChange={v.onTamanhoPagina}>
                {v.tamanhos.map((t) => (
                    <option key={t.k} value={t.k}>
                        {t.l}
                    </option>
                ))}
            </select>
            {v.paginas > 1 ? (
                <button type="button" className="ib" onClick={v.paginaAnterior} disabled={v.pagina <= 1} aria-label="Página anterior">
                    <Ic n="esquerda" />
                </button>
            ) : null}
            <span style={{ marginLeft: v.paginas > 1 ? 0 : "8px" }}>
                Página {v.pagina} de {v.paginas}
            </span>
            {v.paginas > 1 ? (
                <button type="button" className="ib" onClick={v.paginaSeguinte} disabled={v.pagina >= v.paginas} aria-label="Próxima página">
                    <Ic n="direita" />
                </button>
            ) : null}
        </div>
    );
}

function MenuExportar({ v, a }: { v: AbaProdutosV; a: Acoes }) {
    const ir = (f: () => void) => () => {
        v.fecharExp();
        f();
    };
    return (
        <div className="menu" role="menu">
            <button type="button" className="mi" role="menuitem" onClick={ir(a.expCSV)}>
                Planilha CSV
            </button>
            <button type="button" className="mi" role="menuitem" onClick={ir(a.expXLS)}>
                Excel (3 abas)
            </button>
            <button type="button" className="mi" role="menuitem" onClick={ir(a.expPDF)}>
                PDF da lista
            </button>
            <button type="button" className="mi" role="menuitem" onClick={ir(a.expTAG)}>
                Etiquetas em PDF (TAG)
            </button>
        </div>
    );
}

export function AbaProdutos({ v, a, m }: { v: AbaProdutosV; a: Acoes; m: boolean }) {
    if (m) {
        return (
            <section style={{ display: "flex", flexDirection: "column", gap: "10px" }} aria-label="Produtos">
                <div style={{ display: "flex", gap: "8px" }}>
                    <label className="cbin">
                        <Ic n="busca" />
                        <input type="search" value={v.busca} onChange={v.onBusca} placeholder="Nome ou código" aria-label="Pesquisar produto" style={{ fontSize: "16px" }} />
                    </label>
                    <button type="button" className="btn sq" onClick={v.abrirFiltros} aria-label="Filtros" style={{ position: "relative" }}>
                        <Ic n="filtro" style={{ width: "20px", height: "20px" }} />
                        {v.temFiltros && (
                            <span className="cnt cnt-on" style={{ position: "absolute", top: "-6px", right: "-6px" }}>
                                {v.nFiltros}
                            </span>
                        )}
                    </button>
                    <button type="button" className="btn sq" onClick={v.toggleExp} aria-label="Exportar">
                        <Ic n="baixar" style={{ width: "20px", height: "20px" }} />
                    </button>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <button type="button" className="alr" onClick={v.verAlertas} style={{ flex: "1", justifyContent: "center", height: "44px", fontSize: "13.5px" }}>
                        {v.alertas} para repor
                    </button>
                    <button type="button" className="btn pri" onClick={a.novoProduto} style={{ flex: "1", height: "44px", fontSize: "14px" }}>
                        + Novo produto
                    </button>
                </div>
                <Chips v={v} />
                <span className="sm" style={{ fontSize: "12px" }}>
                    {v.resumoProd}
                </span>
                <div className="box" style={{ overflow: "hidden" }}>
                    {v.prodRows.map((p) => (
                        <button
                            type="button"
                            key={p.id}
                            className="rowlink"
                            onClick={p.open}
                            style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)", minHeight: "62px", boxSizing: "border-box" }}
                        >
                            <Miniatura foto={p.foto} m />
                            <span style={{ flex: "1", minWidth: "0" }}>
                                <span style={{ display: "block", fontSize: "14px" }}>
                                    <span className="pn">{p.n}</span>
                                </span>
                                <span className="cbx" style={{ display: "block" }}>
                                    Custo {p.custo} · Venda {p.venda}
                                </span>
                            </span>
                            <b style={{ fontSize: "16px", minWidth: "28px", textAlign: "right" }}>{p.q}</b>
                            <span style={{ width: "14px", display: "flex", justifyContent: "flex-end" }}>
                                {p.alerta && <span className="dotal" role="img" aria-label="Abaixo do mínimo" title="Abaixo do mínimo"></span>}
                            </span>
                        </button>
                    ))}
                    {v.vazioProd && (
                        <div style={{ padding: "20px", textAlign: "center" }} className="sm">
                            Nenhum produto com esses filtros.
                        </div>
                    )}
                </div>
                {v.paginas > 1 ? <Paginacao v={v} /> : null}
            </section>
        );
    }

    return (
        <section className="box" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }} aria-label="Produtos">
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
                        value={v.busca}
                        onChange={v.onBusca}
                        placeholder="Nome, código de barras, categoria ou fabricante"
                        aria-label="Pesquisar produto"
                        style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", fontFamily: "inherit", fontSize: "14px", color: "var(--text)", outline: "none" }}
                    />
                </label>
                <button type="button" className="btn" onClick={v.abrirFiltros}>
                    <Ic n="filtro" />
                    Filtros
                    {v.temFiltros && <span className="cnt cnt-on">{v.nFiltros}</span>}
                </button>
                <div style={{ position: "relative" }}>
                    <button type="button" className="btn" onClick={v.toggleExp} aria-expanded={v.expOpen}>
                        <Ic n="baixar" />
                        Exportar
                        <Ic n="abaixo" style={{ width: "16px", height: "16px" }} />
                    </button>
                    {v.expOpen && <MenuExportar v={v} a={a} />}
                </div>
                <button type="button" className="btn pri" onClick={a.novoProduto}>
                    <Ic n="mais" style={{ strokeWidth: "2.2" }} />
                    Novo produto
                </button>
            </div>
            <Chips v={v} />
            <div className="sm">{v.resumoProd}</div>

            {v.variosDep && (
                <div className="gt" role="table" aria-label="Produtos" style={{ "--cols": "minmax(0,2fr) minmax(0,1fr) minmax(0,1.2fr) 70px 104px 104px 116px 22px" } as React.CSSProperties}>
                    <div className="gh" role="row">
                        <span role="columnheader">Produto</span>
                        <span role="columnheader">Fabricante</span>
                        <span role="columnheader">Classificação</span>
                        <span className="r" role="columnheader">
                            Qtd
                        </span>
                        <span className="r" role="columnheader">
                            Custo
                        </span>
                        <span className="r" role="columnheader">
                            Venda
                        </span>
                        <span className="r" role="columnheader">
                            Total a custo
                        </span>
                        <span role="columnheader"></span>
                    </div>
                    {v.prodRows.map((p) => (
                        <div className="gr hov" role="row" key={p.id}>
                            <span role="cell">
                                <button type="button" className="rowlink" onClick={p.open}>
                                    <Miniatura foto={p.foto} />
                                    <span className="pn">{p.n}</span>
                                </button>
                            </span>
                            <span className="tx2" role="cell">
                                {p.fab}
                            </span>
                            <span className="tx2" role="cell">
                                {p.cls}
                            </span>
                            <span className="r" role="cell">
                                <b>{p.q}</b>
                            </span>
                            <span className="r" role="cell">
                                {p.custo}
                            </span>
                            <span className="r" role="cell">
                                {p.venda}
                            </span>
                            <span className="r" role="cell" style={{ fontWeight: "800" }}>
                                {p.tot}
                            </span>
                            <span role="cell">{p.alerta && <span className="dotal" role="img" aria-label="Abaixo do mínimo" title="Abaixo do mínimo"></span>}</span>
                        </div>
                    ))}
                    {v.vazioProd && (
                        <div style={{ padding: "28px", textAlign: "center" }} className="sm">
                            Nenhum produto com esses filtros.
                        </div>
                    )}
                </div>
            )}

            {v.umDep && (
                <div className="gt" role="table" aria-label="Produtos no depósito" style={{ "--cols": "minmax(0,2fr) minmax(0,1fr) 70px 64px 64px 104px 104px 22px" } as React.CSSProperties}>
                    <div className="gh" role="row">
                        <span role="columnheader">Produto</span>
                        <span role="columnheader">Fabricante</span>
                        <span className="r" role="columnheader">
                            Qtd
                        </span>
                        <span className="r" role="columnheader">
                            Mín.
                        </span>
                        <span className="r" role="columnheader">
                            Repor
                        </span>
                        <span className="r" role="columnheader">
                            Custo
                        </span>
                        <span className="r" role="columnheader">
                            Venda
                        </span>
                        <span role="columnheader"></span>
                    </div>
                    {v.prodRows.map((p) => (
                        <div className="gr hov" role="row" key={p.id}>
                            <span role="cell">
                                <button type="button" className="rowlink" onClick={p.open}>
                                    <Miniatura foto={p.foto} />
                                    <span className="pn">{p.n}</span>
                                </button>
                            </span>
                            <span className="tx2" role="cell">
                                {p.fab}
                            </span>
                            <span className="r" role="cell">
                                <b>{p.q}</b>
                            </span>
                            <span className="r tx2" role="cell">
                                {p.mn}
                            </span>
                            <span className="r" role="cell">
                                <b>{p.rep}</b>
                            </span>
                            <span className="r" role="cell">
                                {p.custo}
                            </span>
                            <span className="r" role="cell">
                                {p.venda}
                            </span>
                            <span role="cell">{p.alerta && <span className="dotal" role="img" aria-label="Abaixo do mínimo" title="Abaixo do mínimo"></span>}</span>
                        </div>
                    ))}
                    {v.vazioProd && (
                        <div style={{ padding: "28px", textAlign: "center" }} className="sm">
                            Nenhum produto com esses filtros.
                        </div>
                    )}
                </div>
            )}

            <Paginacao v={v} />
        </section>
    );
}

/** Celular: o Exportar abre como folha que sobe de baixo. */
export function FolhaExportar({ v, a }: { v: AbaProdutosV; a: Acoes }) {
    const ir = (f: () => void) => () => {
        v.fecharExp();
        f();
    };
    return (
        <Janela m titulo="Exportar" aoFechar={v.fecharExp}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <button type="button" className="mi" onClick={ir(a.expCSV)}>
                    Planilha CSV
                </button>
                <button type="button" className="mi" onClick={ir(a.expXLS)}>
                    Excel (3 abas)
                </button>
                <button type="button" className="mi" onClick={ir(a.expPDF)}>
                    PDF da lista
                </button>
                <button type="button" className="mi" onClick={ir(a.expTAG)}>
                    Etiquetas em PDF (TAG)
                </button>
            </div>
        </Janela>
    );
}
