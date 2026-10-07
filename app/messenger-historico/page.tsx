"use client";

/**
 * Histórico de atendimentos de clientes (WhatsApp).
 * Rota /messenger-historico · página "messenger-historico" do pai_api.php (Gestão: vê todos os atendimentos).
 * A tela fica em app/messenger/components/Historico.tsx (a mesma que abre pelo botão Histórico do Messenger).
 */
import HistoricoClientes from "../messenger/components/Historico";

export default function MessengerHistoricoPage() {
    return <HistoricoClientes />;
}
