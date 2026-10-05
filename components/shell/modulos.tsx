"use client";

/**
 * Estrutura de módulos do app PAI (organograma aprovado).
 *
 * Só agrupa o que já existe: cada item aponta para uma tela e para a chave de página (slug) que já controla o acesso
 * no pai_api.php. Nada aqui altera permissões. slug "*" = todos os usuários (Quadro, Minhas OS, Chat e Avisos).
 *
 * Chaves NOVAS (só das páginas de entrada dos módulos; ver PAGINAS_NOVAS.md): comunicacao, modulo-estoque, financeiro, gestao.
 * Enquanto uma chave nova não estiver no pai_api.php, o módulo continua aparecendo (pelas telas que o usuário já tem)
 * e o clique no módulo abre a primeira tela liberada em vez da página de entrada.
 */

import React from "react";
import { rotaExiste } from "./rotas";
import {
    IconAlertTriangle,
    IconBell,
    IconBook,
    IconBrain,
    IconBuildingStore,
    IconCar,
    IconChartBar,
    IconClipboardList,
    IconClipboardCheck,
    IconClipboardPlus,
    IconCurrencyDollar,
    IconDeviceDesktopAnalytics,
    IconEye,
    IconFileInvoice,
    IconFlower,
    IconGift,
    IconHeartHandshake,
    IconHome,
    IconListDetails,
    IconLayoutDashboard,
    IconBuildingWarehouse,
    IconMessageCircle,
    IconMessages,
    IconMicroscope,
    IconNews,
    IconPackage,
    IconReportAnalytics,
    IconSearch,
    IconSettings,
    IconShieldLock,
    IconSpeakerphone,
    IconStar,
    IconStethoscope,
    IconTruckDelivery,
    IconUserCog,
    IconUserPlus,
    IconUsersGroup,
} from "@tabler/icons-react";

export type Icone = React.ElementType<any>;

export type ItemModulo = {
    titulo: string;
    desc: string;
    href: string;
    /** Chaves de página que liberam o item (qualquer uma). "*" = todos. */
    slugs: string[];
    icone: Icone;
    /** Quando a mesma tela tem duas chaves/rotas (ex.: geral e estoque), a rota segue a chave que o usuário tem. */
    alternativas?: { slug: string; href: string }[];
    /** Subtítulo que agrupa itens dentro do módulo (ex.: "Indicadores" em Gestão). Itens da mesma seção devem ficar juntos. */
    secao?: string;
    /** Endereços reais a tentar, em ordem, se `href` não existir em app/ (ex.: pasta renomeada). */
    fallbacks?: string[];
    /** Chave do contador (useContadores) mostrado como selo. */
    selo?: "aguardando" | "coroas" | "estoque" | "avisos" | "messenger";
};

export type Modulo = {
    id: string;
    titulo: string;
    desc: string;
    icone: Icone;
    /** Página de entrada do módulo (hub). */
    hub: { href: string; slug: string };
    itens: ItemModulo[];
    /** Módulo visível para todos (Comunicação). */
    paraTodos?: boolean;
    selo?: "estoque";
};

export const FIXOS: ItemModulo[] = [
    { titulo: "Início", desc: "Resumo do dia", href: "/", slugs: ["*"], icone: IconHome },
    { titulo: "Quadro de Atendimentos", desc: "Andamento em tempo real", href: "/quadro-acompanhamento", slugs: ["*"], icone: IconDeviceDesktopAnalytics },
    { titulo: "Minhas OS", desc: "Ordens que você abriu", href: "/os/minhas", slugs: ["*"], icone: IconFileInvoice },
    { titulo: "Chat", desc: "Converse com a Aurora", href: "/chat", slugs: ["*"], icone: IconMessageCircle },
    { titulo: "Avisos", desc: "Comunicados da equipe", href: "/avisos", slugs: ["*"], icone: IconBell, selo: "avisos" },
];

