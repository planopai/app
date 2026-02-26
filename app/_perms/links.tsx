// app/_perms/links.tsx
import {
    IconDeviceDesktopAnalytics,
    IconTimeline,
    IconBuildingSkyscraper,
    IconFileText,
    IconUsersGroup,
    IconFlower,
    IconReportAnalytics,
    IconSettings,
    IconBuildingWarehouse,
    IconBriefcase, // Serviços Funerários
    IconId,        // Plano
} from "@tabler/icons-react";

export type LinkItem = {
    slug: string; // deve bater com permissoes.pagina no MySQL
    label: string;
    href: string;
    Icon: any;
};

// defina aqui os itens visíveis na Home/Menu
export const LINKS: LinkItem[] = [
    // bloco de cima (home)
    {
        slug: "quadro-atendimento",
        label: "Quadro de Atendimento",
        href: "/quadro-atendimento",
        Icon: IconDeviceDesktopAnalytics,
    },
    {
        slug: "acompanhamento",
        label: "Acompanhamento",
        href: "/acompanhamento",
        Icon: IconTimeline,
    },

    // novos grupos (home)
    {
        slug: "servicos-funerarios",
        label: "Serviços Funerários",
        href: "/servicos-funerarios",
        Icon: IconBriefcase,
    },
    {
        slug: "plano",
        label: "Plano",
        href: "/plano",
        Icon: IconId,
    },

    // cards soltos (home)
    { slug: "memorial", label: "Memorial", href: "/memorial", Icon: IconBuildingSkyscraper },
    { slug: "clube", label: "Clube PAI", href: "/clube", Icon: IconUsersGroup },

    // bloco de baixo (home)
    { slug: "obituario", label: "Obituário", href: "/obituario", Icon: IconFileText },
    { slug: "leads", label: "Leads", href: "/leads", Icon: IconUsersGroup },
    { slug: "coroa-de-flores", label: "Coroa de Flores", href: "/coroa-de-flores", Icon: IconFlower },
    { slug: "relatorio", label: "Relatório", href: "/relatorio", Icon: IconReportAnalytics },

    // estoque
    { slug: "estoque", label: "Estoque", href: "/estoque", Icon: IconBuildingWarehouse },

    // administrativo
    { slug: "administrativo", label: "Administrativo", href: "/administrativo", Icon: IconSettings },
];