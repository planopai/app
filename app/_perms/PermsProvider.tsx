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
    /** chave que muda quando o usuário logado muda (cookie pai_uid) */
    userKey?: string | null;
};

const API = '/api/php/pai_api.php';

export function PermsProvider({ children, userKey }: Props) {
    const [perms, setPerms] = React.useState<string[] | null>(null);

    const load = React.useCallback(async () => {
        try {
            // 1) whoami – garante cookies atualizados e devolve id
            const r1 = await fetch(`${API}?action=whoami`, { cache: 'no-store' });
            const w = await r1.json().catch(() => ({} as any));
            const uid = Number(w?.id || 0);

            if (!uid) {
                setPerms([]); // não logado → nada permitido
                return;
            }

            // 2) permissões do usuário
            const r2 = await fetch(
                `${API}?action=list_permissions&user_id=${uid}&_=${Date.now()}`,
                { cache: 'no-store' }
            );
            const j: unknown = await r2.json().catch(() => []);
            if (Array.isArray(j)) {
                setPerms(j as string[]);
            } else {
                setPerms([]);
            }
        } catch {
            setPerms([]); // erro → assume nenhuma permissão
        }
    }, []);

    // Carrega ao montar e SEMPRE que o userKey mudar
    React.useEffect(() => {
        // zera para que as telas ocultem imediatamente enquanto recarrega
        setPerms(null);
        load();
    }, [userKey, load]);

    const has = React.useCallback(
        (slug: string) => {
            if (!perms) return false;               // carregando → trate como oculto
            if (perms.includes('*')) return true;   // admin
            return perms.includes(slug);
        },
        [perms]
    );

    const ctx: Ctx = {
        perms,
        has,
        reload: load,
    };

    return <PermsContext.Provider value={ctx}>{children}</PermsContext.Provider>;
}

export function usePerms(): Ctx {
    const ctx = React.useContext(PermsContext);
    if (!ctx) {
        throw new Error('usePerms deve ser usado dentro de <PermsProvider>');
    }
    return ctx;
}
