"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { IconHome } from "@tabler/icons-react";
import { usePerms } from "./_perms/PermsProvider";

/* ========= Ações rápidas (EXATO padrão do seu exemplo “correto”) ========= */
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
  slug: string;
  icon: React.ReactNode;
};

const quickActions: QuickAction[] = [
  {
    label: "Serviços Funerários",
    href: "/servicos-funerarios",
    slug: "servicos-funerarios",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 7h10M8.5 10h7M10 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path
          d="M6 19V7a2 2 0 012-2h8a2 2 0 012 2v12"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M8 19h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
          .toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          .replace(/\./g, ":")
      );

      const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
      setDateStr(
        `${days[dt.getDay()]}, ${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(
          2,
          "0"
        )}/${dt.getFullYear()}`
      );
    };

    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Enquanto as permissões carregam
  if (perms == null) {
    return (
      <div className="font-[Nunito]">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 xl:px-8">
          <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="animate-pulse h-8 w-40 rounded bg-muted" />
            <div className="animate-pulse h-10 w-32 rounded bg-muted" />
          </header>

          <section className="mb-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-muted sm:h-12 sm:w-12" />
                    <div className="h-4 w-24 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="animate-pulse h-4 w-64 rounded bg-muted" />
            <div className="mt-3 space-y-2">
              <div className="animate-pulse h-3 w-72 rounded bg-muted" />
              <div className="animate-pulse h-3 w-80 rounded bg-muted" />
              <div className="animate-pulse h-3 w-56 rounded bg-muted" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const actions = quickActions.filter((a) => has(a.slug));

  return (
    <div className="font-[Nunito]">
      <div className="min-h-[calc(100vh-1px)] bg-gray-50 dark:bg-gray-950">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 xl:px-8">
          <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <IconHome className="size-6 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight">Início</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Bem-vindo! Selecione Uma Opção Abaixo</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-right shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="text-base font-semibold">{now}</div>
              <div className="text-xs text-muted-foreground">{dateStr}</div>
            </div>
          </header>

          {/* ✅ AÇÕES RÁPIDAS (mesma estética do exemplo) */}
          <section className="mb-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {actions.map((a) => (
                <Link
                  key={a.label}
                  href={a.href}
                  className={[
                    "group flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm",
                    "transition-all hover:-translate-y-0.5 hover:shadow-md",
                    "dark:border-gray-800 dark:bg-gray-900",
                  ].join(" ")}
                  aria-label={`Ir para ${a.label}`}
                >
                  <QuickIcon>{a.icon}</QuickIcon>
                  <span className="text-sm font-extrabold text-gray-900 dark:text-white">{a.label}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* DICAS */}
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h4 className="mb-2 text-sm font-extrabold text-gray-900 dark:text-white">
              Dicas Para Solução de Problemas No App
            </h4>
            <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
              <li>• Saia da Conta e Faça Login Novamente.</li>
              <li>• Desative e Ative Novamente a Internet.</li>
              <li>• Limpe o Cache do App</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}