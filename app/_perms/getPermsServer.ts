// app/_perms/getPermsServer.ts
import "server-only";
import { headers } from "next/headers";

export async function getInitialPerms(): Promise<string[]> {
    try {
        const hdrs = await headers();
        const cookie = hdrs.get("cookie") || "";

        // Identifica o usuário e o cargo atual com os cookies da requisição.
        const r1 = await fetch(`/api/php/pai_api.php?action=whoami`, {
            headers: {
                cookie,
                "x-requested-with": "XMLHttpRequest",
            },
            cache: "no-store",
            // @ts-ignore – Next 15 permite caminho relativo no servidor
            next: { revalidate: 0 },
        });

        if (!r1.ok) return [];

        const t1 = await r1.text();
        let who: any = {};

        try {
            who = JSON.parse(t1.replace(/^\uFEFF/, "").trim());
        } catch {
            return [];
        }

        const uid = Number(who?.id || 0);
        const cargoId = Number(who?.cargo_id || 0);

        // Não logado ou sem cargo válido = nenhuma página liberada.
        if (!uid || !cargoId) return [];

        // Permissões agora são definidas pelo cargo.
        const r2 = await fetch(
            `/api/php/pai_api.php?action=list_cargo_permissions&cargo_id=${cargoId}&_=${Date.now()}`,
            {
                headers: {
                    cookie,
                    "x-requested-with": "XMLHttpRequest",
                },
                cache: "no-store",
                // @ts-ignore
                next: { revalidate: 0 },
            },
        );

        if (!r2.ok) return [];

        const t2 = await r2.text();
        let perms: any = [];

        try {
            perms = JSON.parse(t2.replace(/^\uFEFF/, "").trim());
        } catch {
            perms = [];
        }

        return Array.isArray(perms)
            ? perms.filter((item) => typeof item === "string")
            : [];
    } catch {
        return [];
    }
}
