"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  History,
  Wallet,
  Settings,
  LogOut,
  BarChart3,
  DollarSign,
  PlusCircle,
  ExternalLink,
  Globe,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useLanguage, Language } from "@/context/LanguageContext";
import { useState } from "react";

const languages: { code: Language; name: string; flag: string }[] = [
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "es", name: "Español", flag: "🇪🇸" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { t, currentLanguage, setLanguage } = useLanguage();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);

  const navigation = [
    {
      name: t("sidebar.dashboard"),
      href: "/",
      icon: LayoutDashboard,
    },
    {
      name: t("sidebar.challenge"),
      href: "/challenge",
      icon: TrendingUp,
    },
    {
      name: t("sidebar.trades"),
      href: "/trades",
      icon: History,
    },
    {
      name: t("sidebar.accounts"),
      href: "/accounts",
      icon: Wallet,
    },
    {
      name: t("sidebar.analytics"),
      href: "/analytics",
      icon: BarChart3,
    },
    {
      name: t("sidebar.payout"),
      href: "/payout",
      icon: DollarSign,
    },
    {
      name: t("sidebar.settings"),
      href: "/settings",
      icon: Settings,
    },
  ];

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <div className="flex h-screen w-64 flex-col bg-card border-r">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
          PropFirm
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}

        {/* New Challenge Button */}
        <div className="pt-4 mt-4 border-t">
          <a
            href="https://amafirm.web.app/#pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <PlusCircle className="h-5 w-5" />
            {t("sidebar.newChallenge")}
            <ExternalLink className="h-3 w-3 ml-auto" />
          </a>
        </div>
      </nav>

      {/* Language Selector */}
      <div className="border-t px-3 py-4">
        <div className="relative">
          <button
            onClick={() => setLanguageMenuOpen(!languageMenuOpen)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors w-full"
          >
            <Globe className="h-5 w-5" />
            <span>
              {languages.find((lang) => lang.code === currentLanguage)?.flag}{" "}
              {languages.find((lang) => lang.code === currentLanguage)?.name}
            </span>
          </button>

          {languageMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-card border rounded-lg shadow-lg overflow-hidden">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setLanguageMenuOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-4 py-3 text-sm transition-colors hover:bg-accent",
                    currentLanguage === lang.code
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-lg">{lang.flag}</span>
                    <span>{lang.name}</span>
                  </span>
                  {currentLanguage === lang.code && (
                    <Check className="h-4 w-4" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* User section */}
      <div className="border-t p-4">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-600">
            <span className="text-sm font-semibold text-white">
              {user?.email?.[0].toUpperCase() || "U"}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{t("sidebar.trader")}</p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email || "user@propfirm.com"}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-5 w-5" />
          {t("sidebar.logout")}
        </button>
      </div>
    </div>
  );
}
