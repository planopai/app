/**
 * app/aba/page.tsx — "aba reserva" das abas do computador (19/11/2026, ver lib/abas.ts e components/app-shell.tsx).
 *
 * Não é uma tela de uso: fica carregada e escondida para que a próxima tela aberta em aba só troque de tela,
 * sem carregar o app do zero. Não entra no menu nem nas permissões. Aberta direto, só mostra um aviso.
 */
export default function AbaReserva() {
    return (
        <div className="grid min-h-[50vh] place-items-center p-6 text-center text-[14px] font-bold text-[#5B6478] dark:text-[#AEB9CF]">
            Abra uma tela pelo menu.
        </div>
    );
}
