"use client";

import { useState, useEffect } from "react";
import { fetchMerchants } from "@/lib/api/merchants";
import type { Merchant } from "@/types/merchant";

export function useMerchant() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetchMerchants();
        if (res.success && res.data && res.data.length > 0) {
          setMerchants(res.data);
          setSelectedMerchant(res.data[0]);
        }
      } catch (err) {
        console.error("Failed to load merchants:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return {
    merchants,
    selectedMerchant,
    setSelectedMerchant,
    loading,
  };
}
