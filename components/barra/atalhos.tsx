"use client";

/**
 * Barra personalizável — o que o MENU do app usa.
 *
 *     import { useBarra, IconeAtalho } from "@/components/barra/atalhos";
 *     const { computador, celular } = useBarra();
 *     // computador.itens / celular.itens: [{ id, rotulo, curto, rota }] já filtrados pelas permissões
 *     // desenhar cada item com <IconeAtalho id={item.id} />, link para item.rota;
 *     // no celular, depois dos itens, o botão Menu (fixo, sempre o último).
 *     // ao lado do item "messenger", pôr <ContadorMenu /> (components/messenger/ContadorMenu).
 *
 * Se o back-end da barra não responder, usa a barra padrão (a do mockup aprovado).
 */
import React, { useEffect, useState } from "react";
import { barraGet } from "@/components/messenger/api";

export type ItemBarra = { id: string; rotulo: string; curto: string; pagina?: string; rota: string };
export type BarraAparelho = { itens: ItemBarra[]; origem: "usuario" | "cargo" | "sistema"; limite: number };
export type MinhaBarra = { computador: BarraAparelho; celular: BarraAparelho; disponiveis: ItemBarra[] };

const PADRAO: MinhaBarra = {
    computador: {
        origem: "sistema", limite: 8,
        itens: [
            { id: "inicio", pagina: "inicio", rotulo: "Início", curto: "Início", rota: "/" },
            { id: "quadro", pagina: "quadro-acompanhamento", rotulo: "Quadro de Atendimentos", curto: "Quadro", rota: "/quadro-acompanhamento" },
            { id: "minhasos", pagina: "os-minhas", rotulo: "Minhas OS", curto: "Minhas OS", rota: "/os/minhas" },
            { id: "messenger", pagina: "messenger", rotulo: "Messenger", curto: "Messenger", rota: "/messenger" },
            { id: "chat", pagina: "chat", rotulo: "Aurora", curto: "Aurora", rota: "/chat" },
        ],
    },
    celular: {
        origem: "sistema", limite: 5,
        itens: [
            { id: "inicio", pagina: "inicio", rotulo: "Início", curto: "Início", rota: "/" },
            { id: "atendimentos", pagina: "acompanhamento", rotulo: "Atendimentos", curto: "Atend.", rota: "/acompanhamento" },
            { id: "messenger", pagina: "messenger", rotulo: "Messenger", curto: "Messenger", rota: "/messenger" },
            { id: "estoque", pagina: "estoque", rotulo: "Estoque", curto: "Estoque", rota: "/estoque" },
            { id: "coroas", pagina: "coroa-de-flores", rotulo: "Coroa de Flores", curto: "Coroas", rota: "/coroa-de-flores" },
        ],
    },
    disponiveis: [],
};

/** Evento que a tela Personalizar barra dispara ao salvar, para o menu se atualizar na hora. */
export const EVENTO_BARRA = "pai:barra-atualizada";

/** Barra do usuário. `carregada` fica falso até o servidor responder (antes disso vale o padrão do sistema). */
export function useBarra(): MinhaBarra & { carregada: boolean } {
    const [b, setB] = useState<MinhaBarra & { carregada: boolean }>({ ...PADRAO, carregada: false });
    useEffect(() => {
        let vivo = true;
        const buscar = () => barraGet<MinhaBarra>("minha_barra", {}, false).then((d) => vivo && setB({ ...d, carregada: true })).catch(() => {});
        buscar();
        window.addEventListener(EVENTO_BARRA, buscar);
        return () => {
            vivo = false;
            window.removeEventListener(EVENTO_BARRA, buscar);
        };
    }, []);
    return b;
}

const circ = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 -${2 * r} 0`;
const D: Record<string, string> = {
    inicio: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10",
    quadro: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
    minhasos: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2zM14 2v6h6M16 13H8M16 17H8",
    atendimentos: "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4",
    coroas: circ(12, 7, 3) + circ(12, 17, 3) + circ(7, 12, 3) + circ(17, 12, 3),
    messenger: "M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2zM18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1",
    chat: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z" + "M12.5 7l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3L8 11.5l3.3-1.2z",
    avisos: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
    requisicao: "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11v6M9 14h6",
    requisicoes: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16ZM12 22V12M3.3 7 12 12l8.7-5",
    estoque: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Zm-17.7-1 8.7 5 8.7-5M12 22V12",
    financeiro: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
    consulta: circ(11, 11, 7) + "M21 21l-4.3-4.3",
    associados: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" + circ(9, 7, 4) + "M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
};

export function IconeAtalho({ id, className = "h-[22px] w-[22px]" }: { id: string; className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={D[id] || D.inicio} />
        </svg>
    );
}
