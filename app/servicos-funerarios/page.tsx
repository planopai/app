"use client";

import React from "react";
import Link from "next/link";
import {
    IconLayoutDashboard,
    IconClipboardList,
    IconFileText,
    IconBuildingSkyscraper,
    IconBell,
    IconBook,
} from "@tabler/icons-react";

/* ========= Ícone circular ========= */
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

/* ========= BOTÕES ========= */
const items = [
    {
        title: "Quadro de Acompanhamento",
        href: "/quadro-acompanhamento",
        icon: IconLayoutDashboard,
    },
    {
        title: "Atendimentos",
        href: "/acompanhamento",
        icon: IconClipboardList,
    },
    {
        title: "Catálogo",
        href: "/catalogo",
        icon: IconBook,
    },
    {
        title: "Obituário",
        href: "/obituario",
        icon: IconFileText,
    },
    {
        title: "Memorial",
        href: "/memorial",
        icon: IconBuildingSkyscraper,
    },
    {
        title: "Avisos",
        href: "/avisos",
        icon: IconBell,
    },
];

export default function ServicosFunerariosPage() {
    return (
        <div className="min-h-[calc(100vh-1px)] bg-gray-50 dark:bg-gray-950">
            <div className="mx-auto max-w-6xl px-5 py-5">

                {/* HEADER */}
                <header className="mb-5 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                        <IconClipboardList className="size-5 text-primary" />
                    </div>

                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Serviços Funerários
                        </h1>
                    </div>
                </header>

                {/* ========= GRID ========= */}
                <section>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {items.map(({ title, href, icon: Icon }) => (
                            <Link
                                key={href}
                                href={href}
                                className="
                  group flex flex-col items-center justify-center
                  gap-2.5
                  rounded-2xl
                  border border-gray-200
                  bg-white
                  px-3 py-4
                  shadow-sm
                  transition-all
                  hover:-translate-y-[1px]
                  hover:shadow-md
                  dark:border-gray-800 dark:bg-gray-900
                "
                            >
                                <QuickIcon>
                                    <Icon size={22} />
                                </QuickIcon>

                                <span
                                    className="
                    text-center
                    text-[13px]
                    font-extrabold
                    leading-tight
                    tracking-tight
                    text-gray-900
                    dark:text-white
                  "
                                >
                                    {title}
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>

            </div>
        </div>
    );
}