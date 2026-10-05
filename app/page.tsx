"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  IconAlertTriangle,
  IconBuildingSkyscraper,
  IconChevronRight,
  IconFlower,
  IconPackageExport,
  IconPlus,
  IconSearch,
  IconTruckDelivery,
  IconUserCheck,
  IconX,
} from "@tabler/icons-react";
import { usePerms } from "./_perms/PermsProvider";
import { useNaoLidas } from "@/components/messenger/ContadorMenu";
import { FIXOS, MODULOS, destinoDoModulo, hrefDoItem, itemVisivel, moduloVisivel, type Icone } from "@/components/shell/modulos";
import { formatarSelo, useContadores } from "@/components/shell/useContadores";

/**
 * Tela inicial (rota "/"): junta o visual aprovado da repaginada com o que a home anterior já tinha.
 *
 * Da home anterior ficaram: o relógio, a pesquisa de funções (só entram páginas permitidas; casa pelo começo do título),
 * o contador do Messenger (não lidas + fila de clientes) e o filtro por permissões (`usePerms`).
 * Novos: boas-vindas com o nome, resumo de números, "Acesso rápido" (Quadro, Minhas OS, Messenger, Chat e Avisos) e os
 * módulos do organograma.
 *
 * Os números vêm de useContadores (mesmas consultas da home anterior; atendimentos pela regra do Quadro, concluídos não contam).
 * Quando a consulta falha, mostra "—". Não existe mais a rota /inicio: o Início é esta tela.
 */

type Tom = "azul" | "verde" | "amarelo";

const CHIP: Record<Tom, string> = {
  azul: "bg-[#E6F7FE] dark:bg-[#00AEEC]/20",
  verde: "bg-[#EEF5D6] dark:bg-[#B3CE52]/20",
  amarelo: "bg-[#FCF3CC] dark:bg-[#F2CB3F]/15",
};

const CARD =
  "rounded-2xl border border-[#E3E8F0] bg-white shadow-sm transition hover:border-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:hover:border-white/50";

const TOM_MODULO: Record<string, Tom> = {
  atendimento: "azul",
  comunicacao: "azul",
  requisicoes: "amarelo",
  estoque: "amarelo",
  financeiro: "verde",
  plano: "verde",
  administrativo: "verde",
  gestao: "verde",
};

