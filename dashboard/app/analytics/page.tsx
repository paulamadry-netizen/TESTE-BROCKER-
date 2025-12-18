"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Detailed analysis of your trading performance
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Analytics Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-lg font-semibold">No trading data yet</p>
          <p className="text-sm text-muted-foreground mt-2 text-center max-w-md">
            Start trading to see detailed analytics, charts, and performance metrics. Your trading statistics will appear here once you have active trades.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
