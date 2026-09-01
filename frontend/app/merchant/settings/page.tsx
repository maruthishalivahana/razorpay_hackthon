import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage merchant profile, API credentials, and integration settings.
        </p>
      </div>
      <Card className="p-12 text-center border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Settings</CardTitle>
          <CardDescription className="text-base pt-2">
            Coming soon
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
