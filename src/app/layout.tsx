import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Win7 Safe Proxy",
  description: "A JS-disabled, sanitized browsing proxy for safer site inspection."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

