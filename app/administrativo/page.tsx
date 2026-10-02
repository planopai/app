"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
    IconUserCog,
    IconShieldLock,
    IconSettings,
    IconReportAnalytics,
    IconUsersGroup,
    IconBook,
    IconCar,
    IconChartBar,
    IconCurrencyDollar,
    IconBrain,
} from "@tabler/icons-react";
import { usePerms } from "../_perms/PermsProvider";

function QuickIcon({ children }: { children: React.ReactNode }) {
    return (
        <span
            className="
                grid h-11 w-11 place-items-center rounded-full
                bg-sky-100 text-sky-700
                transition-colors
                group-hover:bg-sky-600 group-hover:text-white
                dark:bg-sky-900/30 dark:text-sky-200
                dark:group-hover:bg-sky-600
            "
        >
            {children}
        </span>
    );
}

type AdminItem = {
    title: string;
    href: string;
    slug: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
};

const items: AdminItem[] = [
    { title: "Usuários", href: "/usuarios", slug: "usuarios", icon: IconUserCog },
    { title: "Permissões", href: "/permissoes", slug: "permissoes", icon: IconShieldLock },
    { title: "Conhecimento IA", href: "/conhecimento", slug: "conhecimento", icon: IconBrain },
    { title: "Configurações do Catálogo", href: "/config-catalogo", slug: "config-catalogo", icon: IconBook },
    { title: "Relatório", href: "/relatorio", slug: "relatorio", icon: IconReportAnalytics },
    { title: "Dashboard", href: "/desempenho", slug: "desempenho", icon: IconChartBar },
    { title: "Balanço", href: "/balanco", slug: "balanco", icon: IconCurrencyDollar },
    { title: "Leads", href: "/leads", slug: "leads", icon: IconUsersGroup },
    { title: "Telemetria", href: "/telemetria", slug: "telemetria", icon: IconCar },

    // Ordens de Serviço / Financeiro
    { title: "Financeiro", href: "/os/financeiro", slug: "os-financeiro", icon: IconCurrencyDollar },
    { title: "Relatório de atendimentos", href: "/os/relatorio", slug: "os-relatorio", icon: IconReportAnalytics },
    { title: "Convênios", href: "/convenio", slug: "convenio", icon: IconUsersGroup },
];

export default function AdministrativoPage() {
    const { perms, has } = usePerms();
    const permissionsReady = perms !== null;

    const visibleItems = useMemo(
        () => (permissionsReady ? items.filter((item) => has(item.slug)) : []),
        [permissionsReady, has]
    );

    return (
        <div className="min-h-[calc(100vh-1px)] bg-gray-50 dark:bg-gray-950">
            <div className="mx-auto max-w-6xl px-5 py-5">
                <header className="mb-5 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                        <IconSettings className="size-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Administrativo
                        </h1>
                    </div>
                </header>

                <section>
                    {!permissionsReady ? (
                        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-6 text-sm font-semibold text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                            Carregando acessos...
                        </div>
                    ) : visibleItems.length === 0 ? (
                        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-6 text-sm font-semibold text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                            Nenhuma função administrativa liberada para este perfil.
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                            {visibleItems.map(({ title, href, icon: Icon }) => (
                                <Link
                                    key={href}
                                    href={href}
                                    className="
                                        group flex flex-col items-center justify-center
                                        gap-2.5 rounded-2xl border border-gray-200
                                        bg-white px-3 py-4 shadow-sm transition-all
                                        hover:-translate-y-[1px] hover:shadow-md
                                        dark:border-gray-800 dark:bg-gray-900
                                    "
                                >
                                    <QuickIcon>
                                        <Icon size={22} />
                                    </QuickIcon>
                                    <span className="text-center text-[13px] font-extrabold leading-tight tracking-tight text-gray-900 dark:text-white">
                                        {title}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
