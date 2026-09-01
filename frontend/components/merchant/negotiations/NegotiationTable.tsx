"use client";

import { Eye, Bot } from "lucide-react";
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
import type { Negotiation, PopulatedProduct, PopulatedMerchant } from "@/types/negotiation";

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
      <div className="hidden md:block border border-border rounded-lg overflow-hidden bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[240px]">Product</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Buyer Offer</TableHead>
              <TableHead>Current Offer</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Round</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {negotiations.map((item) => {
              const itemKey = item._id || item.id || Math.random().toString();
              const product = (typeof item.productId === "object" ? item.productId : null) as PopulatedProduct | null;
              const merchant = (typeof item.merchantId === "object" ? item.merchantId : null) as PopulatedMerchant | null;

              const productName = product?.name || "Product";
              const buyerDisplay = "Buyer";
              const buyerOffer = item.currentBuyerOffer;
              const currentOffer = item.currentMerchantOffer ?? item.acceptedPrice;

              return (
                <TableRow key={itemKey} className="hover:bg-muted/40 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm text-foreground truncate max-w-[220px]">
                        {productName}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Bot className="h-3 w-3 text-primary shrink-0" />
                        Handled by Agent
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {buyerDisplay}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {buyerOffer ? formatCurrency(buyerOffer, item.currency) : "—"}
                  </TableCell>
                  <TableCell className="font-semibold text-sm text-primary">
                    {currentOffer ? formatCurrency(currentOffer, item.currency) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.quantity}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {item.currentRound} / {item.maxRounds}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(item.status)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(item.updatedAt || item.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewDetail?.(item)}
                      className="h-8 px-2 text-xs"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {negotiations.map((item) => {
          const itemKey = item._id || item.id || Math.random().toString();
          const product = (typeof item.productId === "object" ? item.productId : null) as PopulatedProduct | null;
          const productName = product?.name || "Product";
          const buyerOffer = item.currentBuyerOffer;
          const currentOffer = item.currentMerchantOffer ?? item.acceptedPrice;

          return (
            <Card key={itemKey} className="shadow-sm border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-sm text-foreground">{productName}</h4>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Bot className="h-3 w-3 text-primary" />
                      Handled by Agent
                    </p>
                  </div>
                  {getStatusBadge(item.status)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-border py-2">
                  <div>
                    <span className="text-muted-foreground block">Buyer Offer</span>
                    <span className="font-medium">{buyerOffer ? formatCurrency(buyerOffer, item.currency) : "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Current Offer</span>
                    <span className="font-semibold text-primary">{currentOffer ? formatCurrency(currentOffer, item.currency) : "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Quantity</span>
                    <span>{item.quantity} units</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Round</span>
                    <span>{item.currentRound} / {item.maxRounds}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    Updated {formatRelativeTime(item.updatedAt || item.createdAt)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewDetail?.(item)}
                    className="h-8 text-xs"
                  >
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
