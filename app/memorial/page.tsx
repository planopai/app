"use client";

import Link from "next/link";
import {
    IconBuildingSkyscraper,
    IconHeadset,
    IconShieldLock,
    IconMessage2,
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

/* ========= ITEMS ========= */
const items = [
    {
        title: "Painel",
        href: "/atendimento",
        icon: IconHeadset,
    },
    {
        title: "Compartilhamento",
        href: "/salas",
        icon: IconDoor,
    },
    {
        title: "Segurança",
        href: "/seguranca",
        icon: IconShieldLock,
    },
    {
        title: "Mensagens",
        href: "/mensagens",
        icon: IconMessage2,
    },
];

export default function MemorialPage() {
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
                            Memorial
                        </h1>

                        
                    </div>
                </header>

                {/* ========= QUICK MENU GRID ========= */}
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

                                <p className="text-center text-[13px] font-extrabold text-gray-900 dark:text-white leading-tight">
                                    {title}
                                </p>
                            </Link>
                        ))}
                    </div>
                </section>

            </div>
        </div>
    );
}