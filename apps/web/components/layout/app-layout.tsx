"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";

interface AppLayoutProps {
  children: ReactNode;
  userEmail?: string;
  userName?: string;
}

export function AppLayout({ children, userEmail, userName }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <Sidebar userEmail={userEmail} userName={userName} />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto lg:ml-64">
        {children}
      </main>
    </div>
  );
}
