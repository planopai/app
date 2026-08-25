"use client";

import * as React from "react";
import Link, { type LinkProps } from "next/link";

import { isOnlineNow } from "@/lib/offline/network";
import { isOfflineRoute } from "@/lib/offline/routes";

type Props = LinkProps &
  Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    keyof LinkProps
  >;

/**
 * Link opcional para pontos em que você queira declarar explicitamente
 * uma navegação offline.
 *
 * O RegisterSW também instala um interceptador global para links internos,
 * portanto NÃO é obrigatório substituir todos os <Link> do projeto.
 */
export function OfflineLink({
  href,
  onClick,
  children,
  target,
  ...props
}: Props) {
  const handleClick = (
    event: React.MouseEvent<HTMLAnchorElement>
  ) => {
    onClick?.(event);

    if (event.defaultPrevented) return;

    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (target && target !== "_self") {
      return;
    }

    if (isOnlineNow()) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const rawHref =
      typeof href === "string"
        ? href
        : href.pathname || "/";

    const url = new URL(
      String(rawHref),
      window.location.href
    );

    if (url.origin !== window.location.origin) {
      return;
    }

    if (!isOfflineRoute(url.pathname)) {
      return;
    }

    event.preventDefault();

    // Navegação de documento completa.
    // Assim o Service Worker consegue responder com o HTML salvo.
    window.location.assign(url.href);
  };

  return (
    <Link
      href={href}
      target={target}
      onClick={handleClick}
      {...props}
    >
      {children}
    </Link>
  );
}

export default OfflineLink;
