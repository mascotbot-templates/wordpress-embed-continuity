import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

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
    <html
      lang="en"
      style={{ background: "transparent", backgroundColor: "transparent" }}
    >
      <body
        style={{ background: "transparent", backgroundColor: "transparent" }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
