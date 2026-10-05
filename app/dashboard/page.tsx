import { redirect } from "next/navigation";

/** Endereço antigo. A tela agora fica em /indicadores/dashboard (módulo Gestão → Indicadores). */
export default function Page() {
    redirect("/indicadores/dashboard");
}
