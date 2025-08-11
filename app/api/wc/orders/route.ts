import { NextResponse } from "next/server";
import { wc } from "@/lib/woocommerce";

// GET /api/wc/orders?status=processing&page=1&per_page=20&search=...
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") || 1);
    const per_page = Math.min(Number(searchParams.get("per_page") || 20), 100);
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;
    const after = searchParams.get("after") || undefined;   // ISO (filtrar recentes)
    const before = searchParams.get("before") || undefined; // ISO

    const params: Record<string, any> = { page, per_page };
    if (status) params.status = status;
    if (search) params.search = search;
    if (after) params.after = after;
    if (before) params.before = before;

    const { data, headers } = await wc.get("orders", params);

    // WordPress REST envia totais nos headers
    const total = Number(headers["x-wp-total"] || 0);
    const totalPages = Number(headers["x-wp-totalpages"] || 0);

    return NextResponse.json({ data, meta: { page, per_page, total, totalPages } });
}
