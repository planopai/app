"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { IconMoon, IconSun } from "@tabler/icons-react";

/**
 * Alterna tema claro/escuro.
 *
 * O app tem DOIS mecanismos de tema:
 *  1) o ThemeProvider (next-themes), que põe a classe `dark` no <html>;
 *  2) a escolha "pai_tema" (localStorage + evento "pai_tema_change"), usada pelas telas já migradas, como o Quadro.
 * Este botão mexe nos dois, e também acompanha o botão de tema que existe dentro do Quadro, para os dois ficarem sempre iguais.
 */

const CHAVE = "pai_tema";
const EVENTO = "pai_tema_change";

function lerSalvo(): "claro" | "escuro" | null {
    try {
        const v = window.localStorage.getItem(CHAVE);
        return v === "claro" || v === "escuro" ? v : null;
    } catch {
        return null;
    }
}

export default function AlternarTema() {
    const { resolvedTheme, setTheme } = useTheme();
    const [montado, setMontado] = useState(false);

    useEffect(() => setMontado(true), []);

    // Se a escolha mudar por outro lado (botão do Quadro, outra aba), o tema do app acompanha.
    useEffect(() => {
        const aoMudar = () => {
            const v = lerSalvo();
            if (!v) return;
            const alvo = v === "escuro" ? "dark" : "light";
            if (document.documentElement.classList.contains("dark") !== (alvo === "dark")) setTheme(alvo);
        };
        window.addEventListener(EVENTO, aoMudar);
        window.addEventListener("storage", aoMudar);
        return () => {
            window.removeEventListener(EVENTO, aoMudar);
            window.removeEventListener("storage", aoMudar);
        };
    }, [setTheme]);

    const escuro = montado && resolvedTheme === "dark";

    const alternar = useCallback(() => {
        const novoEscuro = !escuro;
        setTheme(novoEscuro ? "dark" : "light");
        try {
            window.localStorage.setItem(CHAVE, novoEscuro ? "escuro" : "claro");
        } catch {
            /* sem armazenamento: só o tema do app muda */
        }
        window.dispatchEvent(new Event(EVENTO));
    }, [escuro, setTheme]);

    return (
        <button
            type="button"
            onClick={alternar}
            aria-label={escuro ? "Ativar tema claro" : "Ativar tema escuro"}
            title={escuro ? "Tema claro" : "Tema escuro"}
            className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/10"
        >
            {escuro ? <IconSun size={22} /> : <IconMoon size={22} />}
        </button>
    );
}
