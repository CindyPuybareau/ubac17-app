import Link from "next/link";

// Bandeau à deux onglets partagé par /connexion et /inscription — ce sont
// deux routes séparées (chacune garde son propre formulaire, sa propre
// logique), mais visuellement présentées comme un seul écran à onglets,
// pour rester simple à faire évoluer sans fusionner deux flux différents
// dans un seul fichier.
export default function AuthTabs({ active }: { active: "connexion" | "inscription" }) {
  const tabClass = (tab: "connexion" | "inscription") =>
    `flex-1 rounded-full py-2 text-center text-sm font-semibold transition-colors ${
      active === tab ? "bg-navy text-white" : "text-zinc-500 hover:bg-zinc-100"
    }`;

  return (
    <div className="mb-6 flex gap-1.5 rounded-full bg-zinc-100 p-1">
      <Link href="/connexion" className={tabClass("connexion")}>
        Se connecter
      </Link>
      <Link href="/inscription" className={tabClass("inscription")}>
        Créer un compte
      </Link>
    </div>
  );
}
