import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Denpa · Met Gala 2026",
  description: "Live prediction markets for the Met Gala",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  );
}
