import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter, Poppins, Space_Grotesk } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Trio typographique de la direction artistique (maquette "Maillot Neuf
// UBAC", suivie à la lettre à la demande de Cindy le 2026-08-23) —
// chacune auto-hébergée par next/font au moment du build, aucune requête
// vers Google au chargement :
// - Poppins (700-900) : titres, réservée aux gros libellés (globals.css,
//   --font-display).
// - Inter : texte courant, remplace Arial/la police système par défaut
//   (globals.css, --font-body sur html/body).
// - Space Grotesk : chiffres/scores, appliquée ponctuellement via la
//   classe .font-numeric là où un nombre doit se détacher (montants,
//   scores de match, gros chiffres de KPI).
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} ${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
