"use client";

import Link from "next/link";
import {
  X,
  Package,
  Handshake,
  Bot,
  Truck,
  Clock,
  ExternalLink,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import type {
  Negotiation,
  PopulatedProduct,
} from "@/types/negotiation";

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

  const productName = product?.name || "Product";
  const productSku = product?.sku || "N/A";
  const productImg = product?.imageUrl;
  const listPrice = negotiation.originalUnitPrice || product?.price || 0;
  const currency = negotiation.currency || "INR";

  const buyerOffer = negotiation.currentBuyerOffer;
  const currentOffer = negotiation.currentMerchantOffer ?? negotiation.acceptedPrice;
  const isFreeShippingEligible = negotiation.freeDeliveryEligible;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 font-normal">Active</Badge>;
      case "ACCEPTED":
        return <Badge variant="success" className="font-normal">Accepted</Badge>;
      case "REJECTED":
        return <Badge variant="destructive" className="font-normal">Rejected</Badge>;
      case "EXPIRED":
        return <Badge variant="secondary" className="font-normal">Expired</Badge>;
      default:
        return <Badge variant="outline" className="font-normal">{status}</Badge>;
    }
  };

  const formatTimeOnly = (dateVal?: string | Date) => {
    if (!dateVal) return "";
    try {
      const d = new Date(dateVal);
      return d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const messages = negotiation.conversation?.messages || [];
  const history = negotiation.history || [];

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
              <span className="font-mono text-[11px]">{negotiation._id || negotiation.id}</span>
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
            <div className="flex items-start gap-2.5">
              {productImg ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={productImg}
                  alt={productName}
                  className="h-11 w-11 rounded-md object-cover border border-border shrink-0"
                />
              ) : (
                <div className="h-11 w-11 rounded-md bg-muted/80 flex items-center justify-center border border-border shrink-0">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <h4 className="font-semibold text-sm text-foreground truncate">{productName}</h4>
                <p className="text-xs text-muted-foreground">SKU: {productSku}</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground pt-1">
              List Price: <span className="font-medium text-foreground">{formatCurrency(listPrice, currency)}</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Handshake className="h-4 w-4 text-primary" />
              <span>Commercial Terms</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Buyer Offer</span>
                <span className="font-semibold text-foreground">
                  {buyerOffer ? formatCurrency(buyerOffer, currency) : "—"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Current Offer</span>
                <span className="font-semibold text-primary">
                  {currentOffer ? formatCurrency(currentOffer, currency) : "—"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Quantity</span>
                <span className="font-medium text-foreground">
                  {negotiation.quantity} {negotiation.quantity === 1 ? "unit" : "units"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Round</span>
                <span className="font-medium text-foreground">
                  Round {negotiation.currentRound} / {negotiation.maxRounds}
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
              <span className="font-medium text-foreground block">Delivery Eligibility</span>
              <span className="text-muted-foreground">
                {isFreeShippingEligible === true
                  ? "Qualifies for Free Delivery under merchant policy"
                  : isFreeShippingEligible === false
                  ? "Standard shipping rate applies"
                  : "Standard shipping"}
              </span>
            </div>
          </div>
          {isFreeShippingEligible === true ? (
            <Badge variant="success" className="text-[11px] font-normal">Free Delivery</Badge>
          ) : (
            <Badge variant="secondary" className="text-[11px] font-normal">Standard</Badge>
          )}
        </div>

        {/* Conversation / Timeline */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Conversation Timeline
            </h3>
            <span className="text-xs text-muted-foreground">
              {messages.length > 0 ? `${messages.length} messages` : `${history.length} turns`}
            </span>
          </div>

          <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
            {messages.length > 0 ? (
              messages.map((msg, idx) => {
                const isAgent = msg.role === "assistant";
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border text-xs space-y-1 ${
                      isAgent ? "bg-muted/30 border-border" : "bg-card border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-foreground flex items-center gap-1">
                        {isAgent ? (
                          <>
                            <Bot className="h-3 w-3 text-primary" />
                            Negotiation Agent
                          </>
                        ) : (
                          <>
                            <User className="h-3 w-3 text-muted-foreground" />
                            Buyer
                          </>
                        )}
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        {formatTimeOnly(msg.createdAt)}
                      </span>
                    </div>
                    <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                );
              })
            ) : history.length > 0 ? (
              history.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-md border border-border bg-muted/20 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-muted-foreground w-14">Round {item.round}</span>
                    <Badge variant={item.actor === "BUYER" ? "outline" : "secondary"}>
                      {item.actor === "BUYER" ? "Buyer" : "Agent"}
                    </Badge>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(item.offer, currency)}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-[11px]">
                    {formatTimeOnly(item.timestamp)}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground italic">
                No conversation turns recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Link href={`/merchant/negotiations/${negotiation._id || negotiation.id}`}>
            <Button variant="outline" size="sm" className="text-xs">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open Full Details Page
            </Button>
          </Link>
          <Button variant="default" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
