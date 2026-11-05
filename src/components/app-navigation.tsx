"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Company Brain" },
  { href: "/guardian/intelligence", label: "Decision Intelligence" },
  { href: "/guardian", label: "Human Review" },
  { href: "/graph", label: "Knowledge Graph" },
  { href: "/gaps", label: "Knowledge Gaps" },
];

export default function AppNavigation() {
  const pathname = usePathname();

  return (
    <header className="w-full border-b border-slate-800 bg-slate-950 text-slate-100">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4"
      >
        <Link href="/" className="font-semibold text-white">
          Company Memory Guardian
        </Link>

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {links.map((link) => {
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "font-semibold text-cyan-400"
                    : "text-slate-400 hover:text-white"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
