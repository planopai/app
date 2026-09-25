// app/_perms/getPermsServer.ts
import "server-only";
import { headers } from "next/headers";

const API_URL =
    "https://api.planoassistencialintegrado.com.br/pai_api.php";

export async function getInitialPerms(): Promise<string[]> {
    try {
        const hdrs = await headers();
        const cookie = hdrs.get("cookie") || "";

        const r = await fetch(
            `${API_URL}?action=my_permissions&_=${Date.now()}`,
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

        if (!r.ok) return [];

        const text = await r.text();

        let data: unknown = [];
        try {
            data = JSON.parse(
                text.replace(/^\uFEFF/, "").trim(),
            );
        } catch {
            data = [];
        }

        return Array.isArray(data)
            ? data.filter(
                  (item): item is string =>
                      typeof item === "string",
              )
            : [];
    } catch {
        return [];
    }
}
