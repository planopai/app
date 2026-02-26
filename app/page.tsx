"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { IconHome } from "@tabler/icons-react";
import { usePerms } from "./_perms/PermsProvider";

/* ========= Ações rápidas (mesmo padrão) ========= */
function QuickIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid h-11 w-11 place-items-center rounded-full bg-sky-100 text-sky-700 transition-colors group-hover:bg-sky-600 group-hover:text-white sm:h-12 sm:w-12 dark:bg-sky-900/30 dark:text-sky-200 dark:group-hover:bg-sky-600 dark:group-hover:text-white">
      {children}
    </span>
  );
}

type QuickAction = {
  label: string;
  href: string;
  slug: string; // usado para checar permissão
  icon: React.ReactNode;
};

const quickActions: QuickAction[] = [
  {
    label: "Serviços Funerários",
    href: "/servicos-funerarios",
    slug: "servicos-funerarios",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
          strokeLinejoin="round"
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
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M8 8h8M8 12h8M8 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Administrativo",
    href: "/administrativo",
    slug: "administrativo",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 20V9a2 2 0 012-2h12a2 2 0 012 2v11"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path d="M4 13h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Estoque",
    href: "/estoque",
    slug: "estoque",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 8l5-3 5 3v10l-5 3-5-3V8z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M7 8l5 3 5-3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 11v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function HomePage() {
  const { perms, has } = usePerms();

  const [now, setNow] = useState("");
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    const tick = () => {
      const dt = new Date();
      setNow(
        dt
          .toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
          .replace(/\./g, ":")
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
        `${days[dt.getDay()]}, ${String(dt.getDate()).padStart(2, "0")}/${String(
          dt.getMonth() + 1
        ).padStart(2, "0")}/${dt.getFullYear()}`
      );
    };

    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Enquanto as permissões carregam, evita flicker/delay visual
  if (perms == null) {
    return (
      <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="animate-pulse h-8 w-40 rounded bg-muted" />
          <div className="animate-pulse h-10 w-32 rounded bg-muted" />
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted" />
                <div className="h-4 w-36 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const actions = quickActions.filter((a) => has(a.slug));

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <IconHome className="size-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Início</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Bem-vindo! Selecione Uma Opção Abaixo</p>
        </div>

        <div className="rounded-xl border bg-card/60 px-4 py-2 text-right shadow-sm backdrop-blur">
          <div className="text-base font-semibold">{now}</div>
          <div className="text-xs text-muted-foreground">{dateStr}</div>
        </div>
      </header>

      {/* ========= 4 botões (ações rápidas) ========= */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-3 rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur transition hover:bg-primary/5"
          >
            <QuickIcon>{a.icon}</QuickIcon>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold sm:text-base">{a.label}</div>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur">
        <h4 className="mb-1 text-sm font-semibold">Dicas Para Solução de Problemas No App</h4>
        <ul className="text-sm text-muted-foreground">
          <li className="mb-1">• Saia da Conta e Faça Login Novamente.</li>
          <li>• Desative e Ative Novamente a Internet.</li>
          <li>• Limpe o Cache do App</li>
        </ul>
      </section>
    </div>
  );
}