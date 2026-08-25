"use client";

import React, {
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import {
  IconFlower,
  IconHome,
} from "@tabler/icons-react";
import { usePerms } from "./_perms/PermsProvider";

/* =========================================================
   CONFIGURAÇÃO DOS CONTADORES
   ========================================================= */

const COUNTS_REFRESH_MS = 15_000;

const SERVICOS_API =
  "https://api.planoassistencialintegrado.com.br/informativo.php";

const COROAS_API =
  "https://api.planoassistencialintegrado.com.br/coroas.php";

const REQUISICOES_API =
  "https://api.planoassistencialintegrado.com.br/requisicoes.php";

const STATUS_REQUISICOES =
  "PENDENTE,EM_SEPARACAO,EM_TRANSITO";

/* =========================================================
   TIPOS
   ========================================================= */

type CounterKey =
  | "servicos"
  | "coroas"
  | "requisicoes";

type DashboardCounts = Record<
  CounterKey,
  number | null
>;

type RegistroFunerario = {
  status?: string;
  assistencia?: string;
  realiza_velorio?: string;
  realiza_sepultamento?: string;
  tipo_atendimento?: string;

  [key: string]: any;
};

type CoroasResponse = {
  sucesso?: boolean;
  dados?: Array<{
    id?: number;
    status?: string | null;
  }>;
  meta?: {
    total?: number | string;
  };
  msg?: string;
};

type RequisicoesResponse = {
  ok?: boolean;
  rows?: any[];
  msg?: string;
};

/* =========================================================
   REGRAS DO QUADRO DE SERVIÇOS FUNERÁRIOS
   ========================================================= */

const ROTULO_PARA_FASE: Record<string, string> = {
  removendo: "fase01",
  "aguardando procedimento": "fase02",
  preparando: "fase03",
  "aguardando ornamentacao": "fase04",
  ornamentando: "fase05",
  "fim da ornamentacao": "fase06",
  "aguardando corpo pronto": "fase06",
  "corpo pronto": "fase12",
  transportando: "fase07",
  "transportando obito p/velorio": "fase07",
  "transportando obito para velorio": "fase07",
  "transportando p/ velorio": "fase07",
  "transportando p/ velório": "fase07",
  velando: "fase08",
  sepultando: "fase09",
  "transportando p/ sepultamento": "fase09",
  "sepultamento concluido": "fase10",
  "sepultamento concluído": "fase10",
  "material recolhido": "fase11",
  concluido: "fase11",
  concluído: "fase11",
};

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarStatus(
  status?: string
): string | undefined {
  if (!status) {
    return undefined;
  }

  const s = String(status).trim();

  if (s.toLowerCase().startsWith("fase")) {
    const digits = s.replace(
      /[^0-9]/g,
      ""
    );

    if (!digits) {
      return s.toLowerCase();
    }

    return `fase${digits.padStart(
      2,
      "0"
    )}`.toLowerCase();
  }

  const mapeado =
    ROTULO_PARA_FASE[normalizeKey(s)];

  return (mapeado || s).toLowerCase();
}

function isNao(value?: string) {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();

  return (
    s === "não" ||
    s === "nao" ||
    s === "n"
  );
}

function isSim(value?: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase() === "sim";
}

function isTerceiroRegistro(
  registro: RegistroFunerario
) {
  // Não inferir pelo conteúdo dos campos. Um atendimento funerário normal
  // também pode ter Assistência, Tanato e Ornamentação marcados como Não.
  return (
    String(
      registro.tipo_atendimento ?? ""
    )
      .trim()
      .toLowerCase() === "terceiro"
  );
}

function registroEstaNoQuadro(
  registro: RegistroFunerario
) {
  const status = normalizarStatus(
    registro.status
  );

  // Mesma regra usada pela TabelaAtendimentos da tela de Serviços Funerários.
  if (status === "fase11") {
    return false;
  }

  if (isTerceiroRegistro(registro)) {
    return status !== "fase10";
  }

  // Com assistência, o atendimento continua visível até Material Recolhido.
  if (isSim(registro.assistencia)) {
    return true;
  }

  const semVelorio = isNao(
    registro.realiza_velorio
  );
  const semSepultamento = isNao(
    registro.realiza_sepultamento
  );

  // Com sepultamento, encerra em fase10.
  if (!semSepultamento) {
    return status !== "fase10";
  }

  // Sem sepultamento, mas com velório, encerra na entrega do corpo (fase08).
  if (!semVelorio) {
    return status !== "fase08";
  }

  // Sem velório e sem sepultamento, encerra em Corpo Pronto (fase12).
  return status !== "fase12";
}

/* =========================================================
   CONSULTAS
   ========================================================= */

async function buscarQuantidadeServicos() {
  const url = new URL(SERVICOS_API);

  url.searchParams.set("listar", "1");
  url.searchParams.set(
    "_nocache",
    String(Date.now())
  );

  const response = await fetch(
    url.toString(),
    {
      cache: "no-store",
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Erro ao consultar serviços funerários: ${response.status}`
    );
  }

  const json = await response.json();

  const registros: RegistroFunerario[] =
    Array.isArray(json) ? json : [];

  return registros.filter(
    registroEstaNoQuadro
  ).length;
}

async function buscarQuantidadeCoroas() {
  const url = new URL(COROAS_API);

  url.searchParams.set("listar", "1");
  url.searchParams.set(
    "grupo",
    "confeccao"
  );
  url.searchParams.set("page", "1");
  url.searchParams.set(
    "per_page",
    "100"
  );
  url.searchParams.set(
    "fresh",
    String(Date.now())
  );

  const response = await fetch(
    url.toString(),
    {
      cache: "no-store",
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Erro ao consultar coroas: ${response.status}`
    );
  }

  const json: CoroasResponse =
    await response.json();

  if (!json?.sucesso) {
    throw new Error(
      json?.msg ||
      "Não foi possível consultar as coroas."
    );
  }

  const total = Number(
    json.meta?.total
  );

  if (
    Number.isFinite(total) &&
    total >= 0
  ) {
    return total;
  }

  const pedidos = Array.isArray(
    json.dados
  )
    ? json.dados
    : [];

  return pedidos.filter((pedido) => {
    const status = String(
      pedido.status ?? ""
    )
      .trim()
      .toLowerCase();

    return (
      status === "novo" ||
      status === "coroa" ||
      status === "faixa"
    );
  }).length;
}

async function buscarQuantidadeRequisicoes() {
  const url = new URL(
    REQUISICOES_API
  );

  url.searchParams.set(
    "action",
    "fila"
  );

  url.searchParams.set(
    "status",
    STATUS_REQUISICOES
  );

  url.searchParams.set(
    "limit",
    "200"
  );

  url.searchParams.set(
    "_ts",
    String(Date.now())
  );

  const response = await fetch(
    url.toString(),
    {
      cache: "no-store",
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Erro ao consultar requisições: ${response.status}`
    );
  }

  const json: RequisicoesResponse =
    await response.json();

  if (!json?.ok) {
    throw new Error(
      json?.msg ||
      "Não foi possível consultar as requisições."
    );
  }

  return Array.isArray(json.rows)
    ? json.rows.length
    : 0;
}

/* =========================================================
   CONTADOR VISUAL
   ========================================================= */

function formatCount(
  value: number | null | undefined
) {
  if (value == null) {
    return "...";
  }

  return String(value).padStart(
    2,
    "0"
  );
}

/* =========================================================
   ÍCONE CIRCULAR
   ========================================================= */

function QuickIcon({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span
      className="
        grid h-11 w-11 place-items-center rounded-full
        bg-sky-100 text-sky-700
        transition-colors
        group-hover:bg-sky-600
        group-hover:text-white
        dark:bg-sky-900/30
        dark:text-sky-200
        dark:group-hover:bg-sky-600
      "
    >
      {children}
    </span>
  );
}

/* =========================================================
   BOTÕES
   ========================================================= */

type QuickAction = {
  label: string;
  href: string;
  slug: string;
  icon: React.ReactNode;
  counterKey?: CounterKey;
};

const quickActions: QuickAction[] = [
  {
    label: "Serviços Funerários",
    href: "/servicos-funerarios",
    slug: "servicos-funerarios",
    counterKey: "servicos",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
      >
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
    label: "Coroa de Flores",
    href: "/coroa-de-flores",
    slug: "coroa-de-flores",
    counterKey: "coroas",
    icon: (
      <IconFlower size={22} />
    ),
  },

  {
    label: "Plano",
    href: "/plano",
    slug: "plano",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
      >
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
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
      >
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
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
      >
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
    label: "Consulta",
    href: "/produtos",
    slug: "produtos",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
      >
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
    counterKey: "requisicoes",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
      >
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

/* =========================================================
   PAGE
   ========================================================= */

export default function HomePage() {
  const { perms, has } = usePerms();

  const [now, setNow] =
    useState("");

  const [dateStr, setDateStr] =
    useState("");

  const [counts, setCounts] =
    useState<DashboardCounts>({
      servicos: null,
      coroas: null,
      requisicoes: null,
    });

  /* =======================================================
     RELÓGIO
     ======================================================= */

  useEffect(() => {
    const tick = () => {
      const dt = new Date();

      setNow(
        dt.toLocaleTimeString(
          "pt-BR",
          {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }
        )
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
        `${days[dt.getDay()]}, ${String(
          dt.getDate()
        ).padStart(2, "0")}/${String(
          dt.getMonth() + 1
        ).padStart(
          2,
          "0"
        )}/${dt.getFullYear()}`
      );
    };

    tick();

    const timer =
      window.setInterval(
        tick,
        1000
      );

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  /* =======================================================
     CONTADORES
     ======================================================= */

  useEffect(() => {
    let alive = true;
    let loading = false;

    async function carregarContadores() {
      if (loading) {
        return;
      }

      // Neste primeiro teste offline, os contadores não devem tentar APIs sem rede.
      // A ausência desses dados não pode impedir a Home/layout de abrir.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }

      loading = true;

      try {
        const [
          servicosResult,
          coroasResult,
          requisicoesResult,
        ] = await Promise.allSettled([
          buscarQuantidadeServicos(),
          buscarQuantidadeCoroas(),
          buscarQuantidadeRequisicoes(),
        ]);

        if (!alive) {
          return;
        }

        setCounts((current) => ({
          servicos:
            servicosResult.status ===
              "fulfilled"
              ? servicosResult.value
              : current.servicos,

          coroas:
            coroasResult.status ===
              "fulfilled"
              ? coroasResult.value
              : current.coroas,

          requisicoes:
            requisicoesResult.status ===
              "fulfilled"
              ? requisicoesResult.value
              : current.requisicoes,
        }));

        if (
          servicosResult.status ===
          "rejected"
        ) {
          console.error(
            "Erro no contador de Serviços Funerários:",
            servicosResult.reason
          );
        }

        if (
          coroasResult.status ===
          "rejected"
        ) {
          console.error(
            "Erro no contador de Coroas:",
            coroasResult.reason
          );
        }

        if (
          requisicoesResult.status ===
          "rejected"
        ) {
          console.error(
            "Erro no contador de Requisições:",
            requisicoesResult.reason
          );
        }
      } finally {
        loading = false;
      }
    }

    void carregarContadores();

    const timer =
      window.setInterval(() => {
        if (!document.hidden) {
          void carregarContadores();
        }
      }, COUNTS_REFRESH_MS);

    const handleVisibilityChange =
      () => {
        if (!document.hidden) {
          void carregarContadores();
        }
      };

    const handleOnline = () => {
      if (!document.hidden) {
        void carregarContadores();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );
    window.addEventListener("online", handleOnline);

    return () => {
      alive = false;

      window.clearInterval(timer);

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const permissionsReady = perms !== null;

  const actions = permissionsReady
    ? quickActions.filter((action) =>
      has(action.slug)
    )
    : [];

  return (
    <div className="min-h-[calc(100vh-1px)] bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-6xl px-5 py-5">

        {/* HEADER */}
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <IconHome className="size-6 text-primary" />

              <h1 className="text-2xl font-bold tracking-tight">
                Início
              </h1>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-right shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="text-sm font-bold">
              {now}
            </div>

            <div className="text-[11px] text-muted-foreground">
              {dateStr}
            </div>
          </div>
        </header>

        {/* BOTÕES */}
        <section className="mb-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

            {!permissionsReady && (
              <div className="col-span-2 rounded-2xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-muted-foreground shadow-sm sm:col-span-4 dark:border-gray-800 dark:bg-gray-900">
                Carregando acessos disponíveis neste dispositivo...
              </div>
            )}

            {actions.map((action) => {
              const count =
                action.counterKey
                  ? counts[
                  action.counterKey
                  ]
                  : undefined;

              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="
                    group relative
                    flex flex-col
                    items-center
                    justify-center
                    gap-2.5
                    rounded-2xl
                    border border-gray-200
                    bg-white
                    px-3 py-4
                    shadow-sm
                    transition-all
                    hover:-translate-y-[1px]
                    hover:shadow-md
                    dark:border-gray-800
                    dark:bg-gray-900
                  "
                >

                  {/* CONTADOR */}
                  {action.counterKey && (
                    <span
                      className="
                        absolute
                        right-2.5 top-2.5
                        inline-flex
                        min-w-8
                        items-center
                        justify-center
                        rounded-full
                        bg-sky-100
                        px-2 py-1
                        text-[11px]
                        font-black
                        tabular-nums
                        leading-none
                        text-sky-700
                        transition-colors
                        group-hover:bg-sky-600
                        group-hover:text-white
                        dark:bg-sky-900/40
                        dark:text-sky-200
                      "
                    >
                      {formatCount(count)}
                    </span>
                  )}

                  <QuickIcon>
                    {action.icon}
                  </QuickIcon>

                  <span className="text-center text-[13px] font-extrabold leading-tight tracking-tight text-gray-900 dark:text-white">
                    {action.label}
                  </span>

                </Link>
              );
            })}

          </div>
        </section>

      </div>
    </div>
  );
}