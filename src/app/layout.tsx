import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UBAC - Union Basket Angoulins Châtelaillon",
  description: "Application du club UBAC : membres, calendrier et convocations.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "UBAC",
  },
  // Safari iOS met en cache l'icône "Sur l'écran d'accueil" de façon très
  // agressive et ne la revérifie quasiment jamais tant que l'URL ne change
  // pas — un logo mis à jour côté serveur reste invisible indéfiniment sur
  // les téléphones qui l'ont déjà ajoutée. Le suffixe ?v= force iOS à voir
  // une URL différente, donc à retélécharger, la prochaine fois que ce
  // fichier changera vraiment (à incrémenter à ce moment-là).
  icons: {
    icon: [
      { url: "/favicon-32.png?v=2", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#203090",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
