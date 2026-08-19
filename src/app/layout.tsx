import type { Metadata } from "next";
import "@/styles/globals.css";
import { inter } from "@/styles/fonts";

// No next/font/google import. It makes every production build depend on a live
// fetch to fonts.googleapis.com, and a build that fails when someone else's CDN
// is slow is not a property worth carrying for 32 weeks. D-27. Inter is
// self-hosted from a locked dependency instead — see src/styles/fonts.ts.

export const metadata: Metadata = {
  title: "BMMP",
  description: "Battery Material Management Platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
