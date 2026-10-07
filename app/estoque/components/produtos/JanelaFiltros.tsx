"use client";

import React from "react";
import { Acordeao, Chave, Segmentado } from "../ui/Controles";
import { Janela } from "../ui/Janela";
import type { AbaProdutosV } from "./useAbaProdutos";

// Filtros da lista de produtos: cada grupo abre, faz a seleção e recolhe.

export function JanelaFiltros({ v, m }: { v: AbaProdutosV; m: boolean }) {
    return (
        <Janela
            m={m}
            titulo="Filtros"
            aoFechar={v.fecharFiltros}
            largura={720}
            rodape={
                <>
                    <button type="button" className="btn" onClick={v.limparFiltros}>
                        Limpar filtros
                    </button>
                    <button type="button" className="btn pri" onClick={v.fecharFiltros}>
                        Ver produtos
                    </button>
                </>
            }
        >
            <div style={{ display: "grid", gridTemplateColumns: m ? "minmax(0,1fr)" : "repeat(2,minmax(0,1fr))", gap: "12px" }}>
                <div>
                    <p className="flbl">Saldo</p>
                    <Segmentado opcoes={v.fSaldo} />
                </div>
                <div>
                    <p className="flbl">Situação</p>
                    <Segmentado opcoes={v.fSit} />
                </div>
            </div>
            <Chave ligado={v.fRepor} aoTrocar={v.togRepor} rotulo="Só abaixo do mínimo">
                Só abaixo do mínimo (para repor)
            </Chave>
            <Acordeao a={v.aDep} busca={v.buscaFiltro.dep || ""} onBusca={v.onBuscaFiltro("dep")} placeholder="Buscar depósito" itens={v.fDep} m={m} />
            <Acordeao a={v.aCat} busca={v.buscaFiltro.cat || ""} onBusca={v.onBuscaFiltro("cat")} placeholder="Buscar categoria" itens={v.fCat} m={m} />
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Acordeao a={v.aFab} busca={v.buscaFiltro.fab || ""} onBusca={v.onBuscaFiltro("fab")} placeholder="Buscar fabricante" itens={v.fFab} m={m} />
                <Acordeao a={v.aCls} busca={v.buscaFiltro.cls || ""} onBusca={v.onBuscaFiltro("cls")} placeholder="Buscar classificação" itens={v.fCls} m={m} />
            </div>
        </Janela>
    );
}
