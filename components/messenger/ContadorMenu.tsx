"use client";

/**
 * Contador de não lidas do Messenger para o MENU (barra do computador e barra de baixo do celular).
 *
 * Como usar no componente do menu, ao lado do item Messenger:
 *     import ContadorMenu from "@/components/messenger/ContadorMenu";
 *     ... <span>Messenger</span> <ContadorMenu />
 *
 * Usa a mesma conexão de tempo real da tela (tempoReal.ts): não abre uma segunda conexão.
 * No app instalado, também mostra o número no ícone (onde o aparelho permite).
 */
import React, { useEffect, useRef, useState } from "react";
import { msgGet } from "./api";
import { ouvir, ouvirSeguranca } from "./tempoReal";

export type NaoLidas = { total: number; fila: number; grupos_com_novas: number; carregado?: boolean };

/** `ativo = false` não consulta nada (ex.: usuário sem a página messenger). */
export function useNaoLidas(ativo: boolean = true): NaoLidas {
    const [n, setN] = useState<NaoLidas>({ total: 0, fila: 0, grupos_com_novas: 0 });
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!ativo) return;
        let vivo = true;
        const buscar = async () => {
            try {
                const d = await msgGet<NaoLidas>("nao_lidas_total", {}, false);
                if (!vivo) return;
                setN({ ...d, carregado: true });
                const nav: any = navigator;
                if (nav.setAppBadge) (d.total > 0 ? nav.setAppBadge(d.total) : nav.clearAppBadge?.())?.catch?.(() => {});
            } catch {
                /* sem sessão ou sem permissão: fica zerado */
            }
        };
        const agendar = () => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(buscar, 600); // junta vários eventos seguidos numa consulta
        };
        buscar();
        const parar = ouvir((e) => {
            if (["mensagem", "leitura", "conversa", "mensagem_apagada"].includes(e.nome)) agendar();
        });
        let intervalo: ReturnType<typeof setInterval> | null = null;
        const pararSeg = ouvirSeguranca((ativo) => {
            if (intervalo) clearInterval(intervalo);
            intervalo = ativo ? setInterval(buscar, 30000) : null;
        });
        const aoMarcarLida = () => agendar();
        window.addEventListener("messenger:lida", aoMarcarLida);
        return () => {
            vivo = false;
            parar();
            pararSeg();
            if (intervalo) clearInterval(intervalo);
            if (timer.current) clearTimeout(timer.current);
            window.removeEventListener("messenger:lida", aoMarcarLida);
        };
    }, [ativo]);
    return n;
}

export default function ContadorMenu({ className = "" }: { className?: string }) {
    const { total, fila } = useNaoLidas();
    const valor = total + fila;
    if (valor <= 0) return null;
    return (
        <span
            className={`inline-flex min-w-[22px] items-center justify-center rounded-full bg-[#F2CB3F] px-2 text-xs font-extrabold text-[#313C55] ${className}`}
            aria-label={`${valor} mensagens não lidas`}
        >
            {valor > 99 ? "99+" : valor}
        </span>
    );
}
