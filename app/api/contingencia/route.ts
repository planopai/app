import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-server'

export async function GET() {
    const { data, error } = await supabase
        .schema('pai')
        .from('os_ordens')
        .select('id')
        .limit(1)

    if (error) {
        return NextResponse.json(
            {
                ok: false,
                erro: error.message,
            },
            { status: 500 }
        )
    }

    return NextResponse.json({
        ok: true,
        modo: 'contingencia',
        supabase: 'conectado',
        teste: data,
    })
}