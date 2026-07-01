"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { IconHome } from "@tabler/icons-react";
import { usePerms } from "./_perms/PermsProvider";

/* ========= Ícone circular ========= */
function QuickIcon({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="grid h-11 w-11 place-items-center rounded-full
      bg-sky-100 text-sky-700
      transition-colors
      group-hover:bg-sky-600 group-hover:text-white
      dark:bg-sky-900/30 dark:text-sky-200
      dark:group-hover:bg-sky-600"
    >
      {children}
    </span>
  );
}

type QuickAction = {
  label: string;
  href: string;
  slug: string;
  icon: React.ReactNode;
};

/* ========= BOTÕES ========= */
const quickActions: QuickAction[] = [
  {
    label: "Serviços Funerários",
    href: "/servicos-funerarios",
    slug: "servicos-funerarios",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M7 7h10M8.5 10h7M10 14h4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M6 19V7a2 2 0 012-2h8a2 2 0 012 2v12"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M8 19h8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: "Plano",
    href: "/plano",
    slug: "plano",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M8 8h8M8 12h8M8 16h6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: "Administrativo",
    href: "/administrativo",
    slug: "administrativo",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M4 20V9a2 2 0 012-2h12a2 2 0 012 2v11"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M4 13h16"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: "Estoque",
    href: "/estoque",
    slug: "estoque",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M7 8l5-3 5 3v10l-5 3-5-3V8z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M7 8l5 3 5-3"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M12 11v10"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: "Produtos",
    href: "/produtos",
    slug: "produtos",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M7 8l5-3 5 3v10l-5 3-5-3V8z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M7 8l5 3 5-3"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M12 11v10"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: "Requisição de Material",
    href: "/requisicao",
    slug: "requisicao",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M8 4h8a2 2 0 012 2v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M9 8h6M9 12h6M9 16h3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M14 17l2 2 4-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export default function HomePage() {
  const { perms, has } = usePerms();

  const [now, setNow] = useState("");
  const [dateStr, setDateStr] = useState("");

  /* ========= relógio ========= */
  useEffect(() => {
    const tick = () => {
      const dt = new Date();

      setNow(
        dt.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );

      const days = [
        "Domingo",
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado",
      ];

      setDateStr(
        `${days[dt.getDay()]}, ${String(dt.getDate()).padStart(
          2,
          "0"
        )}/${String(dt.getMonth() + 1).padStart(
          2,
          "0"
        )}/${dt.getFullYear()}`
      );
    };

    tick();

    const t = setInterval(tick, 1000);

    return () => clearInterval(t);
  }, []);

  if (perms == null) return null;

  const actions = quickActions.filter((a) => has(a.slug));

  return (
    <div className="min-h-[calc(100vh-1px)] bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-6xl px-5 py-5">
        {/* HEADER */}
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <IconHome className="size-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Início</h1>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-right shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="text-sm font-bold">{now}</div>
            <div className="text-[11px] text-muted-foreground">{dateStr}</div>
          </div>
        </header>

        {/* ========= BOTÕES ========= */}
        <section className="mb-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {actions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="group flex flex-col items-center justify-center
                  gap-2.5 rounded-2xl
                  border border-gray-200
                  bg-white px-3 py-4
                  shadow-sm
                  transition-all
                  hover:-translate-y-[1px]
                  hover:shadow-md
                  dark:border-gray-800 dark:bg-gray-900"
              >
                <QuickIcon>{a.icon}</QuickIcon>

                <span className="text-center text-[13px] font-extrabold leading-tight tracking-tight text-gray-900 dark:text-white">
                  {a.label}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}