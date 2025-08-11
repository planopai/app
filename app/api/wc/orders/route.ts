import { NextResponse } from "next/server";
import { getWC } from "@/lib/woocommerce";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const wc = getWC();
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") || 1);
    const per_page = Math.min(Number(searchParams.get("per_page") || 20), 100);
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;
    const after = searchParams.get("after") || undefined;
    const before = searchParams.get("before") || undefined;

    const params: Record<string, any> = { page, per_page };
    if (status) params.status = status;
    if (search) params.search = search;
    if (after) params.after = after;
    if (before) params.before = before;

    const { data, headers } = await wc.get("orders", params);
    const total = Number(headers["x-wp-total"] || 0);
    const totalPages = Number(headers["x-wp-totalpages"] || 0);

    return NextResponse.json({ data, meta: { page, per_page, total, totalPages } });
}
