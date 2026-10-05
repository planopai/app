import { redirect } from "next/navigation";

/** /indicadores não tem tela própria: os indicadores ficam no módulo Gestão. */
export default function Page() {
    redirect("/gestao");
}
