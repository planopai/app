"use client";

// 25/11/2026 (vendas unificadas no Comercial): a tela Novos planos (adesões do site) saiu do menu. O endereço antigo continua valendo e leva para Comercial › Adesões › Propostas de Adesão, filtrada no Site.
// A versão anterior desta tela está em BACKUP/unificacao-vendas-2026-11-25.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
    const router = useRouter();
    useEffect(() => {
        const id = new URLSearchParams(window.location.search).get("id");
        router.replace(id ? `/propostas-adesao?origem=site&site=${encodeURIComponent(id)}` : "/propostas-adesao?origem=site");
    }, [router]);
    return <div className="p-6 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">Abrindo as Propostas de Adesão…</div>;
}
