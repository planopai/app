// app/_perms/getPermsServer.ts
import 'server-only';
import { headers } from 'next/headers';

const API = `${process.env.NEXT_PUBLIC_APP_ORIGIN ?? ''}/api/php/pai_api.php`;
// Se não tiver NEXT_PUBLIC_APP_ORIGIN, usaremos caminho relativo no fetch opcionalmente.

export async function getInitialPerms(): Promise<string[]> {
    try {
        const hdrs = await headers();
        const cookie = hdrs.get('cookie') || '';

        // whoami com os cookies da requisição
        const r1 = await fetch(`/api/php/pai_api.php?action=whoami`, {
            headers: { cookie, 'x-requested-with': 'XMLHttpRequest' },
            cache: 'no-store',
            // @ts-ignore – Next 15 permite caminho relativo no servidor
            next: { revalidate: 0 },
        });
        const who = await r1.json().catch(() => ({} as any));
        const uid = Number(who?.id || 0);
        if (!uid) return []; // não logado → nada

        // lista permissões
        const r2 = await fetch(`/api/php/pai_api.php?action=list_permissions&user_id=${uid}`, {
            headers: { cookie, 'x-requested-with': 'XMLHttpRequest' },
            cache: 'no-store',
            // @ts-ignore
            next: { revalidate: 0 },
        });
        const j = await r2.json().catch(() => []);
        return Array.isArray(j) ? j : [];
    } catch {
        return [];
    }
}
