"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/tailwind/ui/button";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <Button variant="ghost" onClick={handleLogout} className="gap-2">
      <LogOut className="h-4 w-4" />
      Logout
    </Button>
  );
}
