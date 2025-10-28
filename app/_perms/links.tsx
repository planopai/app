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
} from "@tabler/icons-react";

export type LinkItem = {
    slug: string;   // deve bater com permissoes.pagina no MySQL
    label: string;
    href: string;
    Icon: any;
};

// defina aqui os itens visíveis na Home/Menu
export const LINKS: LinkItem[] = [
    // bloco de cima (home)
    { slug: 'quadro-atendimento', label: 'Quadro de Atendimento', href: '/quadro-atendimento', Icon: IconDeviceDesktopAnalytics },
    { slug: 'acompanhamento', label: 'Acompanhamento', href: '/acompanhamento', Icon: IconTimeline },

    // cards soltos
    { slug: 'memorial', label: 'Memorial', href: '/memorial', Icon: IconBuildingSkyscraper },
    { slug: 'clube', label: 'Clube PAI', href: '/clube', Icon: IconUsersGroup },

    // bloco de baixo (home)
    { slug: 'obituario', label: 'Obituário', href: '/obituario', Icon: IconFileText },
    { slug: 'leads', label: 'Leads', href: '/leads', Icon: IconUsersGroup },
    { slug: 'coroa-de-flores', label: 'Coroa de Flores', href: '/coroa-de-flores', Icon: IconFlower },
    { slug: 'relatorio', label: 'Relatório', href: '/relatorio', Icon: IconReportAnalytics },
    { slug: 'administrativo', label: 'Administrativo', href: '/administrativo', Icon: IconSettings },
];

// se quiser listar "inicio" também, adicione { slug:'inicio', label:'Início', href:'/inicio', Icon: ... }
