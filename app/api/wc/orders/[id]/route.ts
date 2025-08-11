import { NextResponse } from "next/server";
import { getWC } from "@/lib/woocommerce";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: { id: string } }) {
    try {
        const wc = getWC();
        const { data } = await wc.get(`orders/${params.id}`);
        return NextResponse.json(data);
    } catch (err: any) {
        const status = err?.response?.status || 500;
        const data = err?.response?.data;
        console.error("WC order detail error:", status, data || err?.message);
        return NextResponse.json(
            { error: true, status, message: data?.message || err?.message, details: data || null },
            { status }
        );
    }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const wc = getWC();
        const body = await req.json();
        const { data } = await wc.put(`orders/${params.id}`, body);
        return NextResponse.json(data);
    } catch (err: any) {
        const status = err?.response?.status || 500;
        const data = err?.response?.data;
        console.error("WC order patch error:", status, data || err?.message);
        return NextResponse.json(
            { error: true, status, message: data?.message || err?.message, details: data || null },
            { status }
        );
    }
}
