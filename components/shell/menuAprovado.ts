/**
 * Organização do menu aprovada em 17/11/2026 (croqui "Estrutura do PAI Conecta"): 11 módulos, seções com nomes curtos
 * e os nomes novos das telas. O Administrativo deixa de existir; Requisições e Estoque viram um módulo só.
 *
 * Não muda nada sozinho: na tela Organizar menu, o botão "Carregar organização aprovada" põe esta organização no
 * rascunho e a Gestão confere e salva (a versão anterior fica no histórico). Os ids são os do modulos.tsx.
 * Nada aqui libera ou bloqueia tela: quem decide é a permissão de cada tela.
 */
import type { ConfigMenu } from "./menuOrganizado";

const m = (id: string, titulo: string, desc: string, icone: string, itens: [string, string?][]) => ({
    id,
    titulo,
    desc,
    icone,
    itens: itens.map(([i, secao]) => (secao ? { id: i, secao } : { id: i })),
});

export const MENU_APROVADO: ConfigMenu = {
    v: 1,
    fixos: ["inicio", "messenger", "chat"],
    removidos: ["requisicoes", "administrativo"],
    modulos: [
        m("atendimento", "Atendimento", "O serviço funerário, do chamado à homenagem", "clipboard-list", [
            ["quadro"], ["atendimentos"], ["orcamento"], ["coroas"], ["homenagens"], ["salas-tv"], ["avisos"], ["historico-sepultamentos"],
        ]),
        m("estoque", "Requisições e Estoque", "Pedir, separar, guardar e contar produtos", "package", [
            ["dashboard-requisicoes", "Requisições"], ["solicitar-produto", "Requisições"], ["minhas-solicitacoes", "Requisições"], ["requisicoes", "Requisições"],
            ["estoque", "Estoque"], ["entrada-estoque", "Estoque"], ["dashboard-estoque", "Estoque"], ["consulta", "Estoque"], ["assistencia", "Estoque"], ["catalogo", "Estoque"],
            ["config-catalogo", "Estoque"], ["relatorio-sintetico", "Estoque"],
        ]),
        m("financeiro", "Financeiro", "OS, contas, caixas e resultados", "currency-dollar", [
            ["minhasos", "Ordem de Serviço"], ["financeiro", "Ordem de Serviço"], ["os-relatorio", "Ordem de Serviço"], ["convenio", "Ordem de Serviço"],
            ["contas-pagar", "Saídas"], ["cartao-credito", "Saídas"],
            ["tesouraria", "Dinheiro e Recebimentos"], ["contas-receber", "Dinheiro e Recebimentos"], ["messenger-comprovantes", "Dinheiro e Recebimentos"],
            ["dre", "Resultados"], ["fluxo-caixa", "Resultados"], ["fin-orcamento", "Resultados"], ["resultados", "Resultados"], ["financeiro-config", "Resultados"],
        ]),
        m("pessoal", "Pessoal", "Folha de pagamento dos colaboradores", "wallet", [
            ["folha", "Folha de Pagamento"], ["folha-regras", "Folha de Pagamento"], ["folha-vales", "Folha de Pagamento"], ["folha-avaliacao", "Folha de Pagamento"],
            ["folha-comissoes", "Folha de Pagamento"], ["folha-viagens", "Folha de Pagamento"], ["folha-painel", "Folha de Pagamento"],
        ]),
        m("plano", "Plano", "Associados, adesões e a rede de benefícios", "shield-lock", [
            ["associados"],
            ["parceiros", "Rede de Descontos"], ["medicos", "Rede de Descontos"], ["relatorio-guias", "Rede de Descontos"],
            ["sorteios", "Comunicação com o Associado"], ["noticias", "Comunicação com o Associado"],
        ]),
        m("contratos", "Contratos", "Contratos, beneficiários, planos e regras", "file-text", [ // 18/11/2026
            ["contratos", "Contratos"], ["contratos-planos", "Configurações"], ["contratos-regras", "Configurações"],
        ]),
        // 25/11/2026: vendas unificadas no Comercial. Vendas (funil de cada um, Vender plano, Minhas vendas) é de todos;
        // Adesões (Propostas de Adesão: WhatsApp, site, venda direta e Novo contrato numa fila só) é do Administrativo e da Gestão.
        // Saíram: Funil antigo (/messenger-funil) e Plano › Adesões › Site e WhatsApp (/novos-planos, /messenger-propostas).
        m("comercial", "Comercial", "Vendas, adesões, campanhas e contatos", "briefcase", [
            ["comercial-vendas", "Vendas"], ["propostas-adesao", "Adesões"], ["messenger-funil-gestao", "Resultados"],
            ["messenger-disparos", "Contatos"], ["leads", "Contatos"],
        ]),
        m("qualidade", "Qualidade", "Como a família e o cliente foram atendidos", "award", [
            ["visita-avaliacao", "Família"], ["pos-atendimento", "Família"],
            ["messenger-ocorrencias", "WhatsApp"], ["historico-clientes", "WhatsApp"], ["messenger-monitor", "WhatsApp"],
        ]),
        m("indicadores", "Indicadores", "Painéis para acompanhar a empresa", "chart-bar", [
            ["desempenho"], ["indicadores-financeiro"], ["painel-estoque", "Estoque"], ["balanco", "Outros"], ["telemetria", "Outros"],
        ]),
        m("aurora", "Aurora", "Como a assistente aprende e atende", "sparkles", [
            ["conhecimento"], ["messenger-config"], ["messenger-habilidades"], ["messenger-testes"], ["messenger-aprendizado"],
        ]),
        m("gestao", "Gestão", "Pessoas, acesso e menu", "user-cog", [
            ["usuarios"], ["permissoes"], ["auditoria"], ["organizar-menu"],
        ]),
    ],
    nomes: {
        chat: "Aurora",
        coroas: "Coroas de Flores",
        "historico-sepultamentos": "Histórico de Atendimentos",
        "dashboard-requisicoes": "Painel",
        "solicitar-produto": "Nova",
        "minhas-solicitacoes": "Minhas",
        requisicoes: "Separar",
        "dashboard-estoque": "Reposição",
        consulta: "Consultar Produto",
        assistencia: "Materiais de Assistência",
        catalogo: "Catálogo de Vendas",
        "config-catalogo": "Configurações do Catálogo",
        "relatorio-sintetico": "Estoque por Depósito",
        financeiro: "Ordens de Serviço",
        "os-relatorio": "Relatórios",
        "contas-pagar": "Contas a Pagar",
        "cartao-credito": "Cartão de Crédito",
        "contas-receber": "Contas a Receber",
        resultados: "Fechamento e Contador",
        "financeiro-config": "Configurações do Financeiro",
        folha: "Folha",
        "folha-regras": "Regras de Pagamento",
        "folha-vales": "Vales e Empréstimos",
        "folha-avaliacao": "Avaliação",
        "folha-painel": "Painel",
        "relatorio-guias": "Guias e Consultas",
        noticias: "Notícias do App",
        "comercial-vendas": "Vendas",
        "propostas-adesao": "Propostas de Adesão",
        "messenger-funil-gestao": "Resultados do Funil",
        "messenger-disparos": "Campanhas e Lembretes",
        leads: "Contatos do Velório Online",
        "visita-avaliacao": "Visita durante a Cerimônia",
        "historico-clientes": "Histórico",
        "messenger-monitor": "Monitor",
        desempenho: "Desempenho dos Atendimentos",
        "painel-estoque": "Análise",
        balanco: "Margem dos Produtos",
        telemetria: "Veículos e Rotas",
        conhecimento: "Base de Conhecimento",
        "messenger-habilidades": "Habilidades",
        "messenger-testes": "Testes",
        "messenger-aprendizado": "Aprendizado",
        usuarios: "Colaboradores e Acessos",
        "organizar-menu": "Organizar Menu",
    },
};
