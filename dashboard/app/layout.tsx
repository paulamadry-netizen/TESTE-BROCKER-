import type { Metadata } from "next";
import "./globals.css";
import { ClientLayout } from "./ClientLayout";

export const metadata: Metadata = {
  title: "PropFirm Dashboard - Trading Challenge & Funded Accounts",
  description: "Professional trading prop firm dashboard for managing challenges and funded accounts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-style="default">
      <body className="font-sans antialiased">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
