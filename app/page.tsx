"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  IconHome,
  IconDeviceDesktopAnalytics,
  IconTimeline,
  IconBuildingSkyscraper,
  IconFileText,
  IconUsersGroup,
  IconFlower,
  IconReportAnalytics,
  IconChevronRight,
} from "@tabler/icons-react";

const shortcutsTop = [
  {
    title: "Quadro de Atendimento",
    href: "/quadro-atendimento",
    desc: "Acompanhe o status dos atendimentos em tempo real.",
    icon: IconDeviceDesktopAnalytics,
  },
  {
    title: "Acompanhamento",
    href: "/acompanhamento",
    desc: "Linha do tempo e progresso das etapas.",
    icon: IconTimeline,
  },
];

const shortcutsBottom = [
  {
    title: "Obituário",
    href: "/obituario",
    desc: "Crie e exporte peças para redes sociais.",
    icon: IconFileText,
  },
  {
    title: "Leads",
    href: "/leads",
    desc: "Pesquise, ordene e exporte contatos.",
    icon: IconUsersGroup,
  },
  {
    title: "Coroa de Flores",
    href: "/coroa-de-flores",
    desc: "Gerencie pedidos e catálogo de coroas.",
    icon: IconFlower,
  },
  {
    title: "Relatório",
    href: "/relatorio",
    desc: "Indicadores, métricas e exportações.",
    icon: IconReportAnalytics,
  },
];

export default function HomePage() {
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
      setDateStr(`${days[dt.getDay()]}, ${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <IconHome className="size-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Início</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Bem-vindo! Selecione um módulo abaixo para começar.
          </p>
        </div>
        <div className="rounded-xl border bg-card/60 px-4 py-2 text-right shadow-sm backdrop-blur">
          <div className="text-base font-semibold">{now}</div>
          <div className="text-xs text-muted-foreground">{dateStr}</div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shortcutsTop.map(({ title, href, desc, icon: Icon }) => (
          <Link key={href} href={href} className="group rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur transition hover:bg-primary/5">
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

        {/* Único card para o Memorial */}
        <Link href="/memorial" className="group rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur transition hover:bg-primary/5">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border bg-background/70">
              <IconBuildingSkyscraper className="size-6 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold leading-tight">Memorial</h3>
                <IconChevronRight className="size-4 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Acesse Atendimento, Salas, Segurança e Mensagens.
              </p>
            </div>
          </div>
        </Link>

        {shortcutsBottom.map(({ title, href, desc, icon: Icon }) => (
          <Link key={href} href={href} className="group rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur transition hover:bg-primary/5">
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

      <section className="mt-6 rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur">
        <h4 className="mb-1 text-sm font-semibold">Dicas rápidas</h4>
        <ul className="text-sm text-muted-foreground">
          <li className="mb-1">• Caso seu backend esteja em outro domínio, use um proxy (ex.: <b>/api/php/…</b>) para evitar CORS.</li>
          <li>• Em produção, prefira <b>HTTPS</b> para todas as chamadas.</li>
        </ul>
      </section>
    </div>
  );
}
