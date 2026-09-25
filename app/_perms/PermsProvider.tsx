"use client";

import React from "react";

type Ctx = {
    /** null = carregando; [] = sem permissão; ['*'] ou slugs */
    perms: string[] | null;
    /** true se tem '*' ou o slug */
    has: (slug: string) => boolean;
    /** força recarregar permissões do cargo do usuário atual */
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

// V2 para não reaproveitar cache antigo baseado em permissões individuais.
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

        // Compatibilidade defensiva caso alguma versão salve apenas o array.
        if (Array.isArray(parsed)) {
            return parsed.filter((item) => typeof item === "string");
        }

        if (!parsed || !Array.isArray(parsed.perms)) return null;

        return parsed.perms.filter((item) => typeof item === "string");
    } catch {
        return null;
    }
}

function writeCachedPerms(
    userKey: string | null | undefined,
    perms: string[],
) {
    if (typeof window === "undefined") return;

    const key = cacheKey(userKey);
    if (!key) return;

    try {
        const value: CachedPerms = {
            perms,
            savedAt: Date.now(),
        };

        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Cache local é auxiliar. Falha nele não deve quebrar a aplicação.
    }
}

/**
 * Retornos:
 * - string[]: servidor respondeu e estas são as permissões atuais do cargo;
 * - []: usuário não autenticado, sem cargo válido ou cargo sem permissões;
 * - null: não foi possível confirmar por falha de rede/servidor.
 *
 * Importante: null NÃO significa "sem permissão".
 */
async function fetchPermsClient(): Promise<string[] | null> {
    try {
        const r1 = await fetch(`${API}?action=whoami&_=${Date.now()}`, {
            cache: "no-store",
            credentials: "include",
            headers: {
                "x-requested-with": "XMLHttpRequest",
            },
        });

        if (!r1.ok) {
            if (r1.status === 401 || r1.status === 403) return [];
            throw new Error(`whoami HTTP ${r1.status}`);
        }

        const who = await r1.json().catch(() => null as any);

        const uid = Number(who?.id || 0);
        const cargoId = Number(who?.cargo_id || 0);

        if (!uid || !cargoId) return [];

        const r2 = await fetch(
            `${API}?action=list_cargo_permissions&cargo_id=${cargoId}&_=${Date.now()}`,
            {
                cache: "no-store",
                credentials: "include",
                headers: {
                    "x-requested-with": "XMLHttpRequest",
                },
            },
        );

        if (!r2.ok) {
            if (r2.status === 401 || r2.status === 403) return [];
            throw new Error(`cargo permissions HTTP ${r2.status}`);
        }

        const j = await r2.json().catch(() => null as any);

        return Array.isArray(j)
            ? j.filter((item) => typeof item === "string")
            : [];
    } catch {
        // Falha de rede/servidor: preservar estado/cache local.
        return null;
    }
}

export function PermsProvider({
    children,
    userKey,
    initialPerms,
}: Props) {
    // Mantém o SSR como primeira fonte para não criar divergência de hidratação.
    const [perms, setPerms] = React.useState<string[] | null>(
        initialPerms === undefined ? null : (initialPerms ?? []),
    );

    const load = React.useCallback(async () => {
        const onlinePerms = await fetchPermsClient();

        if (onlinePerms === null) {
            // Sem confirmação online. Não transformar erro de rede em "sem permissão".
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

    // Se o SSR entregou permissões válidas, guarda cópia para abertura offline.
    React.useEffect(() => {
        if (Array.isArray(initialPerms) && initialPerms.length > 0) {
            writeCachedPerms(userKey, initialPerms);
        }
    }, [initialPerms, userKey]);

    // Quando já iniciamos sem rede, restaura a última fotografia antes de revalidar.
    React.useEffect(() => {
        if (
            typeof navigator === "undefined" ||
            navigator.onLine !== false
        ) {
            return;
        }

        const cached = readCachedPerms(userKey);

        if (cached) {
            setPerms(cached);
        }
    }, [userKey]);

    // Revalida na montagem e sempre que o usuário muda.
    React.useEffect(() => {
        void load();
    }, [load]);

    // Assim que a conexão voltar, confirma permissões atuais no servidor.
    React.useEffect(() => {
        const handleOnline = () => {
            void load();
        };

        window.addEventListener("online", handleOnline);

        return () => {
            window.removeEventListener("online", handleOnline);
        };
    }, [load]);

    const has = React.useCallback(
        (slug: string) => {
            if (!perms) return false;
            if (perms.includes("*")) return true;
            return perms.includes(slug);
        },
        [perms],
    );

    const ctx: Ctx = {
        perms,
        has,
        reload: load,
    };

    return (
        <PermsContext.Provider value={ctx}>
            {children}
        </PermsContext.Provider>
    );
}

export function usePerms(): Ctx {
    const ctx = React.useContext(PermsContext);

    if (!ctx) {
        throw new Error(
            "usePerms deve ser usado dentro de <PermsProvider>",
        );
    }

    return ctx;
}
