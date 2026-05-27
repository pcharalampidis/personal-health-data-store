import React from "react";
import type { NavItem } from "./Sidebar.js";

interface Props {
  navItems: NavItem[];
  activePage: string;
  onNavigate: (page: string) => void;
}

export function MobileBottomNav({ navItems, activePage, onNavigate }: Props) {
  return (
    <nav className="app-bottom-nav">
      {navItems.map((item) => (
        <button key={item.id} data-active={activePage === item.id} onClick={() => onNavigate(item.id)}>
          <span className="app-bottom-nav__icon">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