/** Nomes que as pessoas já usavam na pesquisa (a pesquisa continua achando por eles). */
const APELIDOS: { title: string; href: string; slug: string; group: string }[] = [
  { title: "Quadro de Acompanhamento", href: "/quadro-acompanhamento", slug: "quadro-acompanhamento", group: "Atendimento" },
  { title: "Serviços Funerários", href: "/servicos-funerarios", slug: "servicos-funerarios", group: "Atendimento" },
  { title: "Descontos", href: "/parceiros", slug: "parceiros", group: "Plano" },
  { title: "Enviar Notícias", href: "/noticias", slug: "noticias", group: "Plano" },
  { title: "Médicos Parceiros", href: "/medicos", slug: "medicos", group: "Plano" },
  { title: "Relatório de Consultas", href: "/relatorio-guias", slug: "relatorio-guias", group: "Administrativo" },
  { title: "Dashboard", href: "/desempenho", slug: "desempenho", group: "Gestão" },
  { title: "Consulta de Produtos", href: "/produtos", slug: "produtos", group: "Estoque" },
  { title: "Relatório", href: "/relatorio", slug: "relatorio", group: "Gestão" },
  { title: "Requisição de Material", href: "/requisicao", slug: "requisicao", group: "Requisições" },
];

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function saudacao(h: number) {
  if (h < 5) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function dataExtenso(d: Date) {
  const dias = ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dias[d.getDay()]}, ${dd}/${mm}/${d.getFullYear()}`;
}

function dois(n: number | null) {
  return n == null ? "—" : String(n).padStart(2, "0");
}

/** Itens do módulo que o usuário pode abrir (mesma regra do menu). */
function itensVisiveisDe<T extends { slugs: string[] }>(itens: T[], has: (s: string) => boolean): T[] {
  return itens.filter((i) => i.slugs.includes("*") || i.slugs.some((s) => has(s)));
}

export default function HomePage() {
  const { perms, has } = usePerms();
  const c = useContadores(perms, has);
  const [agora, setAgora] = useState<Date | null>(null);
  const [busca, setBusca] = useState("");

  /* Messenger: não lidas + fila de clientes (tempo real) */
  const temMessenger = perms !== null && has("messenger");
  const naoLidas = useNaoLidas(temMessenger);
  const contMessenger = naoLidas.carregado ? naoLidas.total + naoLidas.fila : null;

  useEffect(() => {
    setAgora(new Date());
    const t = window.setInterval(() => setAgora(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const pronto = perms !== null;
  const nome = c.nome ? c.nome.trim().split(/\s+/)[0] : "";

  const resumo = useMemo(() => {
    const itens: { label: string; valor: number | null; href: string; tom: Tom; icon: Icone; mostrar: boolean }[] = [
      { label: "Serviços funerários", valor: c.servicos, href: "/quadro-acompanhamento", tom: "azul", icon: IconBuildingSkyscraper, mostrar: true },
      { label: "Coroas de flores", valor: c.coroas, href: "/coroa-de-flores", tom: "verde", icon: IconFlower, mostrar: pronto && has("coroa-de-flores") },
      { label: "Requisições de material", valor: c.requisicoes, href: has("requisicoes") ? "/requisicoes" : "/requisicao", tom: "azul", icon: IconTruckDelivery, mostrar: pronto && (has("requisicoes") || has("requisicao")) },
      { label: "Alertas de estoque", valor: c.estoque, href: has("estoque") ? "/estoque" : "/produtos", tom: "amarelo", icon: IconAlertTriangle, mostrar: pronto && (has("geral") || has("estoque") || has("produtos")) },
      { label: "Material a recolher", valor: c.recolher, href: "/acompanhamento", tom: "azul", icon: IconPackageExport, mostrar: pronto && has("acompanhamento") },
      { label: "Aguardando sua ação", valor: c.aguardando, href: "/acompanhamento", tom: "amarelo", icon: IconUserCheck, mostrar: pronto && has("acompanhamento") },
    ];
    return itens.filter((i) => i.mostrar);
  }, [c, pronto, has]);

  /* Acesso rápido: Quadro, Minhas OS, Messenger (só com a página), Chat e Avisos */
  const rapidos = useMemo(() => {
    const messenger = MODULOS.find((m) => m.id === "comunicacao")!.itens.find((i) => i.href === "/messenger")!;
    const lista = [
      FIXOS.find((f) => f.titulo === "Quadro de Atendimentos")!,
      FIXOS.find((f) => f.titulo === "Minhas OS")!,
      messenger,
      FIXOS.find((f) => f.titulo === "Chat")!,
      FIXOS.find((f) => f.titulo === "Avisos")!,
    ];
    return lista.filter((i) => pronto && itemVisivel(i, has));
  }, [pronto, has]);

  const modulos = pronto ? MODULOS.filter((m) => moduloVisivel(m, has)) : [];

  /* Pesquisa de funções: só páginas permitidas; casa pelo começo do título (como antes) */
  const resultados = useMemo(() => {
    const q = normalizeSearch(busca);
    if (!q || !pronto) return [];
    const base: { title: string; href: string; group: string; icone: Icone }[] = [
      ...MODULOS.flatMap((m) =>
        itensVisiveisDe(m.itens, has).map((i) => ({ title: i.titulo, href: hrefDoItem(i, has), group: m.titulo, icone: i.icone as Icone })),
      ),
      ...FIXOS.filter((f) => itemVisivel(f, has)).map((f) => ({ title: f.titulo, href: f.href, group: "Início", icone: f.icone as Icone })),
      ...APELIDOS.filter((a) => has(a.slug)).map((a) => ({ title: a.title, href: a.href, group: a.group, icone: IconSearch as Icone })),
    ];
    const vistos = new Set<string>();
    return base.filter((i) => {
      if (!normalizeSearch(i.title).startsWith(q)) return false;
      const k = `${i.title}|${i.href}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  }, [busca, pronto, has]);

  const pesquisando = busca.trim() !== "";
  const horas = agora ? agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";

  return (
    <div className="min-h-[calc(100dvh-1px)] bg-[#F6F8FB] pb-[calc(2rem+env(safe-area-inset-bottom))] text-[#313C55] dark:bg-[#161C2A] dark:text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
        {/* BOAS-VINDAS */}
        <section className="relative overflow-hidden rounded-[20px] bg-[#313C55] px-5 py-5 text-white sm:px-7">
          <span aria-hidden className="absolute -right-[70px] -top-[110px] size-[200px] rounded-full bg-[#F2CB3F]" />
          <span aria-hidden className="absolute -bottom-[70px] right-[62px] size-[116px] rounded-full bg-[#00AEEC]" />
          <span aria-hidden className="absolute -bottom-[34px] -right-2 size-[70px] rounded-full bg-[#B3CE52]" />

          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold tracking-[0.12em] text-[#B3CE52]">{agora ? dataExtenso(agora) : "\u00A0"}</div>
              <h1 className="mt-1 text-2xl font-extrabold leading-tight sm:text-[28px]">
                {agora ? saudacao(agora.getHours()) : "Olá"}
                {nome ? `, ${nome}` : ""}
              </h1>
              <p className="mt-1 text-sm tabular-nums text-[#D6DCE8]">
                <span className="lg:hidden">Este é o resumo do seu dia. </span>
                <b className="text-white">{horas}</b>
              </p>
            </div>

            <div className="relative flex flex-wrap gap-3 pr-20 sm:pr-28 lg:mr-44 lg:pr-0">
              {pronto && has("acompanhamento") ? (
                <Link href="/acompanhamento" className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-[14px] bg-[#F2CB3F] px-5 text-[15px] font-extrabold text-[#313C55]">
                  <IconPlus size={18} />
                  Novo atendimento
                </Link>
              ) : null}
              <Link href="/quadro-acompanhamento" className="hidden h-11 items-center whitespace-nowrap rounded-[14px] border-[1.5px] border-white px-4 text-sm font-bold text-white lg:inline-flex">
                Quadro de Atendimentos
              </Link>
            </div>
          </div>
        </section>

        {/* PESQUISA DE FUNÇÕES */}
        <div className="mt-5 flex h-[54px] items-center gap-2 rounded-xl border border-[#E3E8F0] bg-white px-3 shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F]">
          <IconSearch size={19} className="shrink-0 text-[#7A8396]" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={pronto ? "Pesquise" : "Carregando acessos..."}
            disabled={!pronto}
            aria-label="Pesquisar funções do sistema"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-base font-medium text-[#313C55] outline-none placeholder:text-[#7A8396] dark:text-white"
          />
          {pesquisando ? (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label="Limpar pesquisa"
              className="grid size-9 shrink-0 place-items-center rounded-lg text-[#5B6478] hover:bg-[#EEF2F7] dark:text-[#AEB9CF] dark:hover:bg-white/10"
            >
              <IconX size={18} />
            </button>
          ) : null}
        </div>

        {pesquisando ? (
          /* RESULTADO DA PESQUISA */
          <section aria-label="Resultado da pesquisa" className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {pronto && resultados.length === 0 ? (
              <div className={[CARD, "col-span-full border-dashed p-8 text-center"].join(" ")}>
                <IconSearch size={24} className="mx-auto text-[#7A8396]" />
                <div className="mt-3 text-sm font-black">Nenhuma função encontrada</div>
                <div className="mt-1 text-xs text-[#5B6478] dark:text-[#AEB9CF]">Não há páginas permitidas que correspondam a “{busca.trim()}”.</div>
              </div>
            ) : null}
            {resultados.map((r) => {
              const Icon = r.icone;
              return (
                <Link key={`${r.title}-${r.href}`} href={r.href} className={[CARD, "flex items-center gap-3.5 p-4"].join(" ")}>
                  <span className={["grid size-11 shrink-0 place-items-center rounded-[14px] text-[#313C55] dark:text-white", CHIP.azul].join(" ")}>
                    <Icon size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-extrabold">{r.title}</span>
                    <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{r.group}</span>
                  </span>
                  <IconChevronRight size={18} className="shrink-0 text-[#7A8396]" />
                </Link>
              );
            })}
          </section>
        ) : (
          <>
            {/* RESUMO */}
            {resumo.length ? (
              <section aria-label="Resumo" className="mt-5 grid grid-cols-2 gap-3 sm:landscape:grid-cols-3 lg:grid-cols-4 lg:gap-4">
                {resumo.map((r) => {
                  const Icon = r.icon;
                  return (
                    <Link key={r.label} href={r.href} className={[CARD, "flex items-center gap-3 p-3.5 lg:gap-3.5 lg:p-4"].join(" ")}>
                      <span className={["grid size-11 shrink-0 place-items-center rounded-[14px] text-[#313C55] dark:text-white", CHIP[r.tom]].join(" ")}>
                        <Icon size={22} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[26px] font-extrabold leading-none tabular-nums lg:text-[30px]">{dois(r.valor)}</span>
                        <span className="mt-1 block text-[13px] font-semibold leading-tight text-[#5B6478] dark:text-[#AEB9CF]">{r.label}</span>
                      </span>
                      <IconChevronRight size={18} className="hidden shrink-0 text-[#7A8396] lg:block" />
                    </Link>
                  );
                })}
              </section>
            ) : null}

            {/* ACESSO RÁPIDO */}
            <h2 className="mb-3 mt-8 text-xl font-extrabold lg:mb-4 lg:mt-9">Acesso rápido</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
              {rapidos.map((f) => {
                const Icon = f.icone;
                const selo =
                  f.selo === "avisos" ? formatarSelo(c.avisos) : f.selo === "messenger" ? formatarSelo(contMessenger) : "";
                return (
                  <Link key={f.href} href={f.href} className={[CARD, "flex items-center gap-3.5 p-4"].join(" ")}>
                    <span className={["grid size-11 shrink-0 place-items-center rounded-[14px] text-[#313C55] dark:text-white", CHIP.azul].join(" ")}>
                      <Icon size={22} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-extrabold">{f.titulo}</span>
                      <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{f.desc}</span>
                    </span>
                    {selo ? (
                      <span className="inline-flex h-[22px] min-w-6 items-center justify-center rounded-full bg-[#F2CB3F] px-2 text-xs font-extrabold text-[#313C55]">{selo}</span>
                    ) : null}
                    <IconChevronRight size={18} className="shrink-0 text-[#7A8396]" />
                  </Link>
                );
              })}
            </div>

            {/* MÓDULOS */}
            <h2 className="mb-3 mt-8 text-xl font-extrabold lg:mb-4 lg:mt-9">Módulos</h2>
            {!pronto ? (
              <div className={[CARD, "p-5 text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF]"].join(" ")}>Carregando acessos disponíveis neste dispositivo...</div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:landscape:grid-cols-2 lg:grid-cols-4 lg:gap-4">
                {modulos.map((m) => {
                  const Icon = m.icone;
                  return (
                    <Link key={m.id} href={destinoDoModulo(m, has)} className={[CARD, "flex items-center gap-3.5 p-4"].join(" ")}>
                      <span className={["grid size-11 shrink-0 place-items-center rounded-[14px] text-[#313C55] dark:text-white", CHIP[TOM_MODULO[m.id] || "azul"]].join(" ")}>
                        <Icon size={22} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-extrabold">{m.titulo}</span>
                        <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{m.desc}</span>
                      </span>
                      <IconChevronRight size={18} className="shrink-0 text-[#7A8396]" />
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
