"use client";

// Dashboard de movimentações do estoque (chave dashboard-estoque, módulo Gestão).
// Saiu da tela de Estoque; usa as mesmas peças de app/estoque/components.

import React, { useEffect } from "react";
import { useEstoqueDados } from "../estoque/components/useEstoqueDados";
import { useDashboard } from "../estoque/components/dashboard/useDashboard";
import { AbaDashboard } from "../estoque/components/dashboard/AbaDashboard";

export default function Page() {
    const n = useEstoqueDados();
    const dash = useDashboard(n);
    const { setTab, loading, initErr } = n;

    useEffect(() => {
        setTab("DASHBOARD");
        void dash.loadDashboardMovimentos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <main className="min-h-[100dvh] bg-[#F6F8FB] text-[#313C55] dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-3 px-4 pb-5 pt-4 lg:gap-4 lg:px-10 lg:pb-12 lg:pt-8">
                <h1 className="text-2xl font-extrabold leading-tight lg:text-[28px]">Dashboard do estoque</h1>
                {initErr ? (
                    <div className="rounded-2xl border border-[#B42318] bg-[#FDECEA] p-3 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                        {initErr}
                    </div>
                ) : null}
                {loading && !n.produtos.length ? <p className="text-sm text-[#5B6478] dark:text-[#AEB9CF]">Carregando…</p> : null}
                <AbaDashboard n={n} dash={dash} />
            </div>
        </main>
    );
}
