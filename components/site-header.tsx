"use client";

/**
 * Cabeçalho do app (mockup "Repaginada do app PAI").
 *  - Computador (72 px): caminho "Módulo > Tela", pesquisa (Ctrl/⌘ K), pílula Online, sino e tema.
 *  - Celular (60 px): título da tela, pílula Online, tema e sino. O menu é a barra de baixo; o botão ☰ só aparece
 *    nas telas em que a barra de baixo não está (ex.: Chat da Aurora).
 * Não há mais os botões de Início e de Chat (já estão nos atalhos), a seta de voltar nem o seletor de cores.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBell, IconChevronRight, IconStar, IconStarFilled } from "@tabler/icons-react";

import { usePerms } from "@/app/_perms/PermsProvider";
import { BotaoMenuCelular, useBarraVisivel } from "@/components/shell/MenuCelular";
import BuscaGlobal from "@/components/shell/BuscaGlobal";
import { acharModuloPorRota, destinoDoModulo } from "@/components/shell/modulos";
import { rotaExiste } from "@/components/shell/rotas";
import { useMenu } from "@/components/shell/useMenu";
import { useContadores } from "@/components/shell/useContadores";
import { ModeSwitcher } from "./mode-switcher";
import { MenuUsuario } from "@/components/app-sidebar";

const TITULOS_EXTRA: Record<string, string> = {
  "/help": "Ajuda",
  "/personalizar-barra": "Personalizar menu",
  "/tela": "Tela inicial",
  "/geral": "Estoque",
  "/quadrotv": "Quadro de Atendimentos (TV)",
};

function tituloDaRota(pathname: string): string {
  if (pathname === "/") return "Início";
  if (TITULOS_EXTRA[pathname]) return TITULOS_EXTRA[pathname];
  const ultimo = pathname.split("/").filter(Boolean).pop() || "";
  const texto = decodeURIComponent(ultimo).replace(/-/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function SiteHeader() {
  const pathname = (usePathname() || "/").replace(/\/+$/, "") || "/";
  const { perms, has } = usePerms();
  const numeros = useContadores(perms, has);
  const barraVisivel = useBarraVisivel();
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const atualizar = () => setIsOnline(navigator.onLine);
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);

  /* 08/10/2026: o caminho "Módulo > Tela" segue a organização feita pela Gestão em Organizar menu */
  const menu = useMenu();
  const { modulo, item, fixo } = acharModuloPorRota(pathname, menu.modulos, menu.fixos);
  const titulo = item?.titulo ?? fixo?.titulo ?? modulo?.titulo ?? tituloDaRota(pathname);
  /* 06/11/2026: estrela ao lado do nome da tela, para favoritar (aparece no Início). Só em telas do menu, não no Início nem nas páginas de módulo. */
  const telaId = (item ?? fixo)?.id && pathname !== "/" ? (item ?? fixo)!.id : null;
  const favorita = telaId ? menu.favoritos.includes(telaId) : false;
  const estrela = telaId ? (
    <button
      type="button"
      onClick={() => void menu.alternarFavorito(telaId)}
      aria-pressed={favorita}
      aria-label={favorita ? "Tirar dos favoritos" : "Favoritar esta tela"}
      title={favorita ? "Tirar dos favoritos" : "Favoritar (aparece no Início)"}
      className="grid size-9 shrink-0 place-items-center rounded-lg text-[#98A1B3] hover:bg-accent hover:text-[#313C55] dark:hover:text-white"
    >
      {favorita ? <IconStarFilled size={19} className="text-[#F2CB3F]" /> : <IconStar size={19} />}
    </button>
  ) : null;
  const pronto = perms !== null;
  const temAvisos = pronto && has("avisos") && rotaExiste("/avisos");
  const pendentes = temAvisos ? numeros.avisos ?? 0 : 0;

  const pilula = [
    "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-bold",
    "h-[30px] md:h-9",
    isOnline === false
      ? "bg-[#FDECEA] text-[#B42318] dark:bg-[#463D4C] dark:text-[#FF9C92]"
      : "bg-[#EEF5D6] text-[#313C55] dark:bg-[#404C43] dark:text-white",
  ].join(" ");

  return (
    <header
      className="
        sticky top-0 z-50 isolate
        flex h-(--header-height) shrink-0 items-center
        border-b bg-background shadow-sm
      "
    >
      <div className="flex w-full min-w-0 items-center gap-2 px-4 md:gap-4 md:px-10">
        {!barraVisivel && <BotaoMenuCelular />}

        {/* computador: caminho */}
        <nav aria-label="Você está em" className="hidden min-w-0 shrink items-center gap-1.5 whitespace-nowrap text-[15px] md:flex">
          {modulo && item ? (
            <>
              <Link
                href={destinoDoModulo(modulo, has)}
                className="font-semibold text-[#5B6478] hover:text-[#313C55] dark:text-[#AEB9CF] dark:hover:text-white"
              >
                {modulo.titulo}
              </Link>
              <IconChevronRight size={16} className="shrink-0 text-[#7A8396]" />
              <span className="font-extrabold">{item.titulo}</span>
            </>
          ) : (
            <span className="font-extrabold">{titulo}</span>
          )}
          {estrela}
        </nav>

        {/* celular: título da tela */}
        <div className="flex min-w-0 flex-1 items-center gap-1 md:hidden">
          <span className="min-w-0 truncate text-[22px] font-extrabold">{titulo}</span>
          {estrela}
        </div>

        {/* computador: pesquisa */}
        <BuscaGlobal className="ml-4 hidden min-w-[160px] flex-1 md:block" />

        <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
          <span className={pilula} role="status">
            <span className={`size-2 rounded-full ${isOnline === false ? "bg-[#B42318] dark:bg-[#FF9C92]" : "bg-[#7BA11A]"}`} />
            {isOnline === false ? "Offline" : "Online"}
          </span>

          <span className="[&_button]:size-11 [&_svg]:size-5">
            <ModeSwitcher />
          </span>

          {temAvisos && (
            <Link
              href="/avisos"
              aria-label={pendentes > 0 ? `Avisos: ${pendentes} pendentes` : "Avisos"}
              title="Avisos"
              className="relative grid size-11 place-items-center rounded-lg hover:bg-accent"
            >
              <IconBell size={20} />
              {pendentes > 0 && (
                <span className="absolute right-[11px] top-[10px] size-[9px] rounded-full border-2 border-background bg-[#F2CB3F]" />
              )}
            </Link>
          )}

          {/* 06/11/2026: usuário no canto superior direito (computador); saiu do trilho lateral */}
          <MenuUsuario className="ml-1 hidden lg:block" />
        </div>
      </div>
    </header>
  );
}
