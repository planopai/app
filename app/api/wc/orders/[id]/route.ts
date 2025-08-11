import { NextResponse } from "next/server";
import { getWC } from "@/lib/woocommerce";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
    const wc = getWC();
    const { data } = await wc.get(`orders/${params.id}`);
    return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const wc = getWC();
    const body = await req.json(); // { status: "processing" } etc.
    const { data } = await wc.put(`orders/${params.id}`, body);
    return NextResponse.json(data);
}
