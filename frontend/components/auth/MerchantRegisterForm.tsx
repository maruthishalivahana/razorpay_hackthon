"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Store, User as UserIcon, Mail, Lock, Phone, Building2, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { registerMerchant } from "@/lib/api/auth";
import { useAuth } from "@/hooks/useAuth";

export function MerchantRegisterForm() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [currency, setCurrency] = useState("INR");

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !businessName || !email || !password) {
      setErrorMessage("Please fill in all required fields.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);
      const res = await registerMerchant({
        name,
        businessName,
        email,
        password,
        phone: phone || undefined,
        currency,
      });

      if (res.success) {
        await refreshUser();
        router.push("/merchant");
      } else {
        setErrorMessage(res.message || "Registration failed.");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-md border-border bg-card">
      <CardHeader className="space-y-2 text-center pb-4">
        <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
          <Store className="h-6 w-6" />
        </div>
        <CardTitle className="text-2xl font-bold text-foreground">
          Create Merchant Account
        </CardTitle>
        <CardDescription className="text-sm">
          Register your business on Agentic Commerce.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-3.5">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="name" className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Full Name *
            </label>
            <Input
              id="name"
              type="text"
              placeholder="Owner Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="businessName" className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              Business / Store Name *
            </label>
            <Input
              id="businessName"
              type="text"
              placeholder="Acme Electronics Store"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              Email *
            </label>
            <Input
              id="email"
              type="email"
              placeholder="merchant@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              Password *
            </label>
            <Input
              id="password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                Phone
              </label>
              <Input
                id="phone"
                type="tel"
                placeholder="+91..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="currency" className="text-xs font-medium text-foreground">
                Currency
              </label>
              <Input
                id="currency"
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                disabled={submitting}
              />
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-2">
          <Button type="submit" className="w-full font-semibold" disabled={submitting}>
            {submitting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create Merchant Account"
            )}
          </Button>

          <div className="text-xs text-center text-muted-foreground pt-1">
            Already have a Merchant account?{" "}
            <Link href="/merchant/login" className="text-primary font-medium hover:underline">
              Merchant Sign In
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
