import React from "react";
import { MerchantDashboardLayout } from "@/components/merchant/MerchantDashboardLayout";

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return <MerchantDashboardLayout>{children}</MerchantDashboardLayout>;
}
