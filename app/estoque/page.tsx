"use client";

import Link from "next/link";
import {
    IconBuildingSkyscraper,
    IconHeadset,
    IconShieldLock,
    IconMessage2,
    IconDoor,
    IconChevronRight,
} from "@tabler/icons-react";

const items = [
    {
        title: "Materiais de Assistência",
        href: "/assistencia",
        desc: "Materiais Usados Na Assistência",
        icon: IconHeadset,
    },
    {
        title: "Estoque Geral",
        href: "/geral",
        desc: "Administre Todo o Estoque",
        icon: IconDoor,
    },

];

export default function MemorialPage() {
    return (
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
            {/* Cabeçalho */}
            <header className="mb-6 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl border bg-background/70">
                    <IconBuildingSkyscraper className="size-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Estoque</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Gerenciamento de Estoque.
                    </p>
                </div>
            </header>

            {/* Grid 4  */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {items.map(({ title, href, desc, icon: Icon }) => (
                    <Link
                        key={href}
                        href={href}
                        className="group rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur transition hover:bg-primary/5"
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex size-11 items-center justify-center rounded-xl border bg-background/70">
                                <Icon className="size-6 text-primary" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-base font-semibold leading-tight">{title}</h3>
                                    <IconChevronRight className="size-4 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
                            </div>
                        </div>
                    </Link>
                ))}
            </section>
        </div>
    );
}