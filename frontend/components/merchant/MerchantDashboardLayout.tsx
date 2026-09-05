"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { MerchantSidebar } from "./MerchantSidebar";
import { useMerchant } from "@/hooks/useMerchant";
import { useAuth } from "@/hooks/useAuth";

interface MerchantDashboardLayoutProps {
  children: React.ReactNode;
}

export function MerchantDashboardLayout({ children }: MerchantDashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, role, loading: authLoading } = useAuth();
  const { selectedMerchant } = useMerchant();

  const isPublicAuthRoute = pathname === "/merchant/login" || pathname === "/merchant/register";

  useEffect(() => {
    if (authLoading) return;

    if (isPublicAuthRoute) {
      if (isAuthenticated && role === "MERCHANT") {
        router.replace("/merchant");
      }
    } else {
      if (!isAuthenticated || role !== "MERCHANT") {
        router.replace("/merchant/login");
      }
    }
  }, [authLoading, isAuthenticated, role, isPublicAuthRoute, router]);

  if (isPublicAuthRoute) {
    return <>{children}</>;
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground gap-2 text-sm">
        <RefreshCw className="h-5 w-5 text-primary animate-spin" />
        <span>Authenticating...</span>
      </div>
    );
  }

  if (!isAuthenticated || role !== "MERCHANT") {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <MerchantSidebar currentMerchant={selectedMerchant} />
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  );
}
