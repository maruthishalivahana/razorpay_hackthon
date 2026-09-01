import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PackageCheck } from "lucide-react";

interface AgentProductScopeSectionProps {
  productCount?: number;
}

export function AgentProductScopeSection({ productCount = 0 }: AgentProductScopeSectionProps) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Product Scope</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Products available to your Negotiation Agent
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="p-3 rounded-md bg-muted/50 border border-border flex items-center justify-between">
          <span className="font-medium text-foreground">Active Catalog Scope</span>
          <span className="font-semibold text-primary">
            {productCount} {productCount === 1 ? "active product" : "active products"}
          </span>
        </div>
        <p className="text-muted-foreground text-[11px]">
          Agent currently uses all active products in your catalog. Product-level override rules are inherited from list prices and negotiability flags.
        </p>
      </CardContent>
    </Card>
  );
}