export const MODULOS: Modulo[] = [
    {
        id: "atendimento",
        titulo: "Atendimento",
        desc: "Registro, velório e memorial",
        icone: IconClipboardList,
        hub: { href: "/servicos-funerarios", slug: "servicos-funerarios" },
        itens: [
            { titulo: "Atendimentos", desc: "Registro e histórico", href: "/acompanhamento", slugs: ["acompanhamento"], icone: IconClipboardList, selo: "aguardando" },
            { titulo: "Homenagens", desc: "Livro de homenagens", href: "/mensagens", slugs: ["mensagens"], icone: IconHeartHandshake },
            { titulo: "Visita de avaliação", desc: "Avaliação das visitas", href: "/avaliacao", slugs: ["visita-avaliacao"], icone: IconEye },
            { titulo: "Coroa de Flores", desc: "Coroas naturais e artificiais", href: "/coroa-de-flores", slugs: ["coroa-de-flores"], icone: IconFlower, selo: "coroas" },
        ],
    },
    {
        id: "comunicacao",
        titulo: "Comunicação",
        desc: "Chat e avisos",
        icone: IconSpeakerphone,
        paraTodos: true,
        hub: { href: "/comunicacao", slug: "comunicacao" },
        itens: [
            { titulo: "Messenger", desc: "Equipe, grupos e clientes", href: "/messenger", slugs: ["messenger"], icone: IconMessages, selo: "messenger" },
            { titulo: "Chat (Aurora)", desc: "Converse com a Aurora", href: "/chat", slugs: ["chat"], icone: IconMessageCircle },
            { titulo: "Avisos", desc: "Comunicados da equipe", href: "/avisos", slugs: ["avisos"], icone: IconBell, selo: "avisos" },
        ],
    },
    {
        id: "requisicoes",
        titulo: "Requisições",
        desc: "Material entre setores",
        icone: IconClipboardCheck,
        hub: { href: "/requisicao", slug: "requisicao" },
        itens: [
            { titulo: "Solicitar Produto", desc: "Nova requisição", href: "/solicitar-produto", slugs: ["solicitar-produto"], icone: IconClipboardPlus },
            { titulo: "Minhas Solicitações", desc: "Histórico das suas requisições", href: "/minhas-solicitacoes", slugs: ["minhas-solicitacoes"], icone: IconClipboardList },
            { titulo: "Requisições", desc: "Separar e enviar material", href: "/requisicoes", slugs: ["requisicoes"], icone: IconTruckDelivery },
            { titulo: "Dashboard Requisições", desc: "Indicadores e atrasos", href: "/dashboard-requisicoes", slugs: ["dashboard-requisicoes"], icone: IconChartBar },
        ],
    },
    {
        id: "estoque",
        titulo: "Estoque",
        desc: "Produtos, consulta e conferência",
        icone: IconPackage,
        selo: "estoque",
        hub: { href: "/modulo-estoque", slug: "modulo-estoque" },
        itens: [
            { titulo: "Estoque", desc: "Produtos, entradas e conferência", href: "/estoque", slugs: ["estoque", "geral"], icone: IconPackage, selo: "estoque", alternativas: [{ slug: "estoque", href: "/estoque" }, { slug: "geral", href: "/geral" }] },
            { titulo: "Consulta", desc: "Pesquisa rápida de itens", href: "/produtos", slugs: ["produtos"], icone: IconSearch },
            { titulo: "Assistência", desc: "Administração de materiais", href: "/assistencia", slugs: ["assistencia"], icone: IconBuildingStore },
            { titulo: "Catálogo", desc: "Itens e valores", href: "/catalogo", slugs: ["catalogo"], icone: IconBook },
            { titulo: "Configurações do catálogo", desc: "Etapas e obrigatoriedade", href: "/config-catalogo", slugs: ["config-catalogo"], icone: IconSettings },
            { titulo: "Relatório sintético", desc: "Estoque por depósito", href: "/relatorio-sintetico", slugs: ["relatorio-sintetico", "geral", "estoque"], icone: IconListDetails },
        ],
    },
    {
        id: "financeiro",
        titulo: "Financeiro",
        desc: "OS, convênios e relatórios",
        icone: IconCurrencyDollar,
        hub: { href: "/financeiro", slug: "financeiro" },
        itens: [
            { titulo: "Financeiro da OS", desc: "Painel, recebimentos e devoluções", href: "/os/financeiro", slugs: ["os-financeiro"], icone: IconCurrencyDollar },
            { titulo: "Relatório de OS", desc: "Particular, diferença e coroa", href: "/os/relatorio", slugs: ["os-relatorio"], icone: IconReportAnalytics },
            { titulo: "Convênios", desc: "Planos, prefeituras e itens", href: "/convenio", slugs: ["convenio"], icone: IconShieldLock },
        ],
    },
    {
        id: "plano",
        titulo: "Plano",
        desc: "Associados, parceiros e notícias",
        icone: IconShieldLock,
        hub: { href: "/plano", slug: "plano" },
        itens: [
            { titulo: "Associados", desc: "Cadastro de associados", href: "/associados", slugs: ["associados"], icone: IconUsersGroup },
            { titulo: "Parceiros", desc: "Descontos e rede de parceiros", href: "/parceiros", slugs: ["parceiros"], icone: IconHeartHandshake },
            { titulo: "Médicos", desc: "Rede de atendimento", href: "/medicos", slugs: ["medicos"], icone: IconStethoscope },
            { titulo: "Sorteios", desc: "Sorteios para associados", href: "/sorteios", slugs: ["sorteios"], icone: IconGift },
            { titulo: "Clube PAI", desc: "Benefícios do clube", href: "/clube", slugs: ["clube"], icone: IconStar },
            { titulo: "Notícias", desc: "Mensagens para o app dos clientes", href: "/noticias", slugs: ["noticias"], icone: IconNews },
        ],
    },
    {
        id: "administrativo",
        titulo: "Administrativo",
        desc: "Leads, pós-atendimento e consultas",
        icone: IconSettings,
        hub: { href: "/administrativo", slug: "administrativo" },
        itens: [
            { titulo: "Leads do velório", desc: "Contatos do velório online", href: "/leads", slugs: ["leads"], icone: IconUserPlus },
            { titulo: "Pós-atendimento", desc: "Avaliação depois do serviço", href: "/avaliacao", slugs: ["pos-atendimento-avaliacao"], icone: IconStar },
            { titulo: "Relatório de consultas", desc: "Consultas realizadas", href: "/relatorio-guias", slugs: ["relatorio-guias"], icone: IconStethoscope },
        ],
    },
    {
        id: "gestao",
        titulo: "Gestão",
        desc: "Pessoas, segurança e indicadores",
        icone: IconChartBar,
        hub: { href: "/gestao", slug: "gestao" },
        itens: [
            { titulo: "Balanço", desc: "Custo, receita e margem", href: "/balanco", slugs: ["balanco"], icone: IconCurrencyDollar, secao: "Indicadores" },
            { titulo: "Dashboard", desc: "Gráficos e tabela do painel", href: "/dashboard", slugs: ["dashboard"], icone: IconLayoutDashboard, secao: "Indicadores" },
            { titulo: "Desempenho", desc: "Painel de atendimentos", href: "/desempenho", slugs: ["desempenho"], icone: IconChartBar, secao: "Indicadores" },
            { titulo: "Painel de gestão do estoque", desc: "Indicadores do estoque", href: "/estoque?aba=gestao", slugs: ["estoque"], icone: IconBuildingWarehouse, secao: "Indicadores" },
            { titulo: "Usuários", desc: "Contas e cargos", href: "/usuarios", slugs: ["usuarios"], icone: IconUserCog, secao: "Administração" },
            { titulo: "Permissões", desc: "Acesso por cargo", href: "/permissoes", slugs: ["permissoes"], icone: IconShieldLock, secao: "Administração" },
            { titulo: "Auditoria", desc: "Quem fez o quê", href: "/auditoria", slugs: ["auditoria", "permissoes"], icone: IconListDetails, secao: "Administração" },
            { titulo: "Histórico de sepultamentos", desc: "Todos os atendimentos", href: "/relatorio", slugs: ["relatorio"], icone: IconReportAnalytics, secao: "Administração" },
            { titulo: "Histórico de clientes", desc: "Atendimentos do WhatsApp encerrados", href: "/messenger-historico", slugs: ["messenger-historico"], icone: IconMessages, secao: "Administração" },
            { titulo: "Telemetria", desc: "Veículos e rotas", href: "/telemetria", slugs: ["telemetria"], icone: IconCar, secao: "Administração" },
            { titulo: "Conhecimento IA", desc: "Base de conhecimento da Aurora", href: "/conhecimento", slugs: ["conhecimento"], icone: IconBrain, secao: "Administração" },
        ],
    },
];

