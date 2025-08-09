"use client";

import { IconDotsVertical, IconLogout } from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type User = {
  name: string;
  email: string;   // mantido no tipo caso você use em outro lugar
  avatar: string;  // mantido no tipo caso você use em outro lugar
};

export function NavUser({
  user,
  onLogout,
}: {
  user: User;
  /** Opcional: passe sua ação de logout. Se não passar, uso um fallback simples. */
  onLogout?: () => Promise<void> | void;
}) {
  const { isMobile } = useSidebar();

  async function handleLogout() {
    try {
      if (onLogout) {
        await onLogout();
      } else {
        // Fallback genérico — ajuste conforme seu backend/autenticação
        await fetch("/api/logout", { method: "POST" }).catch(() => { });
        location.href = "/login";
      }
    } catch {
      // silencioso; ajuste se quiser feedback
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {/* Apenas o NOME do usuário */}
              <span className="truncate font-medium">{user.name}</span>
              {/* Três pontinhos à direita */}
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="min-w-40 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuItem onClick={handleLogout} className="text-red-600">
              <IconLogout className="mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
