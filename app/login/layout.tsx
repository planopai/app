/**
 * app/login/layout.tsx (19/11/2026)
 *
 * O layout principal ficou estático (desempenho). A tela de login usa useSearchParams (o "next" da URL)
 * e continua sendo montada a cada acesso, como antes.
 */
export const dynamic = "force-dynamic";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return children;
}
