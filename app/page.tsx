"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { IconHome, IconChevronRight } from "@tabler/icons-react";
import { usePerms } from "./_perms/PermsProvider";
import { LINKS } from "./_perms/links";

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
      setDateStr(`${days[dt.getDay()]}, ${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Enquanto permissões carregam
  if (perms == null) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6 md:pt-10 md:pb-12">
        <div className="text-sm opacity-60">Carregando…</div>
      </div>
    );
  }

  // Grupos do layout
  const topSlugs = new Set(["quadro-atendimento", "acompanhamento"]);
  const bottomSlugs = new Set(["obituario", "leads", "coroa-de-flores", "relatorio", "administrativo"]);

  const top = LINKS.filter(l => topSlugs.has(l.slug) && has(l.slug));
  const memorial = LINKS.find(l => l.slug === "memorial" && has(l.slug));
  const clube = LINKS.find(l => l.slug === "clube" && has(l.slug));
  const bottom = LINKS.filter(l => bottomSlugs.has(l.slug) && has(l.slug));

  return (
    <div className="mx-auto w-full max-w-6xl p-6 md:pt-10 md:pb-12">
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

      {/* GRID principal (top + memorial + clube + bottom) */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {top.map(({ label, href, Icon }) => (
          <Link key={href} href={href} className="group rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur transition hover:bg-primary/5">
            <div className="flex items-start gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl border bg-background/70">
                <Icon className="size-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold leading-tight">{label}</h3>
                  <IconChevronRight className="size-4 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
                </div>
              </div>
            </div>
          </Link>
        ))}

        {memorial && (
          <Link href={memorial.href} className="group rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur transition hover:bg-primary/5">
            <div className="flex items-start gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl border bg-background/70">
                <memorial.Icon className="size-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold leading-tight">{memorial.label}</h3>
                  <IconChevronRight className="size-4 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Acesse Atendimento, Salas, Segurança e Mensagens.
                </p>
              </div>
            </div>
          </Link>
        )}

        {clube && (
          <Link href={clube.href} className="group rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur transition hover:bg-primary/5">
            <div className="flex items-start gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl border bg-background/70">
                <clube.Icon className="size-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold leading-tight">{clube.label}</h3>
                  <IconChevronRight className="size-4 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Benefícios, parceiros e gestão do clube.
                </p>
              </div>
            </div>
          </Link>
        )}

        {bottom.map(({ label, href, Icon }) => (
          <Link key={href} href={href} className="group rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur transition hover:bg-primary/5">
            <div className="flex items-start gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl border bg-background/70">
                <Icon className="size-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold leading-tight">{label}</h3>
                  <IconChevronRight className="size-4 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur">
        <h4 className="mb-1 text-sm font-semibold">Dicas Rápidas Para Usuários</h4>
        <ul className="text-sm text-muted-foreground">
          <li className="mb-1">• Reiniciar sua sessão pode corrigir eventuais problemas.</li>
          <li>• Desative e ative novamente sua conexão para restaurar a estabilidade.</li>
        </ul>
      </section>
    </div>
  );
}
