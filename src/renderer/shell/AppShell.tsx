import type { ReactNode } from "react";

export interface AppShellProps {
  menubar: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}

/** Janela: menubar (30px), toolbar (44px) e a mesa (sc-workspace). Sem barra de status. */
export function AppShell({ menubar, toolbar, children }: AppShellProps) {
  return (
    <div className="flex h-screen flex-col bg-parchment text-ink">
      {menubar}
      {toolbar}
      <main className="sc-workspace relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
