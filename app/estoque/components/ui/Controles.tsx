"use client";

import React from "react";
import { Ic } from "./Icones";

// Peças repetidas do mockup: botões segmentados, chave liga/desliga e grupo que abre e recolhe com marcação múltipla.

export type OpcaoSeg = { l: string; on: boolean; go: () => void };

export function Segmentado({ opcoes, className }: { opcoes: OpcaoSeg[]; className?: string }) {
    return (
        <div className={className ? `segb ${className}` : "segb"}>
            {opcoes.map((o, i) => (
                <button type="button" key={i} aria-pressed={o.on} onClick={o.go}>
                    {o.l}
                </button>
            ))}
        </div>
    );
}

export function Chave({ ligado, aoTrocar, rotulo, children, alinhar = "center" }: { ligado: boolean; aoTrocar: () => void; rotulo: string; children: React.ReactNode; alinhar?: "center" | "flex-start" }) {
    return (
        <label style={{ display: "flex", alignItems: alinhar, gap: "10px", fontSize: "14px", fontWeight: alinhar === "center" ? 700 : undefined }}>
            <button type="button" className="tgl" role="switch" aria-checked={ligado} onClick={aoTrocar} aria-label={rotulo}>
                <span></span>
            </button>
            {children}
        </label>
    );
}

export type AcordeaoV = { tit: string; res: string; n: string; temN: boolean; ab: boolean; exp: boolean; go: () => void };

export function Acordeao({
    a,
    busca,
    onBusca,
    placeholder,
    itens,
    m,
}: {
    a: AcordeaoV;
    busca: string;
    onBusca: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder: string;
    itens: OpcaoSeg[];
    m: boolean;
}) {
    return (
        <div className="acc">
            <button type="button" className="acch" aria-expanded={a.exp} onClick={a.go}>
                <span style={{ flex: "1", minWidth: "0" }}>
                    <span className="acct">{a.tit}</span>
                    <span className="accr">{a.res}</span>
                </span>
                {a.temN && <span className="cnt cnt-on">{a.n}</span>}
                <Ic n="abaixo" className="accv" />
            </button>
            {a.ab && (
                <div className="accb">
                    <label className="cbin" style={{ marginBottom: "6px", height: "40px" }}>
                        <Ic n="busca" />
                        <input value={busca} onChange={onBusca} placeholder={placeholder} aria-label={placeholder} style={{ fontSize: m ? "16px" : "14px" }} />
                    </label>
                    <div className="ckl" style={{ gridTemplateColumns: m ? "minmax(0,1fr)" : "repeat(2,minmax(0,1fr))" }}>
                        {itens.map((o, i) => (
                            <button type="button" key={i} className="ck" aria-pressed={o.on} onClick={o.go}>
                                <i></i>
                                {o.l}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
