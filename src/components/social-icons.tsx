// Facebook/Instagram ne sont plus fournis par lucide-react (les logos de
// marques ont été retirés du paquet il y a plusieurs versions, pour des
// raisons de droits — vérifié dans node_modules, aucune icône "Facebook"/
// "Instagram" nulle part). Contrairement à WhatsApp ailleurs dans l'appli
// (remplacé par l'icône générique MessageCircle, toujours accompagnée d'un
// texte), ces deux-là vivent sur la page publique où un visiteur doit
// reconnaître le réseau au premier coup d'œil — une icône générique serait
// trompeuse. Deux tracés SVG minimalistes (licence libre, style
// "Simple Icons") à la place, pas une nouvelle dépendance npm.
type IconProps = { className?: string };

// Couleurs de marque réelles (retour de Cindy : "en couleur, choisi en
// fonction de notre maquette") plutôt que currentColor — un visiteur doit
// reconnaître Facebook/Instagram sans effort. Instagram en aplat plutôt
// qu'en dégradé officiel à 3 tons : évite un <linearGradient> avec un id
// à rendre unique (l'icône apparaît deux fois sur la page, header + pied
// de page), pour un rendu tout aussi reconnaissable.
export function FacebookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="#1877F2" className={className} aria-hidden="true">
      <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06c0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02Z" />
    </svg>
  );
}

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="#E1306C" className={className} aria-hidden="true">
      <path d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6Zm8.65 1.5a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    </svg>
  );
}
