"use client";

// Painel de gestão do estoque (chave painel-estoque, módulo Gestão).
// Saiu da tela de Estoque; o painel continua em app/estoque/PainelGestaoEstoque.tsx.

import React from "react";
import PainelGestaoEstoque from "../estoque/PainelGestaoEstoque";
import { useEstoqueDados } from "../estoque/components/useEstoqueDados";

export default function Page() {
    const { produtos, saldos, depositos, categorias, classificacoes, loading, initErr } = useEstoqueDados();

    return (
        <main className="min-h-[100dvh] bg-[#F6F8FB] text-[#313C55] dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-3 px-4 pb-5 pt-4 lg:gap-4 lg:px-10 lg:pb-12 lg:pt-8">
                <h1 className="text-2xl font-extrabold leading-tight lg:text-[28px]">Painel de gestão do estoque</h1>
                {initErr ? (
                    <div className="rounded-2xl border border-[#B42318] bg-[#FDECEA] p-3 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                        {initErr}
                    </div>
                ) : null}
                {loading && !produtos.length ? (
                    <p className="text-sm text-[#5B6478] dark:text-[#AEB9CF]">Carregando…</p>
                ) : (
                    <PainelGestaoEstoque
                        produtos={produtos}
                        saldos={saldos}
                        depositos={depositos}
                        categorias={categorias}
                        classificacoes={classificacoes}
                    />
                )}
            </div>
        </main>
    );
}
