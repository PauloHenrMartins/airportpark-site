import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AirportPark — Disparos",
  description: "Sistema de disparos de e-mail marketing Airport Park",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" style={{ colorScheme: "light" }}>
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
