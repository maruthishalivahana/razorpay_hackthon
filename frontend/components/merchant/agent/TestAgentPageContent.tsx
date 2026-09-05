"use client";

import React from "react";
import { BuyerChat } from "@/components/buyer/BuyerChat";

export function TestAgentPageContent() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto w-full h-[calc(100vh-2rem)] flex flex-col">
      <BuyerChat
        embedded={true}
        headerTitle="Negotiation Agent — Test"
        subtitle="Interact with your live commerce agent using your merchant catalog and policy rules."
        backLink={{ href: "/merchant/agent-builder", label: "Back to Agent Builder" }}
      />
    </div>
  );
}
