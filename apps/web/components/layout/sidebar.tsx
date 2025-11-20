"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  FileText,
  Image,
  MapPin,
  Map,
  BookOpen,
  Globe,
  LogOut,
  Menu,
  X,
  User,
} from "lucide-react";
import { Button } from "@/components/tailwind/ui/button";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const navItems: NavItem[] = [
  {
    name: "Profile",
    href: "/profile",
    icon: User,
    description: "Your profile",
  },
  {
    name: "Documents",
    href: "/documents",
    icon: FileText,
    description: "Manage your documents",
  },
  {
    name: "Gallery",
    href: "/gallery",
    icon: Image,
    description: "View your photos",
  },
  {
    name: "Locations",
    href: "/gallery/locations",
    icon: MapPin,
    description: "Manage locations",
  },
  {
    name: "Map",
    href: "/gallery/map",
    icon: Map,
    description: "View on map",
  },
  {
    name: "Journal",
    href: "/gallery/journal",
    icon: BookOpen,
    description: "Travel journal",
  },
  {
    name: "Chichibu",
    href: "/chichibu",
    icon: Globe,
    description: "Public travel map",
  },
];

interface SidebarProps {
  userEmail?: string;
  userName?: string;
}

export function Sidebar({ userEmail, userName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const isActive = (href: string) => {
    if (href === "/documents") {
      return pathname === "/documents" || pathname.startsWith("/documents/");
    }
    if (href === "/gallery") {
      return pathname === "/gallery" && !pathname.includes("/gallery/");
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-white p-2 shadow-lg lg:hidden"
        aria-label="Toggle menu"
      >
        {isMobileMenuOpen ? (
          <X className="h-6 w-6 text-gray-700" />
        ) : (
          <Menu className="h-6 w-6 text-gray-700" />
        )}
      </button>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-background/95 backdrop-blur-md border-r border-border transition-transform duration-300 ease-in-out lg:translate-x-0 ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo/Brand */}
          <div className="p-6 pb-4">
            <Link href="/documents" onClick={closeMobileMenu} className="block group">
              <h1 className="text-2xl font-serif font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                Travel Creation
              </h1>
              <p className="text-xs text-muted-foreground font-medium tracking-widest uppercase mt-1">
                Your journey, documented
              </p>
            </Link>
          </div>

          {/* User Info */}
          {(userEmail || userName) && (
            <div className="px-4 pb-6">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                  <User className="h-5 w-5" />
                </div>
                <div className="flex-1 overflow-hidden min-w-0">
                  {userName && (
                    <p className="truncate text-sm font-medium text-foreground">
                      {userName}
                    </p>
                  )}
                  {userEmail && (
                    <p className="truncate text-xs text-muted-foreground">
                      {userEmail}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-2">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={closeMobileMenu}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 group ${active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                      <Icon
                        className={`h-5 w-5 transition-colors ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                          }`}
                      />
                      <div className="flex-1">
                        <p className="text-sm">
                          {item.name}
                        </p>
                      </div>
                      {active && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Logout Button */}
          <div className="p-4 border-t border-border/50">
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
