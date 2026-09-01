import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 md:p-24 bg-background">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
            Agentic Commerce
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Merchant Dashboard Foundation
          </p>
        </div>

        <Card className="text-left shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">System Status</CardTitle>
            <CardDescription>
              Frontend foundation initialized with Next.js, Tailwind CSS, and shadcn/ui.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="env-status" className="text-xs font-medium text-muted-foreground">
                API Base URL
              </label>
              <Input
                id="env-status"
                readOnly
                value={process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}
                className="bg-muted/50 text-xs font-mono"
              />
            </div>
          </CardContent>
          <CardFooter className="pt-2">
            <Link href="/merchant" className="w-full">
              <Button className="w-full">Open Merchant Dashboard</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
