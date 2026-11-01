import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ConnectDesk — Workplace Messaging",
  description: "A fast, clean dark-blue group messaging application for real-time workplace collaboration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} h-full antialiased`}>
      <body className={`${inter.className} min-h-full flex flex-col bg-[#071A33] text-[#F8FAFC] selection:bg-[#2563EB]/40 selection:text-white`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
