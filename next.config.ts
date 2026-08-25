import type { NextConfig } from "next";

// Domaine du projet Supabase (base de données + Storage pour les avatars/
// photos) : seul tiers dont l'appli a réellement besoin pour charger des
// images et faire des requêtes réseau — voir le détail de l'audit du
// 2026-08-25. Toutes les autres URLs externes du code (HelloAsso, Google
// Maps/Waze, WhatsApp, boutique, PDF réglementaires...) sont de simples
// liens <a href> ouverts par le visiteur, jamais des ressources chargées
// par la page — la CSP n'a donc pas besoin de les connaître.
const SUPABASE_HOST = "wosrpnxddzovoisvllam.supabase.co";

// Content-Security-Policy volontairement "pragmatique" plutôt que stricte
// à base de nonce : Next.js (App Router) injecte lui-même de petits
// <script> inline dans le HTML pour l'hydratation (streaming RSC), donc
// script-src/style-src gardent 'unsafe-inline' pour ne pas casser le
// rendu. Une CSP à base de nonce serait plus stricte mais demande de
// générer un nonce par requête dans src/proxy.ts et de le propager
// partout — laissé de côté pour l'instant (voir échange du 2026-08-25,
// Cindy a choisi l'option la moins risquée). Même sans nonce, cette CSP
// bloque déjà l'essentiel de ce que vérifie un audit : impossible de
// charger un script, une image ou une iframe depuis un domaine tiers non
// listé ici.
// 'unsafe-eval' seulement en dev : React s'en sert pour reconstruire les
// call stacks du mode développement (constaté en local, voir la console
// "eval() is not supported... React will never use eval() in production
// mode") — jamais nécessaire ni ajouté sur le site en ligne.
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: https://${SUPABASE_HOST}`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Retire le header "X-Powered-By: Next.js" (retour d'audit du
  // 2026-08-25) : n'apporte rien au visiteur, ne fait qu'annoncer la
  // techno utilisée à quiconque inspecte les réponses.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Aucun usage de caméra/micro/géolocalisation nulle part dans
          // l'appli (vérifié) : désactivés sans risque de casse.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
