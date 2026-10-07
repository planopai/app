"use client";

import React from "react";

// Ícones do mockup do Estoque (traço 1,8, 24 × 24). Use <Ic n="busca" />.

const PATHS = {
    casa: (
        <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></>
    ),
    documento: (
        <><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></>
    ),
    abaixo: (
        <><path d="m6 9 6 6 6-6"/></>
    ),
    caixa: (
        <><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></>
    ),
    busca: (
        <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>
    ),
    ajustes: (
        <><path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/></>
    ),
    direita: (
        <><path d="m9 18 6-6-6-6"/></>
    ),
    alerta: (
        <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>
    ),
    atualizar: (
        <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></>
    ),
    setas: (
        <><path d="M7 7h13"/><path d="m17 3 4 4-4 4"/><path d="M17 17H4"/><path d="m7 13-4 4 4 4"/></>
    ),
    conferir: (
        <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>
    ),
    historico: (
        <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></>
    ),
    filtro: (
        <><path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/></>
    ),
    baixar: (
        <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>
    ),
    mais: (
        <><path d="M12 5v14"/><path d="M5 12h14"/></>
    ),
    fechar: (
        <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>
    ),
    flor: (
        <><circle cx="12" cy="7" r="3"/><circle cx="12" cy="17" r="3"/><circle cx="7" cy="12" r="3"/><circle cx="17" cy="12" r="3"/></>
    ),
    leitor: (
        <><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8"/><path d="M11 8v8"/><path d="M15 8v8"/></>
    ),
    lixeira: (
        <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></>
    ),
    esquerda: (
        <><path d="m15 18-6-6 6-6"/></>
    ),
    maleta: (
        <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M12 11v6"/><path d="M9 14h6"/></>
    ),
    etiqueta: (
        <><path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42z"/><circle cx="7" cy="7" r="1.5"/></>
    ),
    fabrica: (
        <><path d="M2 20h20"/><path d="M4 20V9l5 3V9l5 3V5l6 3v12"/></>
    ),
    subir: (
        <><path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/></>
    ),
    dinheiro: (
        <><circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2A2.5 2.5 0 0 1 9.5 15"/><path d="M12 6v1.5"/><path d="M12 16.5V18"/></>
    ),
    imagem: (
        <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></>
    ),
} satisfies Record<string, React.ReactNode>;

export type NomeIcone = keyof typeof PATHS;

export function Ic({ n, style, className }: { n: NomeIcone; style?: React.CSSProperties; className?: string }) {
    return (
        <svg className={className ? `ic ${className}` : "ic"} viewBox="0 0 24 24" style={style} aria-hidden="true">
            {PATHS[n]}
        </svg>
    );
}
