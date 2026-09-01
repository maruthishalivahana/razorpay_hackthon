"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Package,
  Handshake,
  ShoppingCart,
  BarChart3,
  Settings,
  Store,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Merchant } from "@/types/merchant";

interface MerchantSidebarProps {
  currentMerchant?: Merchant | null;
}

const navigationItems = [
  { name: "Agent Builder", href: "/merchant/agent-builder", icon: Bot },
  { name: "Products", href: "/merchant/products", icon: Package },
  { name: "Negotiations", href: "/merchant/negotiations", icon: Handshake },
  { name: "Orders", href: "/merchant/orders", icon: ShoppingCart },
  { name: "Analytics", href: "/merchant/analytics", icon: BarChart3 },
  { name: "Settings", href: "/merchant/settings", icon: Settings },
];

export function MerchantSidebar({ currentMerchant }: MerchantSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (
    <div className="flex flex-col h-full bg-card border-r border-border w-64 text-card-foreground">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
        <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary text-primary-foreground">
          <Store className="h-5 w-5" />
        </div>
        <div className="flex flex-col overflow-hidden">
          <span className="font-semibold text-sm truncate">
            {currentMerchant?.businessName || currentMerchant?.name || "Agentic Commerce"}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            Merchant Portal
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/merchant" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                isActive
                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Profile */}
      <div className="p-4 border-t border-border mt-auto">
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-semibold text-xs text-muted-foreground uppercase">
            {(currentMerchant?.name || "M").charAt(0)}
          </div>
          <div className="flex flex-col overflow-hidden text-xs">
            <span className="font-medium text-foreground truncate">
              {currentMerchant?.name || "Merchant"}
            </span>
            <span className="text-muted-foreground truncate">
              {currentMerchant?.email || "merchant@store.com"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Toggle Button */}
      <div className="md:hidden fixed top-3 left-3 z-40">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:shrink-0 h-screen sticky top-0">
        {navContent}
      </aside>

      {/* Mobile Overlay & Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 flex-1 w-full max-w-xs bg-card shadow-xl">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
}
