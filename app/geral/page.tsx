"use client";

// Tela de Estoque — repaginada (07/10/2026), conforme o mockup "Repaginada do app PAI" (quadros EstoqueAbas e EstoqueAbasCelular).
// Abas por tarefa: Produtos, Movimentações, Conferência, Histórico e Cadastros.
// O Dashboard e o Painel de gestão saíram daqui: agora são /dashboard-estoque e /painel-estoque (módulo Gestão).
// Cada aba tem a sua lógica em components/<aba>/use*.ts e o desenho em components/<aba>/*.tsx.

import React, { useCallback, useEffect, useState } from "react";
import "./components/estoque.css";
import { useIsMobile } from "@/hooks/use-mobile";
import { Ic, type NomeIcone } from "./components/ui/Icones";
import { forceFreshReload, APP_BUILD_LABEL } from "./components/versao";
import { useEstoqueDados } from "./components/useEstoqueDados";
import { useListaProdutos } from "./components/produtos/useListaProdutos";
import { useExportarCSV } from "./components/produtos/exportar/useExportarCSV";
import { useExportarExcel } from "./components/produtos/exportar/useExportarExcel";
import { useExportarEtiquetas } from "./components/produtos/exportar/useExportarEtiquetas";
import { useExportarPDF } from "./components/produtos/exportar/useExportarPDF";
import { useCadastros } from "./components/cadastros/useCadastros";
import { useEditarProduto } from "./components/produtos/useEditarProduto";
import { useAbaProdutos } from "./components/produtos/useAbaProdutos";
import { useJanelaProduto } from "./components/produtos/useJanelaProduto";
import { AbaProdutos, FolhaExportar } from "./components/produtos/AbaProdutos";
import { JanelaFiltros } from "./components/produtos/JanelaFiltros";
import { JanelaProduto } from "./components/produtos/JanelaProduto";
import { JanelaAjusteCusto } from "./components/produtos/JanelaAjusteCusto";
import { useMovimentacoes } from "./components/movimentar/useMovimentacoes";
import { AbaMovimentacoes } from "./components/movimentar/AbaMovimentacoes";
import { useConferencias } from "./components/conferencia/useConferencias";
import { AbaConferencia } from "./components/conferencia/AbaConferencia";
import { useHistorico } from "./components/historico/useHistorico";
import { AbaHistorico } from "./components/historico/AbaHistorico";
import { useAbaCadastros } from "./components/cadastros/useAbaCadastros";
import { AbaCadastros } from "./components/cadastros/AbaCadastros";

type Aba = "produtos" | "mov" | "conf" | "hist" | "cad";
const ABAS: Array<[Aba, string, NomeIcone]> = [
    ["produtos", "Produtos", "caixa"],
    ["mov", "Movimentações", "setas"],
    ["conf", "Conferência", "conferir"],
    ["hist", "Histórico", "historico"],
    ["cad", "Cadastros", "ajustes"],
];

