"use client";

/**
 * Planos (/contratos-planos, chave contratos-planos) · módulo Contratos — 18/11/2026.
 * Tela reservada para liberar a chave em Permissões desde já. Fase 1 (prévia aprovada em 18/11/2026).
 */
import { IconListDetails } from "@tabler/icons-react";
import { TopoPagina } from "@/components/shell/ModuloHub";

export default function Page() {
    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina Icone={IconListDetails} titulo="Planos" />
                <div className="rounded-2xl border border-[#E3E8F0] bg-white p-6 text-[15px] leading-relaxed dark:border-white/[0.12] dark:bg-[#232B3F]">
                    <b className="block text-[17px] font-extrabold">Em construção</b>
                    <span className="mt-1 block text-[#5B6478] dark:text-[#AEB9CF]">O cadastro dos planos (preços, regras, aditivos e documentos) chega na fase 1, logo depois do banco de dados.</span>
                </div>
            </div>
        </div>
    );
}
