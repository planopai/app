// app/_perms/getPermsServer.ts
import "server-only";
import { headers } from "next/headers";

export async function getInitialPerms(): Promise<string[]> {
    try {
        const hdrs = await headers();
        const cookie = hdrs.get("cookie") || "";

        // whoami com os cookies da requisição
        const r1 = await fetch(`/api/php/pai_api.php?action=whoami`, {
            headers: { cookie, "x-requested-with": "XMLHttpRequest" },
            cache: "no-store",
            // @ts-ignore – Next 15 permite caminho relativo no servidor
            next: { revalidate: 0 },
        });
        const t1 = await r1.text();
        let who: any = {};
        try { who = JSON.parse(t1.replace(/^\uFEFF/, "").trim()); } catch { }

        const uid = Number(who?.id || 0);
        if (!uid) return []; // não logado → nada

        // lista permissões
        const r2 = await fetch(`/api/php/pai_api.php?action=list_permissions&user_id=${uid}`, {
            headers: { cookie, "x-requested-with": "XMLHttpRequest" },
            cache: "no-store",
            // @ts-ignore
            next: { revalidate: 0 },
        });
        const t2 = await r2.text();
        let perms: any = [];
        try { perms = JSON.parse(t2.replace(/^\uFEFF/, "").trim()); } catch { perms = []; }

        return Array.isArray(perms) ? perms : [];
    } catch {
        return [];
    }
}
