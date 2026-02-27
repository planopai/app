"use client";

import * as React from "react";

/**
 * ✅ Novo NavUser (apenas exibe o nome, SEM dropdown)
 * - A ação de sair agora fica fixa no SidebarFooter (AppSidebar)
 * - Mantive compatibilidade com `user` pra não quebrar imports existentes
 */

type User = {
  name?: string;
  email?: string;
  avatar?: string;
};

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const v = document.cookie
    ?.split("; ")
    .find((r) => r.startsWith(name + "="))
    ?.split("=")[1];
  return v ? decodeURIComponent(v) : null;
}

export function NavUser({ user }: { user?: User }) {
  const [displayName, setDisplayName] = React.useState<string>(user?.name || "Usuário");

  React.useEffect(() => {
    const fromCookie = readCookie("pai_name") || readCookie("pai_user");
    if (fromCookie) setDisplayName(fromCookie);
    else if (user?.name) setDisplayName(user.name);
  }, [user?.name]);

  return (
    <div className="px-3 py-3">
      <span className="truncate text-sm font-semibold">{displayName}</span>
    </div>
  );
}