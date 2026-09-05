"use client";

import { useState, useEffect } from "react";
import { fetchMerchantById } from "@/lib/api/merchants";
import { useAuth } from "@/hooks/useAuth";
import type { Merchant } from "@/types/merchant";

export function useMerchant() {
  const { user, loading: authLoading } = useAuth();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function load() {
      if (authLoading) return;

      try {
        setLoading(true);

        if (user?.role !== "MERCHANT" || !user.merchantId) {
          setMerchants([]);
          setSelectedMerchant(null);
          return;
        }

        try {
          const res = await fetchMerchantById(user.merchantId);
          if (res.success && res.data) {
            setSelectedMerchant(res.data);
            setMerchants([res.data]);
            return;
          }
        } catch (err) {
          console.warn("Could not fetch specific merchant by ID:", err);
        }

        setMerchants([]);
        setSelectedMerchant(null);
      } catch (err) {
        console.error("Failed to load merchants:", err);
        setSelectedMerchant(null);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [user?.merchantId, user?.role, authLoading]);

  return {
    merchants,
    selectedMerchant,
    setSelectedMerchant,
    loading: loading || authLoading,
  };
}
