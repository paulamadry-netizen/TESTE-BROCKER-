"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { AccountProvider } from "@/context/AccountContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <AuthProvider>
      <LanguageProvider>
        <AccountProvider>
          <ProtectedRoute>
            {isLoginPage ? (
              children
            ) : (
              <div className="flex min-h-screen bg-background">
                <Sidebar />
                <main className="flex-1 overflow-y-auto">{children}</main>
              </div>
            )}
          </ProtectedRoute>
        </AccountProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
