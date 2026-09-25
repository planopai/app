import {
    IconLayoutDashboard,
    IconClipboardList,
    IconFileText,
    IconBuildingSkyscraper,
    IconFlower,
    IconBell,
    IconUserStar,
    IconUsersGroup,
    IconSend,
    IconStethoscope,
    IconGift,
    IconUserCog,
    IconShieldLock,
    IconReportAnalytics,
    IconHeadset,
    IconDoor,
    IconBook,
    IconChartBar,
} from "@tabler/icons-react";

export type LinkItem = {
    slug: string;
    title: string;
    href: string;
    Icon: any;
};

export type LinkGroup = {
    category: string;
    items: LinkItem[];
};

export const LINK_GROUPS: LinkGroup[] = [
    {
        category: "Serviços Funerários",
        items: [
            { slug: "quadro-acompanhamento", title: "Quadro de Acompanhamento", href: "/quadro-acompanhamento", Icon: IconLayoutDashboard },
            { slug: "acompanhamento", title: "Atendimentos", href: "/acompanhamento", Icon: IconClipboardList },
            { slug: "catalogo", title: "Catálogo", href: "/catalogo", Icon: IconBook },
            { slug: "obituario", title: "Obituário", href: "/obituario", Icon: IconFileText },
            { slug: "memorial", title: "Memorial", href: "/memorial", Icon: IconBuildingSkyscraper },
            { slug: "coroa-de-flores", title: "Coroa de Flores", href: "/coroa-de-flores", Icon: IconFlower },
            { slug: "avisos", title: "Avisos", href: "/avisos", Icon: IconBell },
        ],
    },

    {
        category: "Plano",
        items: [
            { slug: "associados", title: "Associados", href: "/associados", Icon: IconUserStar },
            { slug: "parceiros", title: "Descontos", href: "/parceiros", Icon: IconUsersGroup },
            { slug: "noticias", title: "Enviar Notícias", href: "/noticias", Icon: IconSend },
            { slug: "medicos", title: "Médicos Parceiros", href: "/medicos", Icon: IconStethoscope },
            { slug: "relatorio-guias", title: "Relatório de Consultas", href: "/relatorio-guias", Icon: IconChartBar },
            { slug: "sorteios", title: "Sorteios", href: "/sorteios", Icon: IconGift },
        ],
    },

    {
        category: "Administrativo",
        items: [
            { slug: "usuarios", title: "Usuários", href: "/usuarios", Icon: IconUserCog },
            { slug: "permissoes", title: "Permissões", href: "/permissoes", Icon: IconShieldLock },
            { slug: "config-catalogo", title: "Configurações do Catálogo", href: "/config-catalogo", Icon: IconBook },
            { slug: "relatorio", title: "Relatório", href: "/relatorio", Icon: IconReportAnalytics },
            { slug: "leads", title: "Leads", href: "/leads", Icon: IconUsersGroup },
        ],
    },

    {
        category: "Estoque",
        items: [
            { slug: "assistencia", title: "Materiais de Assistência", href: "/assistencia", Icon: IconHeadset },
            { slug: "geral", title: "Estoque Geral", href: "/geral", Icon: IconDoor },
        ],
    },
];