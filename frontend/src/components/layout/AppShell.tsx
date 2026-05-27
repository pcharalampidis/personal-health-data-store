import React from "react";
import { Sidebar, type NavItem } from "./Sidebar.js";
import { MobileBottomNav } from "./MobileBottomNav.js";

interface Props {
  role: "patient" | "doctor";
  account: string;
  navItems: NavItem[];
  activePage: string;
  onNavigate: (page: string) => void;
  children: React.ReactNode;
}

export function AppShell({ role, account, navItems, activePage, onNavigate, children }: Props) {
  return (
    <div className="app-shell">
      <Sidebar role={role} account={account} navItems={navItems} activePage={activePage} onNavigate={onNavigate} />
      <main className="app-main">{children}</main>
      <MobileBottomNav navItems={navItems} activePage={activePage} onNavigate={onNavigate} />
    </div>
  );
}
