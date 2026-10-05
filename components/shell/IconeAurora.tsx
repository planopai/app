import * as React from "react";

/**
 * Ícone da Aurora: balão de conversa com o brilho de IA dentro.
 * Mesmo desenho dos demais ícones do menu (24 × 24, traço 1,8, pontas arredondadas, cor = currentColor).
 * Aceita `size` (como os ícones do Tabler) ou `className` (ex.: "size-5").
 */
export const ICONE_AURORA_BALAO = "M7.9 20A9 9 0 1 0 4 16.1L2 22Z";
export const ICONE_AURORA_BRILHO = "M12.5 7l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3L8 11.5l3.3-1.2z";

export function IconeAurora({ size, className, strokeWidth = 1.8, ...resto }: React.SVGProps<SVGSVGElement> & { size?: number | string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            className={className}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            {...resto}
        >
            <path d={ICONE_AURORA_BALAO} />
            <path d={ICONE_AURORA_BRILHO} />
        </svg>
    );
}

export default IconeAurora;