export default function Page() {
    const m = useIsMobile();
    const [aba, setAba] = useState<Aba>("produtos");
    const [msg, setMsg] = useState("");
    const avisar = useCallback((t: string) => setMsg(t), []);

    const n = useEstoqueDados();
    const prod = useListaProdutos(n);
    const expCsv = useExportarCSV(n, prod);
    const expExcel = useExportarExcel(prod);
    const expEtq = useExportarEtiquetas(prod);
    const expPdf = useExportarPDF(n, prod);
    const cad = useCadastros(n);
    const ed = useEditarProduto(n, cad, avisar);
    const jp = useJanelaProduto(n, ed, cad, avisar);
    const ap = useAbaProdutos(n, prod, jp.abrir);
    const mov = useMovimentacoes(n, avisar);
    const conf = useConferencias(n, avisar);
    const hist = useHistorico(n);
    const ac = useAbaCadastros(n, cad, avisar);

    const { loading, initErr, refreshInit } = n;

    useEffect(() => {
        if (aba === "hist") void hist.carregar();
        if (aba === "conf") void conf.carregar();
        if (aba === "mov") void mov.carregarConfeccoes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aba]);

    const irPara = (k: Aba) => {
        setAba(k);
        setMsg("");
    };

    const verAlertas = () => {
        ap.verAlertas();
        irPara("produtos");
    };

    const atualizar = async () => {
        await refreshInit();
        if (aba === "hist") await hist.carregar();
        if (aba === "conf") await conf.carregar();
        setMsg(`Dados atualizados às ${new Date().toTimeString().slice(0, 5)}.`);
    };

    const acoesProdutos = {
        novoProduto: jp.abrirNovo,
        expCSV: expCsv.exportarEstoqueCSV,
        expXLS: expExcel.exportarEstoqueExcel,
        expPDF: expPdf.exportarEstoquePDF,
        expTAG: expEtq.exportarEtiquetasPDF,
    };

    const abas = (
        <div className={m ? "tabs2 tabsm" : "tabs2"} role="tablist" aria-label="Seções do estoque">
            {ABAS.map(([k, l, ic]) => (
                <button type="button" key={k} className="tab2" role="tab" aria-selected={aba === k} onClick={() => irPara(k)}>
                    <Ic n={ic} />
                    <span>{l}</span>
                </button>
            ))}
        </div>
    );

    const mensagem = msg ? (
        <div className="msg-ok" role="status" style={{ display: "flex", alignItems: m ? "flex-start" : "center", gap: m ? "8px" : "12px", fontSize: m ? "13px" : undefined }}>
            <span style={{ flex: "1" }}>{msg}</span>
            <button type="button" className="lnk" onClick={() => setMsg("")}>
                Fechar
            </button>
        </div>
    ) : null;

    const erroInicial = initErr ? (
        <div className="msg-err" role="alert" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flex: "1" }}>{initErr}</span>
            <button type="button" className="lnk" onClick={() => void forceFreshReload()}>
                Recarregar
            </button>
        </div>
    ) : null;

    const conteudo = (
        <>
            {erroInicial}
            {mensagem}
            {loading && !n.produtos.length ? <div className="sm">Carregando…</div> : null}
            {aba === "produtos" && <AbaProdutos v={ap} a={acoesProdutos} m={m} />}
            {aba === "mov" && <AbaMovimentacoes v={mov} m={m} />}
            {aba === "conf" && <AbaConferencia v={conf} m={m} />}
            {aba === "hist" && <AbaHistorico v={hist} m={m} />}
            {aba === "cad" && <AbaCadastros v={ac} m={m} />}
        </>
    );

    return (
        <main className={m ? "estq m" : "estq"} style={{ minHeight: "100dvh", background: "var(--page)" }} data-build={APP_BUILD_LABEL}>
            {m ? (
                <>
                    <div style={{ padding: "16px 16px 8px", display: "flex", alignItems: "center", gap: "8px" }}>
                        <h1 style={{ margin: 0, flex: "1", fontSize: "24px", fontWeight: 800, lineHeight: 1.15 }}>Estoque</h1>
                        <button type="button" className="btn sq" onClick={() => void atualizar()} aria-label="Atualizar">
                            <Ic n="atualizar" />
                        </button>
                    </div>
                    {abas}
                    <div style={{ padding: "12px 16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>{conteudo}</div>
                </>
            ) : (
                <div style={{ padding: "28px 40px 48px", boxSizing: "border-box" }}>
                    <div style={{ maxWidth: "1160px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                            <div style={{ flex: "1", minWidth: "240px" }}>
                                <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "800" }}>Estoque</h1>
                            </div>
                            <button type="button" className="alr" onClick={verAlertas}>
                                <Ic n="alerta" />
                                {ap.alertas} para repor
                            </button>
                            <button type="button" className="btn" onClick={() => void atualizar()} aria-label="Atualizar" style={{ width: "44px", padding: "0" }}>
                                <Ic n="atualizar" />
                            </button>
                        </div>
                        {abas}
                        {conteudo}
                    </div>
                </div>
            )}

            {ap.filtOpen && <JanelaFiltros v={ap} m={m} />}
            {m && ap.expOpen && <FolhaExportar v={ap} a={acoesProdutos} />}
            {jp.aberta && <JanelaProduto v={jp} m={m} aviso={msg && jp.aberta ? msg : undefined} />}
            <JanelaAjusteCusto ed={ed} />
        </main>
    );
}
