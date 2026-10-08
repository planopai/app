"use client";

/**
 * Estrutura de módulos do app PAI (organograma aprovado).
 *
 * Só agrupa o que já existe: cada item aponta para uma tela e para a chave de página (slug) que já controla o acesso
 * no pai_api.php. Nada aqui altera permissões. slug "*" = todos os usuários (Início, Quadro, Minhas OS e Chat).
 * 05/10/2026: Obituário, Memorial, Salas e Segurança saíram do app; Avisos saiu dos fixos (fica no sino e em Comunicação)
 * e o Messenger entrou nos fixos (só para quem tem a página "messenger").
 *
 * Chaves NOVAS (só das páginas de entrada dos módulos; ver PAGINAS_NOVAS.md): comunicacao, modulo-estoque, financeiro, gestao.
 * Enquanto uma chave nova não estiver no pai_api.php, o módulo continua aparecendo (pelas telas que o usuário já tem)
 * e o clique no módulo abre a primeira tela liberada em vez da página de entrada.
 *
 * 08/10/2026 (Organizar menu): MODULOS e FIXOS abaixo são o PADRÃO do sistema. A Gestão reorganiza pelo app
 * (tela /organizar-menu, gravado pelo menu_modulos.php) e cada usuário ajusta a própria visão (Personalizar menu).
 * Quem desenha o menu usa useMenu() (components/shell/useMenu.tsx), que junta o padrão, a organização e as preferências.
 * Cada tela tem um id fixo (não mudar depois de publicado: a organização salva e os atalhos usam o id).
 * Tela nova: acrescente aqui, no módulo em que ela deve nascer; ela aparece sozinha mesmo com o menu já organizado.
 * Gestão dividida em seções; Histórico de sepultamentos passou para o Administrativo.
 */

import React from "react";
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
    IconLayoutSidebar,
    IconListDetails,
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
    /** Id fixo da tela (organização do menu e atalhos). */
    id: string;
    titulo: string;
    desc: string;
    href: string;
    /** Chaves de página que liberam o item (qualquer uma). "*" = todos. */
    slugs: string[];
    icone: Icone;
    /** Quando a mesma tela tem duas chaves/rotas (ex.: geral e estoque), a rota segue a chave que o usuário tem. */
    alternativas?: { slug: string; href: string }[];
    /** Chave do contador (useContadores) mostrado como selo. */
    selo?: "aguardando" | "coroas" | "estoque" | "avisos" | "messenger";
    /** Seção dentro do módulo (ex.: "Pessoas e acesso"). Telas da mesma seção ficam juntas. */
    secao?: string;
};

export type Modulo = {
    id: string;
    titulo: string;
    desc: string;
    icone: Icone;
    /** Página de entrada do módulo (hub). slug "" = módulo criado pela Gestão (entrada /modulo/<id>, aberta a quem vê alguma tela dele). */
    hub: { href: string; slug: string };
    itens: ItemModulo[];
    /** Módulo visível para todos (Comunicação). */
    paraTodos?: boolean;
    selo?: "estoque";
};

export const FIXOS: ItemModulo[] = [
    { id: "inicio", titulo: "Início", desc: "Resumo do dia", href: "/", slugs: ["*"], icone: IconHome },
    { id: "quadro", titulo: "Quadro de Atendimentos", desc: "Andamento em tempo real", href: "/quadro-acompanhamento", slugs: ["*"], icone: IconDeviceDesktopAnalytics },
    { id: "minhasos", titulo: "Minhas OS", desc: "Ordens que você abriu", href: "/os/minhas", slugs: ["*"], icone: IconFileInvoice },
    { id: "messenger", titulo: "Messenger", desc: "Equipe, grupos e clientes", href: "/messenger", slugs: ["messenger"], icone: IconMessages, selo: "messenger" },
    { id: "chat", titulo: "Chat", desc: "Converse com a Aurora", href: "/chat", slugs: ["*"], icone: IconMessageCircle },
];

