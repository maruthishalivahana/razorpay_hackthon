import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function OrdersPage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Orders
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage orders, agreement approvals, and fulfillment status.
        </p>
      </div>
      <Card className="p-12 text-center border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Orders</CardTitle>
          <CardDescription className="text-base pt-2">
            Coming soon
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
