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
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23FF6B2C'/><text x='50%25' y='56%25' dominant-baseline='middle' text-anchor='middle' font-size='20' font-weight='bold' fill='white' font-family='system-ui'>V</text></svg>" type="image/svg+xml" />
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
