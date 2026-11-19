"use client";

/**
 * app/_perms/PermsDoUsuario.tsx (19/11/2026)
 *
 * Antes o layout lia o cookie pai_uid no servidor para montar o PermsProvider. Isso obrigava todas as
 * telas a serem montadas a cada clique. Agora o pai_uid é lido aqui, no aparelho, e o layout pode ser
 * estático (as telas ficam prontas na rede da Vercel).
 *
 * initialPerms = [] é o mesmo que o layout entregava antes (o getInitialPerms sempre devolvia []):
 * o PermsProvider continua buscando as permissões no servidor, como já fazia.
 */

import React from "react";

import { PermsProvider } from "./PermsProvider";

function lerUid(): string | null {
    if (typeof document === "undefined") return null;
    const m = document.cookie.match(/(?:^|;\s*)pai_uid=([^;]*)/);
    const v = m ? decodeURIComponent(m[1]).trim() : "";
    return v || null;
}

const SEM_PERMISSOES: string[] = [];

export function PermsDoUsuario({ children }: { children: React.ReactNode }) {
    const [uid, setUid] = React.useState<string | null>(lerUid);

    // Troca de usuário sem recarregar a página (sair e entrar com outro login): confere o cookie de novo.
    React.useEffect(() => {
        const conferir = () => setUid((atual) => {
            const novo = lerUid();
            return novo === atual ? atual : novo;
        });
        conferir();
        window.addEventListener("focus", conferir);
        document.addEventListener("visibilitychange", conferir);
        return () => {
            window.removeEventListener("focus", conferir);
            document.removeEventListener("visibilitychange", conferir);
        };
    }, []);

    return (
        <PermsProvider key={uid ?? "nouid"} userKey={uid} initialPerms={SEM_PERMISSOES}>
            {children}
        </PermsProvider>
    );
}
