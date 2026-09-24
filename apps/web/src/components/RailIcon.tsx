import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";

export function RailIcon({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "w-11 h-10 rounded-lg flex flex-col items-center justify-center gap-[3px] shrink-0",
          isActive ? "bg-amber/10 border border-amber/40 text-amber" : "text-text-faint hover:bg-white/5",
        ].join(" ")
      }
    >
      {icon}
      <span className="font-mono text-[8px] tracking-wide">{label}</span>
    </NavLink>
  );
}
