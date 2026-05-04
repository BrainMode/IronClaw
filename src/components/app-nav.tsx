"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  /** If set: only show for these roles. undefined = visible to all members. */
  roles?: ("admin" | "recipe_only")[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Heute", roles: ["admin"] },
  { href: "/training", label: "Training", roles: ["admin"] },
  { href: "/nutrition", label: "Ernährung", roles: ["admin"] },
  { href: "/recipes", label: "Rezepte" }, // visible to both roles
  { href: "/body", label: "Körper", roles: ["admin"] },
  { href: "/chat", label: "Coach", roles: ["admin"] },
];

interface AppNavProps {
  role: "admin" | "recipe_only" | null;
}

export function AppNav({ role }: AppNavProps) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((i) => !i.roles || (role !== null && i.roles.includes(role)));

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-(--color-border) bg-(--color-background)/95 backdrop-blur z-50">
      <ul className="flex justify-around max-w-3xl mx-auto">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center px-3 py-3 text-xs",
                  active
                    ? "text-(--color-foreground) font-medium"
                    : "text-(--color-muted-foreground)",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
