import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Nav from "./components/Nav";
import { AuthProvider } from "../lib/auth";
import { BalanceProvider } from "@/lib/balance";

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
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full scrollly flex-col bg-bg text-fg">
        <AuthProvider>
          <BalanceProvider>
            <Nav />
            <main className="flex-1">{children}</main>
          </BalanceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
