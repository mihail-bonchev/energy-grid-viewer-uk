import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GB Grid Battery Storage · Live Dashboard",
  description:
    "Real-time monitoring of UK grid-scale battery energy storage systems (BESS). Data sourced from Elexon Insights API.",
  openGraph: {
    title: "GB Grid Battery Storage Dashboard",
    description: "Live charge/discharge monitoring for UK transmission-level BESS",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
