"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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

export function NavUser({
  user,
  onLogout,
}: {
  user?: User;
  onLogout?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const { isMobile } = useSidebar();

  const [displayName, setDisplayName] = React.useState<string>(
    user?.name || "Usuário"
  );

  React.useEffect(() => {
    const fromCookie = readCookie("pai_name");
    if (fromCookie) setDisplayName(fromCookie);
    else if (user?.name) setDisplayName(user.name);
  }, [user?.name]);

  async function handleLogout() {
    try {
      if (onLogout) {
        await onLogout();
      } else {
        await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
      }
    } catch {
      // silencioso
    } finally {
      router.replace("/login");
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
              <span className="truncate font-medium">{displayName}</span>
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
