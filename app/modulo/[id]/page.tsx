"use client";

/**
 * Página de entrada dos módulos criados pela Gestão em Organizar menu (08/10/2026): /modulo/<id>.
 * Sem chave de página própria: mostra só as telas que o usuário já pode abrir (como as outras entradas de módulo).
 */
import { useParams } from "next/navigation";
import ModuloHub from "@/components/shell/ModuloHub";

export default function ModuloCriadoPage() {
    const params = useParams() as { id?: string | string[] } | null;
    const id = String(Array.isArray(params?.id) ? params?.id[0] : params?.id || "");
    return <ModuloHub moduloId={id} />;
}
