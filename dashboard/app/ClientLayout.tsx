"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { AccountProvider } from "@/context/AccountContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Menu, Palette, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [style, setStyle] = useState<string>("default");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("ama_dashboard_style");
      const next = stored && typeof stored === "string" ? stored : "default";
      setStyle(next);
      document.documentElement.dataset.style = next;
    } catch {
      setStyle("default");
      document.documentElement.dataset.style = "default";
    }
  }, []);

  const applyStyle = (next: string) => {
    setStyle(next);
    try {
      localStorage.setItem("ama_dashboard_style", next);
    } catch {
    }
    document.documentElement.dataset.style = next;
  };

  return (
    <AuthProvider>
      <LanguageProvider>
        <AccountProvider>
          <ProtectedRoute>
            {isLoginPage ? (
              children
            ) : (
              <div className="flex min-h-screen bg-background">
                <div className="hidden md:flex">
                  <Sidebar />
                </div>

                {mobileNavOpen && (
                  <div
                    className="fixed inset-0 z-50 md:hidden"
                    role="dialog"
                    aria-modal="true"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) setMobileNavOpen(false);
                    }}
                  >
                    <div className="absolute inset-0 bg-black/60" />
                    <div
                      className="absolute inset-y-0 left-0 w-64 bg-card border-r"
                      onClickCapture={(e) => {
                        const target = e.target as HTMLElement;
                        if (target && target.closest('a')) setMobileNavOpen(false);
                      }}
                    >
                      <div className="absolute right-3 top-3 z-10">
                        <button
                          type="button"
                          onClick={() => setMobileNavOpen(false)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                          aria-label="Close navigation"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                      <Sidebar />
                    </div>
                  </div>
                )}
                <main className="flex-1 overflow-y-auto">
                  <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="flex items-center justify-between px-4 py-3 sm:px-6">
                      <button
                        type="button"
                        onClick={() => setMobileNavOpen(true)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground md:hidden"
                        aria-label="Open navigation"
                      >
                        <Menu className="h-5 w-5" />
                      </button>
                      <div className="flex items-center gap-2">
                        <div className="hidden sm:flex items-center gap-2">
                          <Palette className="h-4 w-4 text-muted-foreground" />
                          <Select value={style} onValueChange={applyStyle}>
                            <SelectTrigger className="h-9 w-[170px]">
                              <SelectValue placeholder="Style" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Default</SelectItem>
                              <SelectItem value="emerald">Emerald</SelectItem>
                              <SelectItem value="violet">Violet</SelectItem>
                              <SelectItem value="amber">Amber</SelectItem>
                              <SelectItem value="rose">Rose</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Link
                          href="/contact"
                          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4"
                        >
                          Contact
                        </Link>
                      </div>
                    </div>
                  </div>
                  {children}
                </main>
              </div>
            )}
          </ProtectedRoute>
        </AccountProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
