"use client";

import React from "react";
import { MerchantSidebar } from "./MerchantSidebar";
import { useMerchant } from "@/hooks/useMerchant";

interface MerchantDashboardLayoutProps {
  children: React.ReactNode;
}

export function MerchantDashboardLayout({ children }: MerchantDashboardLayoutProps) {
  const { selectedMerchant } = useMerchant();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <MerchantSidebar currentMerchant={selectedMerchant} />
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  );
}
