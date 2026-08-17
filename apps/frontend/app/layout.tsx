import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import Nav from "./components/Nav";
import { AuthProvider } from "../lib/auth";
import { BalanceProvider } from "@/lib/balance";
import { MarketProvider } from "@/lib/market";

import PositionProvider from "@/lib/positions";
import { OrdersProvider } from "@/lib/order";
import { PricesProvider } from "@/lib/price";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toast";
import ConnectionWatcher from "./components/ConnectionWatcher";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Backpack — Trade Perpetual Futures",
  description: "A perpetual futures exchange.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        inter.variable,
        "font-sans",
        geist.variable,
      )}
    >
      <body className="flex min-h-full scrollly flex-col bg-bg text-fg">
        <AuthProvider>
          <BalanceProvider>
            <MarketProvider>
              <PricesProvider>
                <PositionProvider>
                  <OrdersProvider>
                    <Nav />
                    <main className="flex-1">{children}</main>
                  </OrdersProvider>
                </PositionProvider>
              </PricesProvider>
            </MarketProvider>
          </BalanceProvider>
        </AuthProvider>
        <Toaster />
        <ConnectionWatcher />
      </body>
    </html>
  );
}
