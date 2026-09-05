"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Package,
  Handshake,
  Bot,
  User,
  Truck,
  Clock,
  AlertCircle,
  Activity,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils/format";
import { fetchNegotiationById } from "@/lib/api/negotiations";
import type {
  Negotiation,
  PopulatedProduct,
  PopulatedMerchant,
  PopulatedPolicy,
  ConversationMessage,
  AuditEventInfo,
  NegotiationHistoryItem,
} from "@/types/negotiation";

interface NegotiationDetailPageContentProps {
  negotiationId: string;
}

export function NegotiationDetailPageContent({ negotiationId }: NegotiationDetailPageContentProps) {
  const [negotiation, setNegotiation] = useState<Negotiation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"conversation" | "rounds" | "audit">("conversation");

  const loadNegotiation = useCallback(async () => {
    if (!negotiationId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchNegotiationById(negotiationId);
      if (res.success && res.data) {
        setNegotiation(res.data);
      } else {
        throw new Error("Negotiation not found");
      }
    } catch (err: unknown) {
      console.error("Failed to load negotiation details:", err);
      const msg = err instanceof Error ? err.message : "Unable to load negotiation details.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [negotiationId]);

  useEffect(() => {
    let ignore = false;
    if (negotiationId) {
      fetchNegotiationById(negotiationId)
        .then((res) => {
          if (!ignore) {
            if (res.success && res.data) {
              setNegotiation(res.data);
            }
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!ignore) {
            console.error("Failed to load negotiation details:", err);
            setError(err instanceof Error ? err.message : "Unable to load negotiation details.");
            setLoading(false);
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [negotiationId]);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 font-medium">Active</Badge>;
      case "ACCEPTED":
        return <Badge variant="success" className="font-medium">Accepted</Badge>;
      case "REJECTED":
        return <Badge variant="destructive" className="font-medium">Rejected</Badge>;
      case "EXPIRED":
        return <Badge variant="secondary" className="font-medium">Expired</Badge>;
      default:
        return <Badge variant="outline" className="font-medium">{status || "Unknown"}</Badge>;
    }
  };

  const formatTimestamp = (dateVal?: string | Date) => {
    if (!dateVal) return "—";
    try {
      const d = new Date(dateVal);
      return d.toLocaleString("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(dateVal);
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

  if (loading) {
    return (
      <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div className="lg:col-span-2">
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !negotiation) {
    return (
      <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
        <div className="border border-border rounded-xl p-10 text-center bg-card space-y-4 shadow-sm">
          <div className="inline-flex h-12 w-12 rounded-full bg-destructive/10 text-destructive items-center justify-center">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg text-foreground">Unable to load negotiation details.</h3>
            <p className="text-sm text-muted-foreground">{error || "The requested negotiation could not be found."}</p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <Link href="/merchant/negotiations">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Negotiations
              </Button>
            </Link>
            <Button onClick={loadNegotiation}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const product = (typeof negotiation.productId === "object" ? negotiation.productId : null) as PopulatedProduct | null;
  const merchant = (typeof negotiation.merchantId === "object" ? negotiation.merchantId : null) as PopulatedMerchant | null;
  const policy = (typeof negotiation.policyId === "object" ? negotiation.policyId : null) as PopulatedPolicy | null;

  const productName = product?.name || "Product";
  const productSku = product?.sku || "N/A";
  const listPrice = negotiation.originalUnitPrice || product?.price || 0;
  const buyerOffer = negotiation.currentBuyerOffer;
  const currentOffer = negotiation.currentMerchantOffer ?? negotiation.acceptedPrice;
  const currency = negotiation.currency || "INR";

  // Free delivery eligibility (backend driven)
  const isFreeShippingEligible = negotiation.freeDeliveryEligible;

  // Real conversation messages from linked conversation document
  const conversationMessages: ConversationMessage[] = negotiation.conversation?.messages || [];
  const historyItems: NegotiationHistoryItem[] = negotiation.history || [];
  const auditEvents: AuditEventInfo[] = negotiation.auditEvents || [];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Top Header / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link href="/merchant/negotiations">
            <Button variant="ghost" size="sm" className="h-9 px-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <Separator orientation="vertical" className="h-5 hidden sm:block" />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                Negotiation Details
              </h1>
              {getStatusBadge(negotiation.status)}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Bot className="h-3.5 w-3.5 text-primary" />
              <span>Handled by Negotiation Agent</span>
              <span>•</span>
              <span className="font-mono">{negotiation._id || negotiation.id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadNegotiation} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Content: Left Column (Summary Cards) + Right Column (Timeline) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Commercial & Product Information */}
        <div className="space-y-6 lg:col-span-1">
          {/* Commercial Summary Card */}
          <Card className="border-border shadow-xs">
            <CardHeader className="p-4 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Handshake className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold text-foreground">Commercial Summary</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-md bg-muted/30 border border-border">
                  <span className="text-muted-foreground block text-[11px]">Buyer Offer</span>
                  <span className="font-semibold text-sm text-foreground">
                    {buyerOffer ? formatCurrency(buyerOffer, currency) : "—"}
                  </span>
                </div>

                <div className="p-2.5 rounded-md bg-primary/5 border border-primary/20">
                  <span className="text-muted-foreground block text-[11px]">Current Offer</span>
                  <span className="font-semibold text-sm text-primary">
                    {currentOffer ? formatCurrency(currentOffer, currency) : "—"}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Quantity</span>
                  <span className="font-medium text-foreground">
                    {negotiation.quantity} {negotiation.quantity === 1 ? "unit" : "units"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Negotiation Round</span>
                  <span className="font-medium text-foreground">
                    Round {negotiation.currentRound} / {negotiation.maxRounds}
                  </span>
                </div>

                {negotiation.currentDiscountPercent !== undefined && negotiation.currentDiscountPercent > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="font-medium text-foreground">
                      {negotiation.currentDiscountPercent}%
                    </span>
                  </div>
                )}

                {negotiation.finalOrderValue !== undefined && negotiation.finalOrderValue > 0 && (
                  <div className="flex items-center justify-between pt-1 border-t border-border">
                    <span className="font-semibold text-foreground">Final Order Value</span>
                    <span className="font-bold text-sm text-foreground">
                      {formatCurrency(negotiation.finalOrderValue, currency)}
                    </span>
                  </div>
                )}

                {/* Free Delivery Eligibility (Backend Driven) */}
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Truck className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>Delivery</span>
                  </div>
                  {isFreeShippingEligible === true ? (
                    <Badge variant="success" className="text-[11px] font-normal">
                      Free delivery eligible
                    </Badge>
                  ) : isFreeShippingEligible === false ? (
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      Standard shipping
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Standard</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Product Information Card */}
          <Card className="border-border shadow-xs">
            <CardHeader className="p-4 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold text-foreground">Product Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div>
                <h4 className="font-semibold text-sm text-foreground">{productName}</h4>
                <p className="text-xs text-muted-foreground">SKU: {productSku}</p>
                {product?.category && (
                  <p className="text-xs text-muted-foreground mt-0.5">Category: {product.category}</p>
                )}
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Original List Price</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(listPrice, currency)}
                </span>
              </div>

              {product?.deliveryDays !== undefined && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Estimated Delivery</span>
                  <span className="font-medium text-foreground">{product.deliveryDays} days</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Session Metadata Card */}
          <Card className="border-border shadow-xs">
            <CardHeader className="p-4 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold text-foreground">Session Details</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Buyer Identifier</span>
                <span className="font-medium text-foreground">Buyer 1</span>
              </div>

              {merchant?.businessName && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Merchant</span>
                  <span className="font-medium text-foreground">{merchant.businessName}</span>
                </div>
              )}

              {policy?.name && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Active Policy</span>
                  <span className="font-medium text-foreground truncate max-w-[150px]">{policy.name}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Started</span>
                <span className="font-medium text-foreground">
                  {formatTimestamp(negotiation.startedAt || negotiation.createdAt)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span className="font-medium text-foreground">
                  {formatTimestamp(negotiation.updatedAt)}
                </span>
              </div>

              {negotiation.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-medium text-foreground">
                    {formatTimestamp(negotiation.completedAt)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Timeline & Conversation History (Most Important Section) */}
        <div className="space-y-4 lg:col-span-2">
          {/* Navigation Tabs */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab("conversation")}
              className={`pb-2.5 px-4 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === "conversation"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bot className="h-4 w-4" />
              Conversation Timeline ({conversationMessages.length > 0 ? conversationMessages.length : historyItems.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("rounds")}
              className={`pb-2.5 px-4 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === "rounds"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="h-4 w-4" />
              Round History ({historyItems.length})
            </button>

            {auditEvents.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("audit")}
                className={`pb-2.5 px-4 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
                  activeTab === "audit"
                    ? "border-primary text-primary font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Activity className="h-4 w-4" />
                Agent Activity ({auditEvents.length})
              </button>
            )}
          </div>

          {/* TAB 1: Conversation Timeline */}
          {activeTab === "conversation" && (
            <Card className="border-border shadow-xs">
              <CardHeader className="p-4 border-b border-border bg-muted/10">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold text-foreground">
                      Negotiation Conversation
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Chronological messages between the buyer and your Negotiation Agent.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {conversationMessages.length > 0
                      ? `${conversationMessages.length} Messages`
                      : `${historyItems.length} Offer Turns`}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {conversationMessages.length > 0 ? (
                  /* Real Conversation Messages */
                  <div className="space-y-4">
                    {conversationMessages.map((msg, idx) => {
                      const isAgent = msg.role === "assistant";
                      const isUser = msg.role === "user";

                      return (
                        <div
                          key={idx}
                          className={`flex gap-3 text-xs ${isAgent ? "bg-muted/30" : "bg-card"} p-3.5 rounded-lg border border-border`}
                        >
                          <div className="shrink-0 mt-0.5">
                            {isAgent ? (
                              <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                                <Bot className="h-4 w-4" />
                              </div>
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                                <User className="h-4 w-4" />
                              </div>
                            )}
                          </div>

                          <div className="space-y-1 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                                {isAgent ? "NEGOTIATION AGENT" : isUser ? "BUYER" : msg.role.toUpperCase()}
                              </span>
                              <span className="text-muted-foreground text-[10px]">
                                {formatTimeOnly(msg.createdAt)}
                              </span>
                            </div>
                            <p className="text-foreground text-xs leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : historyItems.length > 0 ? (
                  /* Fallback to Structured Round History */
                  <div className="space-y-3">
                    {historyItems.map((item, idx) => {
                      const isMerchant = item.actor === "MERCHANT";

                      return (
                        <div
                          key={idx}
                          className={`flex gap-3 text-xs ${isMerchant ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"} p-3.5 rounded-lg border`}
                        >
                          <div className="shrink-0 mt-0.5">
                            {isMerchant ? (
                              <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                                <Bot className="h-4 w-4" />
                              </div>
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                                <User className="h-4 w-4" />
                              </div>
                            )}
                          </div>

                          <div className="space-y-1 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-foreground text-[11px]">
                                {isMerchant ? "NEGOTIATION AGENT (Counter-Offer)" : "BUYER (Offer)"} — Round {item.round}
                              </span>
                              <span className="text-muted-foreground text-[10px]">
                                {formatTimeOnly(item.timestamp)}
                              </span>
                            </div>
                            <p className="text-foreground font-medium text-xs">
                              {isMerchant ? "Offered: " : "Submitted: "}
                              <span className="font-semibold text-primary">
                                {formatCurrency(item.offer, currency)}
                              </span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground italic">
                    No conversation messages recorded for this negotiation.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* TAB 2: Round History */}
          {activeTab === "rounds" && (
            <Card className="border-border shadow-xs">
              <CardHeader className="p-4 border-b border-border bg-muted/10">
                <CardTitle className="text-sm font-semibold text-foreground">
                  Offer & Counter-Offer Rounds
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {historyItems.length > 0 ? (
                  <div className="space-y-2">
                    {historyItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-md border border-border bg-card flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="font-mono text-xs">
                            Round {item.round}
                          </Badge>
                          <span className="font-medium text-foreground">
                            {item.actor === "BUYER" ? "Buyer Offer" : "Agent Counter-Offer"}
                          </span>
                          <span className="font-bold text-primary">
                            {formatCurrency(item.offer, currency)}
                          </span>
                        </div>
                        <span className="text-muted-foreground text-[11px]">
                          {formatTimestamp(item.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground italic">
                    No round history items available.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* TAB 3: Agent Activity / Audit Events */}
          {activeTab === "audit" && (
            <Card className="border-border shadow-xs">
              <CardHeader className="p-4 border-b border-border bg-muted/10">
                <CardTitle className="text-sm font-semibold text-foreground">
                  Agent Activity Trail
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {auditEvents.length > 0 ? (
                  <div className="space-y-2">
                    {auditEvents.map((event, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-md border border-border bg-card flex items-start justify-between text-xs gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {event.eventType}
                            </Badge>
                            <span className="font-semibold text-foreground">{event.actorType}</span>
                          </div>
                          <p className="text-muted-foreground text-xs">{event.description}</p>
                        </div>
                        <span className="text-muted-foreground text-[11px] shrink-0">
                          {formatTimestamp(event.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground italic">
                    No audit events recorded for this negotiation.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
