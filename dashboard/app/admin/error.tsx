"use client";

import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin page error:", error);
  }, [error]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Erreur sur la page Admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Une erreur a empêché l'affichage de l'admin dashboard.
          </p>
          <div className="rounded-md border bg-background p-3 text-xs whitespace-pre-wrap">
            {String(error?.message || error)}
            {error?.digest ? `\n\nDigest: ${error.digest}` : ""}
          </div>
          <Button onClick={() => reset()}>Réessayer</Button>
        </CardContent>
      </Card>
    </div>
  );
}
