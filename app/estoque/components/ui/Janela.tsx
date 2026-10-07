"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Ic } from "./Icones";

// Janela padrão do Estoque repaginado:
// computador = diálogo centralizado (cabeçalho, corpo que rola, rodapé com os botões à direita);
// celular (< 1024 px) = folha que sobe de baixo. Sempre no <body> (portal), z-[70], Esc fecha.

export function Janela({
    m,
    titulo,
    sub,
    aoFechar,
    largura = 600,
    altura,
    larga,
    antesTitulo,
    depoisTitulo,
    topo,
    rodape,
    children,
}: {
    m: boolean;
    titulo: React.ReactNode;
    sub?: React.ReactNode;
    aoFechar: () => void;
    largura?: number;
    altura?: string;
    /** Celular: folha mais larga (tablets). */
    larga?: boolean;
    antesTitulo?: React.ReactNode;
    depoisTitulo?: React.ReactNode;
    /** Faixa entre o cabeçalho e o corpo (ex.: abas). */
    topo?: React.ReactNode;
    rodape?: React.ReactNode;
    children?: React.ReactNode;
}) {
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") aoFechar();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [aoFechar]);

    if (!montado) return null;
    const rotulo = typeof titulo === "string" ? titulo : undefined;

    const conteudo = m ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label={rotulo} data-pai-overlay onClick={(e) => e.target === e.currentTarget && aoFechar()}>
            <div className={larga ? "sh wide" : "sh"}>
                <div className="shh">
                    {antesTitulo}
                    <div style={{ flex: "1", minWidth: 0 }}>
                        <h2>{titulo}</h2>
                        {sub ? <p>{sub}</p> : null}
                    </div>
                    {depoisTitulo}
                    <button type="button" className="xb" onClick={aoFechar} aria-label="Fechar">
                        <Ic n="fechar" />
                    </button>
                </div>
                {topo}
                <div className="shb">{children}</div>
                {rodape ? <div className="shf">{rodape}</div> : null}
            </div>
        </div>
    ) : (
        <div className="ovl" role="dialog" aria-modal="true" aria-label={rotulo} data-pai-overlay onClick={(e) => e.target === e.currentTarget && aoFechar()}>
            <div className="dlg" style={{ maxWidth: `${largura}px`, height: altura }}>
                <div className="dh">
                    {antesTitulo}
                    <div style={{ flex: "1", minWidth: 0 }}>
                        <h2>{titulo}</h2>
                        {sub ? <p>{sub}</p> : null}
                    </div>
                    {depoisTitulo}
                    <button type="button" className="ib" onClick={aoFechar} aria-label="Fechar">
                        <Ic n="fechar" />
                    </button>
                </div>
                {topo}
                <div className="db">{children}</div>
                {rodape ? <div className="df">{rodape}</div> : null}
            </div>
        </div>
    );

    return createPortal(<div className={m ? "estq m" : "estq"}>{conteudo}</div>, document.body);
}
