"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Store, Bot, RefreshCw, Sparkles, UserPlus, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, role, loading } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      if (role === "MERCHANT") {
        router.replace("/merchant");
      } else if (role === "BUYER") {
        router.replace("/buyer");
      }
    }
  }, [loading, isAuthenticated, role, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-5 w-5 text-primary animate-spin" />
          <span>Loading platform...</span>
        </div>
      </main>
    );
  }

  if (isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-5 w-5 text-primary animate-spin" />
          <span>Redirecting to your dashboard...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 md:p-12 bg-background">
      <div className="w-full max-w-lg space-y-6 text-center">
        {/* Platform Brand Header */}
        <div className="space-y-2">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-primary/10 text-primary items-center justify-center border border-primary/20 shadow-xs mb-1">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
            Agentic Commerce
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-sm mx-auto">
            Autonomous Buyer &amp; Merchant Commerce Platform. Choose how you want to continue.
          </p>
        </div>

        {/* Main Entry Card */}
        <Card className="text-left shadow-md border-border bg-card">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-lg font-bold">Platform Access</CardTitle>
            <CardDescription className="text-xs">
              Select your role to sign in or create a new account.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-5">
            {/* Primary Sign In Options */}
            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                Sign In
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link href="/merchant/login" className="w-full">
                  <Button className="w-full justify-center gap-2 font-medium" variant="default">
                    <Store className="h-4 w-4" />
                    Merchant Login
                  </Button>
                </Link>
                <Link href="/buyer/login" className="w-full">
                  <Button className="w-full justify-center gap-2 font-medium" variant="secondary">
                    <Bot className="h-4 w-4" />
                    Buyer Login
                  </Button>
                </Link>
              </div>
            </div>

            {/* Registration Options */}
            <div className="space-y-3 pt-2 border-t border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                New Accounts
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-2">
                  <div className="text-xs font-medium text-foreground">New Merchant?</div>
                  <Link href="/merchant/register" className="block">
                    <Button variant="outline" size="sm" className="w-full text-xs gap-1.5 font-medium">
                      <UserPlus className="h-3.5 w-3.5" />
                      Create Merchant Account
                    </Button>
                  </Link>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-2">
                  <div className="text-xs font-medium text-foreground">New Buyer?</div>
                  <Link href="/buyer/register" className="block">
                    <Button variant="outline" size="sm" className="w-full text-xs gap-1.5 font-medium">
                      <LogIn className="h-3.5 w-3.5" />
                      Create Buyer Account
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="bg-muted/10 border-t border-border px-6 py-3 justify-center">
            <span className="text-[11px] text-muted-foreground">
              Secured with HTTP-only JWT Sessions &amp; Role-based Authorization
            </span>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
