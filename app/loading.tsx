/**
 * app/loading.tsx (19/11/2026)
 *
 * Aparece NA HORA ao tocar numa aba, atalho ou item do menu, enquanto a próxima tela termina de carregar.
 * Antes o app ficava parado na tela anterior e parecia que não tinha respondido ao toque.
 * Fica dentro do layout (menu e barra de baixo continuam no lugar).
 */
export default function Carregando() {
    return (
        <div className="min-h-[60vh] w-full px-4 pb-28 pt-5 lg:px-8 lg:pt-8" aria-busy="true" aria-live="polite">
            <span className="sr-only">Carregando…</span>
            <div className="mx-auto max-w-[1360px] animate-pulse">
                <div className="h-7 w-48 rounded-lg bg-[#E3E8F0] dark:bg-white/10" />
                <div className="mt-2 h-4 w-72 max-w-full rounded-md bg-[#EEF2F7] dark:bg-white/[0.06]" />
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-24 rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.08] dark:bg-[#1C2334]" />
                    ))}
                </div>
            </div>
        </div>
    );
}