/** Ícone de alerta usado pelo resumo do Início. */
export { IconAlertTriangle, IconMicroscope };

export type TemAcesso = (slug: string) => boolean;

/** Endereços candidatos do item, na ordem: o escolhido pelas permissões (alternativas) → href → fallbacks. */
function candidatos(item: ItemModulo, has: TemAcesso): string[] {
    const alt = item.alternativas?.find((a) => has(a.slug))?.href;
    return [alt, item.href, ...(item.fallbacks || [])].filter(Boolean) as string[];
}

/** Item liberado pelas permissões E com tela existente (evita link para 404). */
export function itemVisivel(item: ItemModulo, has: TemAcesso): boolean {
    const liberado = item.slugs.includes("*") || item.slugs.some((s) => has(s));
    return liberado && candidatos(item, has).some(rotaExiste);
}

/** Rota do item para este usuário: a primeira candidata que existe (senão, o href do item). */
export function hrefDoItem(item: ItemModulo, has: TemAcesso): string {
    const lista = candidatos(item, has);
    return lista.find(rotaExiste) ?? item.href;
}

export function itensVisiveis(m: Modulo, has: TemAcesso): ItemModulo[] {
    return m.itens.filter((i) => itemVisivel(i, has));
}

export function moduloVisivel(m: Modulo, has: TemAcesso): boolean {
    return !!m.paraTodos || itensVisiveis(m, has).length > 0;
}

