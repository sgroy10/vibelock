import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeLock — Build apps with confidence",
  description:
    "The multilingual AI app builder. Describe what you want in any language — VibeLock builds it live.",
  openGraph: {
    title: "VibeLock — Build apps with confidence",
    description:
      "The multilingual AI app builder. Describe what you want in any language.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[var(--vl-bg)]">{children}</body>
    </html>
  );
}
