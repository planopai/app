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
    /** permissões já resolvidas no servidor (SSR) para evitar flash */
    initialPerms?: string[] | null;
};

const API = "/api/php/pai_api.php";
const CACHE_PREFIX = "pai_permissions_v2_cargo:";

type CachedPerms = {
    perms: string[];
    savedAt: number;
};

function cacheKey(userKey?: string | null) {
    const key = String(userKey ?? "").trim();
    return key ? `${CACHE_PREFIX}${key}` : null;
}

function readCachedPerms(userKey?: string | null): string[] | null {
    if (typeof window === "undefined") return null;
    const key = cacheKey(userKey);
    if (!key) return null;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedPerms | string[];
        if (Array.isArray(parsed)) {
            return parsed.filter((item) => typeof item === "string");
        }
        if (!parsed || !Array.isArray(parsed.perms)) return null;
        return parsed.perms.filter((item) => typeof item === "string");
    } catch {
        return null;
    }
}

function writeCachedPerms(userKey: string | null | undefined, perms: string[]) {
    if (typeof window === "undefined") return;
    const key = cacheKey(userKey);
    if (!key) return;
    try {
        const value: CachedPerms = { perms, savedAt: Date.now() };
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Cache local é auxiliar. Falha nele não deve quebrar a aplicação.
    }
}

async function fetchPermsClient(): Promise<string[] | null> {
    try {
        const r = await fetch(`${API}?action=my_permissions&_=${Date.now()}`, {
            cache: "no-store",
            credentials: "include",
            headers: { "x-requested-with": "XMLHttpRequest" },
        });

        if (!r.ok) {
            if (r.status === 401 || r.status === 403) return [];
            throw new Error(`permissions HTTP ${r.status}`);
        }

        const j = await r.json().catch(() => null as any);
        return Array.isArray(j)
            ? j.filter((item) => typeof item === "string")
            : [];
    } catch {
        return null;
    }
}

export function PermsProvider({ children, userKey, initialPerms }: Props) {
    const [perms, setPerms] = React.useState<string[] | null>(
        initialPerms === undefined ? null : (initialPerms ?? []),
    );

    const load = React.useCallback(async () => {
        const onlinePerms = await fetchPermsClient();
        if (onlinePerms === null) {
            setPerms((current) => {
                if (current && current.length > 0) return current;
                const cached = readCachedPerms(userKey);
                if (cached) return cached;
                return current;
            });
            return;
        }
        setPerms(onlinePerms);
        writeCachedPerms(userKey, onlinePerms);
    }, [userKey]);

    React.useEffect(() => {
        if (Array.isArray(initialPerms) && initialPerms.length > 0) {
            writeCachedPerms(userKey, initialPerms);
        }
    }, [initialPerms, userKey]);

    React.useEffect(() => {
        if (typeof navigator === "undefined" || navigator.onLine !== false) return;
        const cached = readCachedPerms(userKey);
        if (cached) setPerms(cached);
    }, [userKey]);

    React.useEffect(() => { void load(); }, [load]);

    React.useEffect(() => {
        const handleOnline = () => { void load(); };
        window.addEventListener("online", handleOnline);
        return () => window.removeEventListener("online", handleOnline);
    }, [load]);

    const has = React.useCallback((slug: string) => {
        if (!perms) return false;
        if (perms.includes("*")) return true;
        return perms.includes(slug);
    }, [perms]);

    const ctx: Ctx = { perms, has, reload: load };
    return <PermsContext.Provider value={ctx}>{children}</PermsContext.Provider>;
}

export function usePerms(): Ctx {
    const ctx = React.useContext(PermsContext);
    if (!ctx) {
        throw new Error("usePerms deve ser usado dentro de <PermsProvider>");
    }
    return ctx;
}
