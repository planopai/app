import { NextResponse } from "next/server";
import { wc } from "@/lib/woocommerce";

export async function GET(_: Request, { params }: { params: { id: string } }) {
    const { data } = await wc.get(`orders/${params.id}`);
    return NextResponse.json(data);
}
