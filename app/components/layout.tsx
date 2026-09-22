"use client";

import { AppSidebar } from "@/app/components/sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { data: session } = authClient.useSession();

  return (
    <SidebarProvider>
      {session?.user && <AppSidebar />}
      <SidebarInset>
        <div className="flex min-w-0 flex-1 flex-col">
          {session?.user && (
            <header className="flex h-14 shrink-0 items-center border-b px-4">
              <SidebarTrigger />
            </header>
          )}
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default Layout;
