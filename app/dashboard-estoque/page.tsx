"use client";

// Dashboard do estoque (chave dashboard-estoque, módulo Gestão) — 13/10/2026.
// Conferência e reposição: Reposições · Divergências · Atendimentos · Contagem · Relatórios.
// Substitui o antigo "Dashboard de movimentações". As peças antigas em app/estoque/components/dashboard
// continuam no projeto porque a tela de Estoque ainda as usa.

import DashboardEstoque from "@/components/estoque/DashboardEstoque";

export default function Page() {
    return <DashboardEstoque />;
}
