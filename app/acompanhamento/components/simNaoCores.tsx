/**
 * Cores do seletor Sim | Não dos itens (definição de 06/10/2026).
 * - Sim marcado: verde da marca (#5C7A12) com ✓.
 * - Não marcado: cinza-azulado (#4A5672 no claro, #5B6478 no escuro) com ✕.
 * - Lado não marcado: sem fundo e texto apagado, para não confundir com o marcado.
 * - Outras opções (ex.: Natural | Artificial): azul (#313C55 no claro, azul aço #3D6A99 no escuro).
 * Branco como cor de "marcado" foi testado e descartado.
 */
export function classeOpcaoSimNao(valor: string, marcado: boolean): string {
    if (!marcado) {
        return "bg-transparent text-[#7A8396] hover:bg-[#EEF2F7] dark:text-white/50 dark:hover:bg-white/10";
    }
    if (valor === "Sim") return "bg-[#5C7A12] text-white";
    if (valor === "Não") return "bg-[#4A5672] text-white dark:bg-[#5B6478]";
    return "bg-[#313C55] text-white dark:bg-[#3D6A99]";
}

/** ✓ no Sim marcado e ✕ no Não marcado. */
export function MarcaSimNao({ valor, marcado }: { valor: string; marcado: boolean }) {
    if (!marcado || (valor !== "Sim" && valor !== "Não")) return null;
    return (
        <svg viewBox="0 0 24 24" className="mr-1 inline-block size-4 align-[-3px]" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {valor === "Sim" ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M6 6l12 12M18 6L6 18" />}
        </svg>
    );
}
