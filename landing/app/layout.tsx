import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HashFox Labs — Learn Any Market, Without Risk",
  description:
    "Where traders prove their edge and build an un-fakeable reputation without risking capital. Simulate strategies across crypto and prediction markets, climb the onchain leaderboard, and let your track record speak for itself",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
  },
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
