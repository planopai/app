import { ENDPOINT } from "./api";
import type { Produto, ProdutoFoto } from "./tipos";

// Endereços das fotos dos produtos.

export const IMG_BASE = ENDPOINT; // ✅

export function normalizeImgUrl(u?: string | null) {
    const t = (u ?? "").toString().trim();
    if (!t || t === "null" || t === "undefined") return null;

    // ✅ base64
    if (/^data:image\//i.test(t)) return t;

    // ✅ blob preview (se algum dia usar)
    if (/^blob:/i.test(t)) return t;

    // ✅ url completa
    if (/^https?:\/\//i.test(t)) return t;

    // ✅ caminhos já em uploads
    const clean = t.startsWith("/") ? t : `/${t}`;
    if (clean.startsWith("/uploads/")) return `${IMG_BASE}${clean}`;

    // ✅ só nome do arquivo
    return `${IMG_BASE}/uploads/produtos/${t.replace(/^\/+/, "")}`;
}

export function resolveProdutoFotoUrl(f?: ProdutoFoto | null) {
    if (!f) return null;
    return normalizeImgUrl(f.foto_url || f.arquivo || null);
}

export function getProdutoFotos(p?: Produto | null): ProdutoFoto[] {
    if (!p) return [];
    if (Array.isArray(p.fotos) && p.fotos.length) {
        return [...p.fotos].sort((a, b) => {
            const pa = Number(a.is_principal || 0) === 1 ? 0 : 1;
            const pb = Number(b.is_principal || 0) === 1 ? 0 : 1;
            if (pa !== pb) return pa - pb;
            return Number(a.ordem || 0) - Number(b.ordem || 0);
        });
    }

    if (p.foto_url) {
        return [
            {
                id: 0,
                produto_id: p.id,
                arquivo: p.foto_url,
                foto_url: p.foto_url,
                legenda: null,
                ordem: 1,
                is_principal: 1,
            },
        ];
    }

    return [];
}

export function getProdutoFotoPrincipal(p?: Produto | null) {
    const fotos = getProdutoFotos(p);
    if (!fotos.length) return normalizeImgUrl(p?.foto_url || null);
    const principal = fotos.find((f) => Number(f.is_principal || 0) === 1) || fotos[0];
    return resolveProdutoFotoUrl(principal);
}
