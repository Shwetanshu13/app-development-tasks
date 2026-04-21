import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Image Compression UI",
  description: "Next.js application that compresses an image and performs a pixel-by-pixel quality comparison.",
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
