'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Who = { id: number | null; nome?: string | null; usuario?: string | null } | null;

type PermsCtx = {
    who: Who;
    perms: string[] | null;          // null = carregando, [] = sem perms
    has: (slug: string) => boolean;  // inclui suporte a "*"
};

const Ctx = createContext<PermsCtx>({
    who: null,
    perms: null,
    has: () => false,
});

async function safeJsonFetch(url: string) {
    const r = await fetch(url, { cache: 'no-store', credentials: 'include' });
    const t = await r.text();
    const cleaned = t.replace(/^\uFEFF/, '').trim();
    let j: any = null;
    if (!cleaned.startsWith('<')) {
        try { j = JSON.parse(cleaned); } catch {
            const m = cleaned.match(/\{[\s\S]*\}$/m);
            if (m) j = JSON.parse(m[0]);
        }
    }
    return j ?? {};
}

export function PermsProvider({ children }: { children: React.ReactNode }) {
    const [who, setWho] = useState<Who>(null);
    const [perms, setPerms] = useState<string[] | null>(null);

    useEffect(() => {
        let dead = false;
        (async () => {
            try {
                const w = await safeJsonFetch('/api/php/pai_api.php?action=whoami');
                if (dead) return;
                setWho(w);
                if (w?.id) {
                    const p = await safeJsonFetch(`/api/php/pai_api.php?action=list_permissions&user_id=${w.id}`);
                    if (!dead) setPerms(Array.isArray(p) ? p : []);
                } else {
                    if (!dead) setPerms([]);
                }
            } catch {
                if (!dead) { setWho({ id: null }); setPerms([]); }
            }
        })();
        return () => { dead = true; };
    }, []);

    const value = useMemo<PermsCtx>(() => ({
        who,
        perms,
        has: (slug: string) => {
            if (!perms) return false; // enquanto carrega, trate como false (UI pode mostrar "Carregando…")
            if (perms.includes('*')) return true;
            return perms.includes(slug);
        },
    }), [who, perms]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePerms() {
    return useContext(Ctx);
}
