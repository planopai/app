// app/_perms/getPermsServer.ts
import "server-only";
import { headers } from "next/headers";

export async function getInitialPerms(): Promise<string[]> {
    try {
        const hdrs = await headers();
        const cookie = hdrs.get("cookie") || "";

        const r = await fetch(`/api/php/pai_api.php?action=my_permissions`, {
            headers: { cookie, "x-requested-with": "XMLHttpRequest" },
            cache: "no-store",
            // @ts-ignore – Next 15 permite caminho relativo no servidor
            next: { revalidate: 0 },
        });

        const txt = await r.text();
        let perms: any = [];
        try {
            perms = JSON.parse(txt.replace(/^\uFEFF/, "").trim());
        } catch {
            perms = [];
        }

        if (!r.ok) return [];
        return Array.isArray(perms)
            ? perms.filter((item) => typeof item === "string")
            : [];
    } catch {
        return [];
    }
}
