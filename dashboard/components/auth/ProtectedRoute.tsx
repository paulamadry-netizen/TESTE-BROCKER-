"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !loading && !user && pathname !== "/login") {
      router.push("/login");
    }
  }, [mounted, user, loading, router, pathname]);

  useEffect(() => {
    if (mounted && !loading && user && !user.emailVerified && pathname !== "/login") {
      router.push("/login?verify=1");
    }
  }, [mounted, user, loading, router, pathname]);

  // Prevent hydration mismatch by showing nothing until mounted
  if (!mounted || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user && pathname !== "/login") {
    return null;
  }

  if (user && !user.emailVerified && pathname !== "/login") {
    return null;
  }

  return <>{children}</>;
}