/** Para onde o clique no módulo leva: a página de entrada, se o usuário a tem; senão a primeira tela liberada. */
export function destinoDoModulo(m: Modulo, has: TemAcesso): string {
    /* A página de entrada só lista as telas que o usuário já tem. Por isso NÃO exige a chave própria do módulo
       (comunicacao, modulo-estoque, financeiro, gestao são novas e ainda não estão liberadas nos cargos). */
    if (rotaExiste(m.hub.href)) return m.hub.href;
    const primeiro = itensVisiveis(m, has)[0];
    return primeiro ? hrefDoItem(primeiro, has) : m.hub.href;
}

export function acharModuloPorRota(pathname: string): { modulo: Modulo | null; item: ItemModulo | null; fixo: ItemModulo | null } {
    const p = pathname.replace(/\/+$/, "") || "/";
    const bate = (href: string) => p === href || p.startsWith(href + "/");

    for (const m of MODULOS) {
        if (bate(m.hub.href)) return { modulo: m, item: null, fixo: null };
        for (const i of m.itens) {
            const hrefs = [i.href, ...(i.alternativas || []).map((a) => a.href)];
            if (hrefs.some(bate)) return { modulo: m, item: i, fixo: null };
        }
    }
    const f = FIXOS.find((x) => bate(x.href));
    return { modulo: null, item: null, fixo: f || null };
}
