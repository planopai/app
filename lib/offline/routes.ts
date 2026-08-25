/**
 * lib/offline/routes.ts
 *
 * Fonte única das rotas que devem conseguir ABRIR sem internet.
 *
 * Não inclua endpoints de API aqui.
 * /login também fica fora do cache autenticado.
 */

export const PAI_START_CACHE = "start-url";
export const PAI_PAGES_CACHE = "pai-pages-v2";
export const PAI_RSC_CACHE = "pai-rsc-v1";

export const OFFLINE_ROUTES = [
  "/",

  "/acompanhamento",
  "/administrativo",
  "/ajuda",
  "/assistencia",
  "/associados",
  "/atendimento",
  "/avisos",
  "/catalogo",
  "/config-catalogo",
  "/coroa-de-flores",
  "/dashboard",
  "/dashboard-requisicoes",
  "/desempenho",
  "/estoque",
  "/geral",
  "/homenagens",
  "/inicio",
  "/leads",
  "/medicos",
  "/memorial",
  "/mensagens",
  "/minhas-solicitacoes",
  "/noticias",
  "/obituario",
  "/offline",
  "/parceiros",
  "/permissoes",
  "/plano",
  "/produtos",
  "/quadro-acompanhamento",
  "/quadrotv",
  "/relatorio",
  "/relatorio-guias",
  "/relatorio-sintetico",
  "/requisicao",
  "/requisicoes",
  "/salas",
  "/seguranca",
  "/servicos-funerarios",
  "/solicitar-produto",
  "/sorteios",
  "/tela",
  "/telemetria",
  "/usuarios",
  "/vendas",
] as const;

export type OfflineRoute = (typeof OFFLINE_ROUTES)[number];

export function normalizeOfflinePath(pathname: string): string {
  if (!pathname) return "/";

  const clean = pathname.split("?")[0].split("#")[0] || "/";
  if (clean === "/") return "/";

  return clean.endsWith("/")
    ? clean.slice(0, -1)
    : clean;
}

const OFFLINE_ROUTE_SET = new Set<string>(
  OFFLINE_ROUTES.map(normalizeOfflinePath)
);

export function isOfflineRoute(pathname: string): boolean {
  return OFFLINE_ROUTE_SET.has(
    normalizeOfflinePath(pathname)
  );
}
