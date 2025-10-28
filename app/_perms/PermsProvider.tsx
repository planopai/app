'use client';

import React from 'react';

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
    /** permissões já resolvidas no servidor (SSR) para evitar flash */
    initialPerms?: string[] | null;
};

const API = '/api/php/pai_api.php';

async function fetchPermsClient(): Promise<string[]> {
    try {
        const r1 = await fetch(`${API}?action=whoami`, { cache: 'no-store' });
        const who = await r1.json().catch(() => ({} as any));
        const uid = Number(who?.id || 0);
        if (!uid) return [];
        const r2 = await fetch(`${API}?action=list_permissions&user_id=${uid}&_=${Date.now()}`, {
            cache: 'no-store',
        });
        const j = await r2.json().catch(() => []);
        return Array.isArray(j) ? j : [];
    } catch {
        return [];
    }
}

export function PermsProvider({ children, userKey, initialPerms }: Props) {
    // Se o servidor já mandou permissões, começamos com elas (sem "Carregando…")
    const [perms, setPerms] = React.useState<string[] | null>(
        initialPerms === undefined ? null : initialPerms
    );

    const load = React.useCallback(async () => {
        const p = await fetchPermsClient();
        setPerms(p);
    }, []);

    // Montagem: só busca no cliente se o servidor NÃO tiver resolvido
    React.useEffect(() => {
        if (initialPerms === undefined) {
            setPerms(null);
            load();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Mudou de usuário → zera e recarrega
    React.useEffect(() => {
        setPerms(null);
        load();
    }, [userKey, load]);

    const has = React.useCallback(
        (slug: string) => {
            if (!perms) return false;             // enquanto recarrega, trate como oculto
            if (perms.includes('*')) return true; // admin
            return perms.includes(slug);
        },
        [perms]
    );

    const ctx: Ctx = { perms, has, reload: load };

    return <PermsContext.Provider value={ctx}>{children}</PermsContext.Provider>;
}

export function usePerms(): Ctx {
    const ctx = React.useContext(PermsContext);
    if (!ctx) throw new Error('usePerms deve ser usado dentro de <PermsProvider>');
    return ctx;
}
