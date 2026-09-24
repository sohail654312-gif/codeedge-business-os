import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeEdge Business OS",
  description: "One Business. One Account. One Control Centre.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
