"use client";

import Link from "next/link";
import {
    IconGift,
    IconUsersGroup,
    IconSend,
    IconStethoscope,
    IconUserStar,
} from "@tabler/icons-react";

/* ========= Ícone circular (padrão global) ========= */
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
        title: "Associados",
        href: "/associados",
        icon: IconUserStar,
    },
    {
        title: "Descontos",
        href: "/parceiros",
        icon: IconUsersGroup,
    },
    {
        title: "Enviar Notícias",
        href: "/noticias",
        icon: IconSend,
    },
    {
        title: "Médicos Parceiros",
        href: "/medicos",
        icon: IconStethoscope,
    },
    {
        title: "Sorteios",
        href: "/sorteios",
        icon: IconGift,
    },
];

export default function PlanoPage() {
    return (
        <div className="min-h-[calc(100vh-1px)] bg-gray-50 dark:bg-gray-950">
            <div className="mx-auto max-w-6xl px-5 py-5">

                {/* HEADER */}
                <header className="mb-5 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                        <IconGift className="size-5 text-primary" />
                    </div>

                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Plano
                        </h1>

                        
                    </div>
                </header>

                {/* ========= GRID PADRÃO APP ========= */}
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

                                <span
                                    className="
                    text-[13px]
                    font-extrabold
                    tracking-tight
                    text-center
                    leading-tight
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