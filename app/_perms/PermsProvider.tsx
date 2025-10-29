"use client";

import React from "react";

type Ctx = {
    /** null = carregando; [] = sem permissão; ['*'] ou slugs */
    perms: string[] | null;
    /** true se tem '*' ou o slug */
    has: (slug: string) => boolean;
    /** força recarregar permissões do usuário atual */
    reload: () => Promise<void>;
};

const PermsContext = React.createContext<Ctx | undefined>(undefined);

type Props = {
    children: React.ReactNode;
    /** chave que muda quando o usuário logado muda (ex.: cookie pai_uid) */
    userKey?: string | null;
    /** permissões já resolvidas no servidor (SSR) para não piscar/atrasar. */
    initialPerms?: string[] | null;
};

const API = "/api/php/pai_api.php";

async function fetchPermsClient(): Promise<string[]> {
    try {
        const r1 = await fetch(`${API}?action=whoami`, { cache: "no-store" });
        const t1 = await r1.text();
        const who = JSON.parse(t1.replace(/^\uFEFF/, "").trim() || "{}");
        const uid = Number((who as any)?.id || 0);
        if (!uid) return [];
        const r2 = await fetch(
            `${API}?action=list_permissions&user_id=${uid}&_=${Date.now()}`,
            { cache: "no-store" }
        );
        const t2 = await r2.text();
        const j = JSON.parse(t2.replace(/^\uFEFF/, "").trim() || "[]");
        return Array.isArray(j) ? j : [];
    } catch {
        return [];
    }
}

export function PermsProvider({ children, userKey, initialPerms }: Props) {
    // Começa com SSR (sem flicker), mas sempre valida no cliente
    const [perms, setPerms] = React.useState<string[] | null>(
        initialPerms === undefined ? null : initialPerms
    );

    const load = React.useCallback(async () => {
        const p = await fetchPermsClient();
        setPerms(p);
    }, []);

    // Montagem: sempre valida no cliente (confirma SSR, pega updates pós-login SPA)
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            const p = await fetchPermsClient();
            if (!cancelled) setPerms(p);
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Mudou de usuário → zera e recarrega
    React.useEffect(() => {
        setPerms(null);
        load();
    }, [userKey, load]);

    // Sincronização entre abas/janelas (opcional): quando login/logout acontecer,
    // dispare localStorage.setItem("pai_auth_changed", Date.now().toString())
    React.useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === "pai_auth_changed") {
                setPerms(null);
                load();
            }
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, [load]);

    const has = React.useCallback(
        (slug: string) => {
            if (perms == null) return false; // enquanto recarrega, trate como oculto
            if (perms.includes("*")) return true; // admin
            return perms.includes(slug);
        },
        [perms]
    );

    const ctx: Ctx = { perms, has, reload: load };

    return <PermsContext.Provider value={ctx}>{children}</PermsContext.Provider>;
}

export function usePerms(): Ctx {
    const ctx = React.useContext(PermsContext);
    if (!ctx) throw new Error("usePerms deve ser usado dentro de <PermsProvider>");
    return ctx;
}
