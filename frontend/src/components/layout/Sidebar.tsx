import React from "react";

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

interface Props {
  role: "patient" | "doctor";
  account: string;
  navItems: NavItem[];
  activePage: string;
  onNavigate: (page: string) => void;
}

export function Sidebar({ role, account, navItems, activePage, onNavigate }: Props) {
  const formatAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__logo">Health Vault</div>
      <div className="app-sidebar__role">
        <span className={`role-badge role-badge--${role}`}>
          {role === "patient" ? "Patient" : "Doctor"}
        </span>
      </div>
      <ul className="app-sidebar__nav">
        {navItems.map((item) => (
          <li key={item.id}>
            <button data-active={activePage === item.id} onClick={() => onNavigate(item.id)}>
              <span>{item.icon}</span> {item.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="app-sidebar__wallet">{formatAddr(account)}</div>
    </aside>
  );
}
