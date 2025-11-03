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
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-white shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo/Brand */}
          <div className="border-b border-gray-200 p-6">
            <Link href="/documents" onClick={closeMobileMenu}>
              <h1 className="text-2xl font-bold text-gray-900">
                Travel Creation
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Your journey, documented
              </p>
            </Link>
          </div>

          {/* User Info */}
          {(userEmail || userName) && (
            <div className="border-b border-gray-200 p-4">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 overflow-hidden">
                  {userName && (
                    <p className="truncate text-sm font-medium text-gray-900">
                      {userName}
                    </p>
                  )}
                  {userEmail && (
                    <p className="truncate text-xs text-gray-500">
                      {userEmail}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={closeMobileMenu}
                      className={`flex items-center space-x-3 rounded-lg px-4 py-3 transition-colors ${
                        active
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${active ? "text-blue-600" : "text-gray-500"}`}
                      />
                      <div className="flex-1">
                        <p
                          className={`text-sm font-medium ${active ? "text-blue-600" : "text-gray-900"}`}
                        >
                          {item.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.description}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Logout Button */}
          <div className="border-t border-gray-200 p-4">
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full justify-start space-x-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
