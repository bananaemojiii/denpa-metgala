import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Denpa · Met Gala 2026",
  description: "Live prediction markets for the Met Gala",
};

// viewport-fit=cover is required for env(safe-area-inset-*) to resolve on iOS,
// which the chat composer uses to stay above the home indicator / keyboard.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  );
}
