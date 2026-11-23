"use client";

/**
 * 23/11/2026: a tela Separar foi unificada com o Painel de Requisições.
 * Este endereço continua existindo (menu antigo, Início, Estoque) e abre a tela única.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RequisicoesRedireciona() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/dashboard-requisicoes");
    }, [router]);

    return (
        <main className="min-h-[100dvh] bg-[#F6F8FB] px-4 pt-8 text-center text-sm font-bold text-[#5B6478] [contain:inline-size] dark:bg-[#161C2A] dark:text-[#AEB9CF]">
            Abrindo Requisições...
        </main>
    );
}
