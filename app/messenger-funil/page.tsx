"use client";

// 25/11/2026 (vendas unificadas no Comercial): o Funil de vendas antigo saiu do menu. O endereço antigo continua valendo e leva para Comercial › Vendas (aba Funil).
// A versão anterior desta tela está em BACKUP/unificacao-vendas-2026-11-25.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/comercial-vendas");
    }, [router]);
    return <div className="p-6 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">Abrindo as Vendas…</div>;
}
