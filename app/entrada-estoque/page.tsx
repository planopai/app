"use client";

// Entrada de Mercadoria (25/11/2026): saiu da aba Movimentações do Estoque e virou tela própria, com a chave entrada-estoque.
// Mesmo lançamento de antes (itens, frete, nota do fornecedor e pagamento opcional; o estoque soma ao concluir e a entrada
// fica pendente até quem tem o Contas a Pagar aprovar). A lógica continua em app/estoque/components/movimentar.

import React, { useCallback, useState } from "react";
import "../estoque/components/estoque.css";
import { useIsMobile } from "@/hooks/use-mobile";
import { Ic } from "../estoque/components/ui/Icones";
import { forceFreshReload, APP_BUILD_LABEL } from "../estoque/components/versao";
import { useEstoqueDados } from "../estoque/components/useEstoqueDados";
import { FaixaAtualizando, travaToques } from "@/lib/cacheTela";
import { useMovimentacoes } from "../estoque/components/movimentar/useMovimentacoes";
import { AbaMovimentacoes } from "../estoque/components/movimentar/AbaMovimentacoes";

export default function Page() {
    const m = useIsMobile();
    const [msg, setMsg] = useState("");
    const avisar = useCallback((t: string) => setMsg(t), []);

    const n = useEstoqueDados();
    const mov = useMovimentacoes(n, avisar, "entrada");
    const { loading, initErr, refreshInit } = n;

    const atualizar = async () => {
        await refreshInit();
        setMsg(`Dados atualizados às ${new Date().toTimeString().slice(0, 5)}.`);
    };

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
        <div style={{ display: "contents", ...travaToques(n.desatualizado) }}>
            {erroInicial}
            {mensagem}
            {loading && !n.produtos.length ? <div className="sm">Carregando…</div> : null}
            <AbaMovimentacoes v={mov} m={m} />
        </div>
    );

    return (
        <main className={m ? "estq m [contain:inline-size]" : "estq [contain:inline-size]"} style={{ minHeight: "100dvh", background: "var(--page)" }} data-build={APP_BUILD_LABEL}>
            <FaixaAtualizando ativo={n.desatualizado} />
            {m ? (
                <>
                    <div style={{ padding: "16px 16px 8px", display: "flex", alignItems: "center", gap: "8px" }}>
                        <h1 style={{ margin: 0, flex: "1", fontSize: "24px", fontWeight: 800, lineHeight: 1.15 }}>Entrada de Mercadoria</h1>
                        <button type="button" className="btn sq" onClick={() => void atualizar()} aria-label="Atualizar">
                            <Ic n="atualizar" />
                        </button>
                    </div>
                    <div style={{ padding: "12px 16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>{conteudo}</div>
                </>
            ) : (
                <div style={{ padding: "28px 40px 48px", boxSizing: "border-box" }}>
                    <div style={{ maxWidth: "1160px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                            <div style={{ flex: "1", minWidth: "240px" }}>
                                <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "800" }}>Entrada de Mercadoria</h1>
                            </div>
                            <button type="button" className="btn" onClick={() => void atualizar()} aria-label="Atualizar" style={{ width: "44px", padding: "0" }}>
                                <Ic n="atualizar" />
                            </button>
                        </div>
                        {conteudo}
                    </div>
                </div>
            )}
        </main>
    );
}
