import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MascotBot Voice Widget",
  description: "Embeddable voice agent widget with conversation continuity.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
