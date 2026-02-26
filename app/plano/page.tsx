"use client";

import Link from "next/link";
import {
    IconGift,
    IconUsersGroup,
    IconSend,
    IconStethoscope,
    IconUserStar,
} from "@tabler/icons-react";

/* ========= Ações rápidas ========= */
function QuickIcon({ children }: { children: React.ReactNode }) {
    return (
        <span className="grid h-11 w-11 place-items-center rounded-full bg-sky-100 text-sky-700 transition-colors group-hover:bg-sky-600 group-hover:text-white sm:h-12 sm:w-12 dark:bg-sky-900/30 dark:text-sky-200 dark:group-hover:bg-sky-600 dark:group-hover:text-white">
            {children}
        </span>
    );
}

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
        <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
            {/* Cabeçalho */}
            <header className="mb-6 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl border bg-background/70">
                    <IconGift className="size-6 text-primary" />
                </div>

                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Plano</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Gestão do Plano e Benefícios
                    </p>
                </div>
            </header>

            {/* ========= GRID 2 COLUNAS ========= */}
            <section className="grid grid-cols-2 gap-3">
                {items.map(({ title, href, icon: Icon }) => (
                    <Link
                        key={href}
                        href={href}
                        className="group flex items-center gap-3 rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur transition hover:bg-primary/5"
                    >
                        <QuickIcon>
                            <Icon size={22} />
                        </QuickIcon>

                        <span className="text-sm font-semibold sm:text-base">
                            {title}
                        </span>
                    </Link>
                ))}
            </section>
        </div>
    );
}