export const MODULOS: Modulo[] = [
    {
        id: "atendimento",
        titulo: "Atendimento",
        desc: "Registro, homenagens e coroas",
        icone: IconClipboardList,
        hub: { href: "/servicos-funerarios", slug: "servicos-funerarios" },
        itens: [
            { id: "atendimentos", titulo: "Atendimentos", desc: "Registro e histórico", href: "/acompanhamento", slugs: ["acompanhamento"], icone: IconClipboardList, selo: "aguardando" },
            { id: "homenagens", titulo: "Homenagens", desc: "Livro de homenagens", href: "/mensagens", slugs: ["mensagens"], icone: IconHeartHandshake },
            { id: "visita-avaliacao", titulo: "Visita de avaliação", desc: "Avaliação das visitas", href: "/avaliacao", slugs: ["visita-avaliacao", "avaliacao"], icone: IconEye },
            { id: "coroas", titulo: "Coroa de Flores", desc: "Coroas naturais e artificiais", href: "/coroa-de-flores", slugs: ["coroa-de-flores"], icone: IconFlower, selo: "coroas" },
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
            { id: "messenger", titulo: "Messenger", desc: "Equipe, grupos e clientes", href: "/messenger", slugs: ["messenger"], icone: IconMessages, selo: "messenger" },
            { id: "chat", titulo: "Chat (Aurora)", desc: "Converse com a Aurora", href: "/chat", slugs: ["chat"], icone: IconMessageCircle },
            { id: "avisos", titulo: "Avisos", desc: "Comunicados da equipe", href: "/avisos", slugs: ["avisos"], icone: IconBell, selo: "avisos" },
        ],
    },
    {
        id: "requisicoes",
        titulo: "Requisições",
        desc: "Material entre setores",
        icone: IconClipboardCheck,
        hub: { href: "/requisicao", slug: "requisicao" },
        itens: [
            { id: "solicitar-produto", titulo: "Solicitar Produto", desc: "Nova requisição", href: "/solicitar-produto", slugs: ["solicitar-produto"], icone: IconClipboardPlus },
            { id: "minhas-solicitacoes", titulo: "Minhas Solicitações", desc: "Histórico das suas requisições", href: "/minhas-solicitacoes", slugs: ["minhas-solicitacoes"], icone: IconClipboardList },
            { id: "requisicoes", titulo: "Requisições", desc: "Separar e enviar material", href: "/requisicoes", slugs: ["requisicoes"], icone: IconTruckDelivery },
            { id: "dashboard-requisicoes", titulo: "Dashboard Requisições", desc: "Indicadores e atrasos", href: "/dashboard-requisicoes", slugs: ["dashboard-requisicoes"], icone: IconChartBar },
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
            { id: "estoque", titulo: "Estoque", desc: "Produtos, entradas e conferência", href: "/estoque", slugs: ["estoque", "geral"], icone: IconPackage, selo: "estoque", alternativas: [{ slug: "estoque", href: "/estoque" }, { slug: "geral", href: "/geral" }] },
            { id: "consulta", titulo: "Consulta", desc: "Pesquisa rápida de itens", href: "/produtos", slugs: ["produtos"], icone: IconSearch },
            { id: "assistencia", titulo: "Assistência", desc: "Administração de materiais", href: "/assistencia", slugs: ["assistencia"], icone: IconBuildingStore },
            { id: "catalogo", titulo: "Catálogo", desc: "Itens e valores", href: "/catalogo", slugs: ["catalogo"], icone: IconBook },
            { id: "config-catalogo", titulo: "Configurações do catálogo", desc: "Etapas e obrigatoriedade", href: "/config-catalogo", slugs: ["config-catalogo"], icone: IconSettings },
            { id: "relatorio-sintetico", titulo: "Relatório sintético", desc: "Estoque por depósito", href: "/relatorio-sintetico", slugs: ["relatorio-sintetico", "geral", "estoque"], icone: IconListDetails },
        ],
    },
    {
        id: "financeiro",
        titulo: "Financeiro",
        desc: "OS, convênios e relatórios",
        icone: IconCurrencyDollar,
        hub: { href: "/financeiro", slug: "financeiro" },
        itens: [
            { id: "financeiro", titulo: "Financeiro da OS", desc: "Painel, recebimentos e devoluções", href: "/os/financeiro", slugs: ["os-financeiro"], icone: IconCurrencyDollar },
            { id: "os-relatorio", titulo: "Relatório de OS", desc: "Particular, diferença e coroa", href: "/os/relatorio", slugs: ["os-relatorio"], icone: IconReportAnalytics },
            { id: "convenio", titulo: "Convênios", desc: "Planos, prefeituras e itens", href: "/convenio", slugs: ["convenio"], icone: IconShieldLock },
        ],
    },
    {
        id: "plano",
        titulo: "Plano",
        desc: "Associados, parceiros e notícias",
        icone: IconShieldLock,
        hub: { href: "/plano", slug: "plano" },
        itens: [
            { id: "associados", titulo: "Associados", desc: "Cadastro de associados", href: "/associados", slugs: ["associados"], icone: IconUsersGroup },
            { id: "parceiros", titulo: "Parceiros", desc: "Descontos e rede de parceiros", href: "/parceiros", slugs: ["parceiros"], icone: IconHeartHandshake },
            { id: "medicos", titulo: "Médicos", desc: "Rede de atendimento", href: "/medicos", slugs: ["medicos"], icone: IconStethoscope },
            { id: "sorteios", titulo: "Sorteios", desc: "Sorteios para associados", href: "/sorteios", slugs: ["sorteios"], icone: IconGift },
            { id: "clube", titulo: "Clube PAI", desc: "Benefícios do clube", href: "/clube", slugs: ["clube"], icone: IconStar },
            { id: "noticias", titulo: "Notícias", desc: "Mensagens para o app dos clientes", href: "/noticias", slugs: ["noticias"], icone: IconNews },
        ],
    },
    {
        id: "administrativo",
        titulo: "Administrativo",
        desc: "Leads, pós-atendimento e consultas",
        icone: IconSettings,
        hub: { href: "/administrativo", slug: "administrativo" },
        itens: [
            { id: "leads", titulo: "Leads do velório", desc: "Contatos do velório online", href: "/leads", slugs: ["leads"], icone: IconUserPlus },
            { id: "pos-atendimento", titulo: "Pós-atendimento", desc: "Avaliação depois do serviço", href: "/avaliacao", slugs: ["pos-atendimento-avaliacao"], icone: IconStar },
            { id: "relatorio-guias", titulo: "Relatório de consultas", desc: "Consultas realizadas", href: "/relatorio-guias", slugs: ["relatorio-guias"], icone: IconStethoscope },
            { id: "historico-sepultamentos", titulo: "Histórico de sepultamentos", desc: "Todos os atendimentos", href: "/relatorio", slugs: ["relatorio"], icone: IconReportAnalytics },
        ],
    },
    {
        id: "gestao",
        titulo: "Gestão",
        desc: "Pessoas, permissões e indicadores",
        icone: IconChartBar,
        hub: { href: "/gestao", slug: "gestao" },
        itens: [
            { id: "usuarios", titulo: "Usuários", desc: "Contas e cargos", href: "/usuarios", slugs: ["usuarios"], icone: IconUserCog, secao: "Pessoas e acesso" },
            { id: "permissoes", titulo: "Permissões", desc: "Acesso por cargo", href: "/permissoes", slugs: ["permissoes"], icone: IconShieldLock, secao: "Pessoas e acesso" },
            { id: "auditoria", titulo: "Auditoria", desc: "Quem fez o quê", href: "/auditoria", slugs: ["auditoria", "permissoes"], icone: IconListDetails, secao: "Pessoas e acesso" },
            { id: "organizar-menu", titulo: "Organizar menu", desc: "Módulos, seções e telas do menu", href: "/organizar-menu", slugs: ["gestao"], icone: IconLayoutSidebar, secao: "Pessoas e acesso" },
            { id: "balanco", titulo: "Balanço", desc: "Custo, receita e margem", href: "/balanco", slugs: ["balanco"], icone: IconCurrencyDollar, secao: "Indicadores" },
            { id: "desempenho", titulo: "Desempenho", desc: "Painel de atendimentos", href: "/desempenho", slugs: ["desempenho"], icone: IconChartBar, secao: "Indicadores" },
            { id: "dashboard-estoque", titulo: "Dashboard do estoque", desc: "Saídas e transferências por produto", href: "/dashboard-estoque", slugs: ["dashboard-estoque"], icone: IconChartBar, secao: "Indicadores" },
            { id: "painel-estoque", titulo: "Painel do estoque", desc: "Consumo, cobertura e reposição", href: "/painel-estoque", slugs: ["painel-estoque"], icone: IconReportAnalytics, secao: "Indicadores" },
            { id: "telemetria", titulo: "Telemetria", desc: "Veículos e rotas", href: "/telemetria", slugs: ["telemetria"], icone: IconCar, secao: "Indicadores" },
            { id: "historico-clientes", titulo: "Histórico de clientes", desc: "Atendimentos do WhatsApp encerrados", href: "/messenger-historico", slugs: ["messenger-historico"], icone: IconMessages, secao: "Históricos" },
            { id: "conhecimento", titulo: "Conhecimento IA", desc: "Base de conhecimento da Aurora", href: "/conhecimento", slugs: ["conhecimento"], icone: IconBrain, secao: "Aurora" },
        ],
    },
];

