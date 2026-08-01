import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Playground",
  description: "Test open-weight LLMs running on your machine.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
