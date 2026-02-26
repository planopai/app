"use client";

import Link from "next/link";
import {
    IconBuildingSkyscraper,
    IconHeadset,
    IconDoor,
} from "@tabler/icons-react";

/* ========= Ícone padrão ========= */
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

/* ========= ITENS ========= */
const items = [
    {
        title: "Materiais de Assistência",
        href: "/assistencia",
        desc: "Materiais usados na assistência",
        icon: IconHeadset,
    },
    {
        title: "Estoque Geral",
        href: "/geral",
        desc: "Administre todo o estoque",
        icon: IconDoor,
    },
];

export default function EstoquePage() {
    return (
        <div className="min-h-[calc(100vh-1px)] bg-gray-50 dark:bg-gray-950">
            <div className="mx-auto max-w-6xl px-5 py-5">

                {/* HEADER */}
                <header className="mb-5 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                        <IconBuildingSkyscraper className="size-5 text-primary" />
                    </div>

                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Estoque
                        </h1>

                        <p className="mt-1 text-[13px] text-muted-foreground">
                            Gerenciamento de estoque
                        </p>
                    </div>
                </header>

                {/* ========= GRID PADRÃO APP ========= */}
                <section>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {items.map(({ title, href, desc, icon: Icon }) => (
                            <Link
                                key={href}
                                href={href}
                                className="
                  group flex flex-col items-center justify-center
                  gap-2.5
                  rounded-2xl
                  border border-gray-200
                  bg-white
                  py-4 px-3
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

                                <div className="text-center">
                                    <p className="text-[13px] font-extrabold text-gray-900 dark:text-white leading-tight">
                                        {title}
                                    </p>

                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        {desc}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

            </div>
        </div>
    );
}