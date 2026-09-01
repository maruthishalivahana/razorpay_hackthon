import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AnalyticsPage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track commerce metrics, negotiation conversion rates, and revenue.
        </p>
      </div>
      <Card className="p-12 text-center border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Analytics</CardTitle>
          <CardDescription className="text-base pt-2">
            Coming soon
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