/** Ícone de alerta usado pelo resumo do Início. */
export { IconAlertTriangle, IconMicroscope };

export type TemAcesso = (slug: string) => boolean;

export function itemVisivel(item: ItemModulo, has: TemAcesso): boolean {
    return item.slugs.includes("*") || item.slugs.some((s) => has(s));
}

/** Rota do item para este usuário (resolve as alternativas, como geral/estoque). */
export function hrefDoItem(item: ItemModulo, has: TemAcesso): string {
    if (item.alternativas) {
        const alt = item.alternativas.find((a) => has(a.slug));
        if (alt) return alt.href;
    }
    return item.href;
}

export function itensVisiveis(m: Modulo, has: TemAcesso): ItemModulo[] {
    return m.itens.filter((i) => itemVisivel(i, has));
}

export function moduloVisivel(m: Modulo, has: TemAcesso): boolean {
    return !!m.paraTodos || itensVisiveis(m, has).length > 0;
}

/** Para onde o clique no módulo leva: a página de entrada, se o usuário a tem; senão a primeira tela liberada. */
export function destinoDoModulo(m: Modulo, has: TemAcesso): string {
    if (m.paraTodos || !m.hub.slug || has(m.hub.slug)) return m.hub.href;
    const primeiro = itensVisiveis(m, has)[0];
    return primeiro ? hrefDoItem(primeiro, has) : m.hub.href;
}

/** Módulo e tela da rota. Passe os módulos e fixos do useMenu() para seguir a organização feita pela Gestão. */
export function acharModuloPorRota(
    pathname: string,
    modulos: Modulo[] = MODULOS,
    fixos: ItemModulo[] = FIXOS,
): { modulo: Modulo | null; item: ItemModulo | null; fixo: ItemModulo | null } {
    const p = pathname.replace(/\/+$/, "") || "/";
    const bate = (href: string) => p === href || p.startsWith(href + "/");

    for (const m of modulos) {
        if (bate(m.hub.href)) return { modulo: m, item: null, fixo: null };
        for (const i of m.itens) {
            const hrefs = [i.href, ...(i.alternativas || []).map((a) => a.href)];
            if (hrefs.some(bate)) return { modulo: m, item: i, fixo: null };
        }
    }
    const f = fixos.find((x) => bate(x.href));
    return { modulo: null, item: null, fixo: f || null };
}
