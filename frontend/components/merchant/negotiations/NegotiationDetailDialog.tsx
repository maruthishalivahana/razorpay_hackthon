"use client";

import {
  X,
  Package,
  Handshake,
  Bot,
  Truck,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import type { Negotiation, PopulatedProduct, PopulatedPolicy } from "@/types/negotiation";

interface NegotiationDetailDialogProps {
  negotiation: Negotiation | null;
  open: boolean;
  onClose: () => void;
}

export function NegotiationDetailDialog({
  negotiation,
  open,
  onClose,
}: NegotiationDetailDialogProps) {
  if (!open || !negotiation) return null;

  const product = (typeof negotiation.productId === "object" ? negotiation.productId : null) as PopulatedProduct | null;
  const policy = (typeof negotiation.policyId === "object" ? negotiation.policyId : null) as PopulatedPolicy | null;

  const productName = product?.name || "Product";
  const productSku = product?.sku || "N/A";
  const listPrice = negotiation.originalUnitPrice || product?.price || 0;

  const buyerOffer = negotiation.currentBuyerOffer;
  const currentOffer = negotiation.currentMerchantOffer ?? negotiation.acceptedPrice;
  const freeShippingThreshold = policy?.freeShippingThreshold;

  const currentOrderValue = (currentOffer || buyerOffer || listPrice) * negotiation.quantity;
  const isFreeShippingEligible = freeShippingThreshold !== undefined && currentOrderValue >= freeShippingThreshold;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">Active</Badge>;
      case "ACCEPTED":
        return <Badge variant="success">Accepted</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">Rejected</Badge>;
      case "EXPIRED":
        return <Badge variant="secondary">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-6 space-y-6 text-card-foreground">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">Negotiation Details</h2>
              {getStatusBadge(negotiation.status)}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5 text-primary" />
              <span>Handled by Negotiation Agent</span>
              <span>•</span>
              <span>ID: {negotiation._id || negotiation.id}</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Product & Commercial Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Package className="h-4 w-4 text-primary" />
              <span>Product</span>
            </div>
            <div>
              <h4 className="font-semibold text-base text-foreground">{productName}</h4>
              <p className="text-xs text-muted-foreground">SKU: {productSku}</p>
            </div>
            <div className="text-xs text-muted-foreground pt-1">
              List Price: <span className="font-medium text-foreground">{formatCurrency(listPrice, negotiation.currency)}</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Handshake className="h-4 w-4 text-primary" />
              <span>Commercial Terms</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground block">Buyer Offer</span>
                <span className="font-semibold text-foreground">
                  {buyerOffer ? formatCurrency(buyerOffer, negotiation.currency) : "N/A"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Current Offer</span>
                <span className="font-semibold text-primary">
                  {currentOffer ? formatCurrency(currentOffer, negotiation.currency) : "N/A"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Quantity</span>
                <span className="font-medium text-foreground">{negotiation.quantity} units</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Round</span>
                <span className="font-medium text-foreground">
                  {negotiation.currentRound} / {negotiation.maxRounds}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Shipping & Delivery Eligibility */}
        <div className="p-3.5 rounded-lg border border-border bg-card flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <Truck className="h-4 w-4 text-primary shrink-0" />
            <div>
              <span className="font-medium text-foreground block">Delivery Status</span>
              <span className="text-muted-foreground">
                {isFreeShippingEligible ? "Qualifies for Free Delivery" : "Standard shipping rate applies"}
              </span>
            </div>
          </div>
          {isFreeShippingEligible ? (
            <Badge variant="success" className="text-[11px]">Free Shipping</Badge>
          ) : (
            <Badge variant="secondary" className="text-[11px]">Standard</Badge>
          )}
        </div>

        {/* Conversation / Audit Timeline */}
        {negotiation.history && negotiation.history.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Negotiation History
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {negotiation.history.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-md border border-border bg-muted/20 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-muted-foreground w-12">R{item.round}</span>
                    <Badge variant={item.actor === "BUYER" ? "outline" : "secondary"}>
                      {item.actor}
                    </Badge>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(item.offer, negotiation.currency)}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-[11px]">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
