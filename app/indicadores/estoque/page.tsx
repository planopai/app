import { redirect } from "next/navigation";

/** Painel de gestão do estoque: abre a tela de Estoque já na aba "Painel de gestão" (precisa da página "estoque"). */
export default function Page() {
    redirect("/estoque?aba=gestao");
}
