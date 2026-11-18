"use client";

/**
 * Contratos (/contratos, chave contratos) · módulo Contratos — 18/11/2026.
 * Tela reservada para liberar a chave em Permissões desde já. Lista e ficha dos contratos e beneficiários: fase 2.
 */
import { IconFileText } from "@tabler/icons-react";
import { TopoPagina } from "@/components/shell/ModuloHub";

export default function Page() {
    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina Icone={IconFileText} titulo="Contratos" />
                <div className="rounded-2xl border border-[#E3E8F0] bg-white p-6 text-[15px] leading-relaxed dark:border-white/[0.12] dark:bg-[#232B3F]">
                    <b className="block text-[17px] font-extrabold">Em construção</b>
                    <span className="mt-1 block text-[#5B6478] dark:text-[#AEB9CF]">A lista e a ficha dos contratos, com os beneficiários e os aditivos, chegam na fase 2. Por enquanto os contratos continuam na Unymos.</span>
                </div>
            </div>
        </div>
    );
}
