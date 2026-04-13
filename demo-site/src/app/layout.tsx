import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movers Co. — Continuity Demo",
  description:
    "WordPress-simulating demo site that embeds the MascotBot voice widget. Every link is a hard reload; the conversation survives each one.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const widgetUrl =
    process.env.NEXT_PUBLIC_WIDGET_URL || "http://localhost:3004";
  return (
    <html lang="en">
      <body>
        {children}
        {/* The one line a real WordPress site would paste into its header. */}
        <Script src={`${widgetUrl}/widget.js`} strategy="afterInteractive" />
      </body>
    </html>
  );
}
