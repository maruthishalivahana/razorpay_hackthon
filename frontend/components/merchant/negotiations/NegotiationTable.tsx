"use client";

import Link from "next/link";
import { Eye, Bot, Package } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import type { Negotiation, PopulatedProduct } from "@/types/negotiation";

interface NegotiationTableProps {
  negotiations: Negotiation[];
  onViewDetail?: (negotiation: Negotiation) => void;
}

export function NegotiationTable({
  negotiations,
  onViewDetail,
}: NegotiationTableProps) {
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

  const formatRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
      if (diffSec < 60) return "Just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h ago`;
      return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block border border-border rounded-lg overflow-hidden bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[260px]">Product</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Buyer Offer</TableHead>
              <TableHead>Current Offer</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Round</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {negotiations.map((item, idx) => {
              const itemKey = item._id || item.id || `neg_${idx}`;
              const product = (typeof item.productId === "object" ? item.productId : null) as PopulatedProduct | null;

              const productName = product?.name || "Product";
              const productSku = product?.sku;
              const productImg = product?.imageUrl;
              const buyerDisplay = "Buyer 1";
              const buyerOffer = item.currentBuyerOffer;
              const currentOffer = item.currentMerchantOffer ?? item.acceptedPrice;
              const currency = item.currency || "INR";

              return (
                <TableRow key={itemKey} className="hover:bg-muted/40 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      {productImg ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={productImg}
                          alt={productName}
                          className="h-9 w-9 rounded-md object-cover border border-border shrink-0"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-md bg-muted/60 flex items-center justify-center border border-border shrink-0">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-sm text-foreground truncate max-w-[180px]" title={productName}>
                          {productName}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          {productSku && <span className="font-mono text-[11px]">{productSku}</span>}
                          <span className="flex items-center gap-0.5 text-primary">
                            <Bot className="h-3 w-3 shrink-0" />
                            <span className="text-[10px]">Agent</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {buyerDisplay}
                  </TableCell>

                  <TableCell className="font-medium text-sm">
                    {buyerOffer ? formatCurrency(buyerOffer, currency) : "—"}
                  </TableCell>

                  <TableCell className="font-semibold text-sm text-primary">
                    {currentOffer ? formatCurrency(currentOffer, currency) : "—"}
                  </TableCell>

                  <TableCell className="text-sm">
                    {item.quantity} {item.quantity === 1 ? "unit" : "units"}
                  </TableCell>

                  <TableCell className="text-sm font-medium">
                    Round {item.currentRound} / {item.maxRounds}
                  </TableCell>

                  <TableCell>
                    {getStatusBadge(item.status)}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(item.updatedAt || item.createdAt)}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewDetail?.(item)}
                        className="h-8 px-2 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View
                      </Button>
                      <Link href={`/merchant/negotiations/${item._id || item.id}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-xs"
                        >
                          Details
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {negotiations.map((item, idx) => {
          const itemKey = item._id || item.id || `neg_m_${idx}`;
          const product = (typeof item.productId === "object" ? item.productId : null) as PopulatedProduct | null;
          const productName = product?.name || "Product";
          const productImg = product?.imageUrl;
          const buyerOffer = item.currentBuyerOffer;
          const currentOffer = item.currentMerchantOffer ?? item.acceptedPrice;
          const currency = item.currency || "INR";

          return (
            <Card key={itemKey} className="shadow-xs border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {productImg ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={productImg}
                        alt={productName}
                        className="h-10 w-10 rounded-md object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-muted/60 flex items-center justify-center border border-border shrink-0">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm text-foreground truncate">{productName}</h4>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Bot className="h-3 w-3 text-primary" />
                        Handled by Negotiation Agent
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(item.status)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-border py-2.5">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Buyer Offer</span>
                    <span className="font-medium">{buyerOffer ? formatCurrency(buyerOffer, currency) : "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Current Offer</span>
                    <span className="font-semibold text-primary">{currentOffer ? formatCurrency(currentOffer, currency) : "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Quantity</span>
                    <span className="font-medium">{item.quantity} {item.quantity === 1 ? "unit" : "units"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Round</span>
                    <span className="font-medium">Round {item.currentRound} / {item.maxRounds}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    Updated {formatRelativeTime(item.updatedAt || item.createdAt)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewDetail?.(item)}
                      className="h-8 text-xs"
                    >
                      Quick View
                    </Button>
                    <Link href={`/merchant/negotiations/${item._id || item.id}`}>
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 text-xs"
                      >
                        Full Details
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
