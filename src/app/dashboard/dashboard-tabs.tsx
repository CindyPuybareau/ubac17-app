"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

export type DashboardTab = {
  key: string;
  label: string;
  content: ReactNode;
};

// Retour de Cindy du 04/09 ("pourquoi ça bug quand on a plusieurs
// espaces") : côté page.tsx, un seul espace est désormais réellement
// calculé par chargement (celui désigné par `activeKey`, lui-même dérivé
// de l'URL ?tab=...) -- les autres n'ont qu'un bouton, leur `content` vaut
// `null`. Ce composant ne peut donc plus se contenter de cacher/afficher
// des contenus déjà tous là : cliquer sur un onglet inactif doit
// redemander la page avec le bon ?tab=... pour que CET espace soit calculé
// à son tour. useTransition donne un état "en cours" pendant cet aller-
// retour, affiché sur le bouton cliqué (le seul dont le contenu n'est pas
// encore là) plutôt qu'un écran blanc silencieux.
export default function DashboardTabs({
  tabs,
  activeKey,
}: {
  tabs: DashboardTab[];
  activeKey: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  // Retour de Cindy du 06/09 ("le délai d'un espace à un autre reste
  // long") : le seul indice visuel pendant l'attente était un "…" ajouté
  // au texte du bouton cliqué -- discret au point de passer inaperçu,
  // laissant penser que le clic n'avait rien fait. `pendingKey` retient
  // VERS QUEL onglet on vient de cliquer, pour habiller le contenu
  // actuellement affiché d'un voile + repère de chargement bien visible
  // pendant l'attente, sans jamais faire disparaître le menu ni casser la
  // mise en page (loading.tsx, lui, continue de couvrir le tout premier
  // chargement/un rechargement complet -- ce voile-ci couvre
  // spécifiquement le changement d'onglet, que useTransition empêche
  // volontairement de déclencher pour éviter un flash plein écran).
  // displayedPendingKey se recalcule à chaque rendu plutôt que d'être
  // remis à zéro via un useEffect : une fois activeKey a rejoint la cible,
  // il redevient `null` tout seul au rendu suivant -- pendingKey lui-même
  // n'a jamais besoin d'être nettoyé, chaque nouveau clic l'écrase de
  // toute façon.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const displayedPendingKey = pendingKey !== activeKey ? pendingKey : null;

  if (tabs.length === 0) {
    return null;
  }

  const current = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  // Retour de Cindy du 05/09 ("le délai au clic est long") : router.push
  // (contrairement à un <Link>) ne préchauffe rien tout seul. Survoler un
  // bouton (ou le toucher, sur mobile où il n'y a pas de survol) déclenche
  // ce même aller-retour EN AVANCE, pendant que la personne hésite encore
  // -- Next.js garde la réponse en mémoire côté client, donc le clic qui
  // suit la retrouve déjà prête au lieu de repartir de zéro.
  function tabHref(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    return `/dashboard?${params.toString()}`;
  }

  function handlePrefetch(key: string) {
    if (key === current.key) return;
    router.prefetch(tabHref(key));
  }

  function handleClick(key: string) {
    if (key === current.key) return;
    setPendingKey(key);
    startTransition(() => {
      router.push(tabHref(key));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleClick(tab.key)}
              onMouseEnter={() => handlePrefetch(tab.key)}
              onFocus={() => handlePrefetch(tab.key)}
              onTouchStart={() => handlePrefetch(tab.key)}
              disabled={isPending}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                current.key === tab.key
                  ? "border-ubac-yellow bg-ubac-yellow/10 text-ubac-yellow-dark"
                  : // Retour de Cindy du 29/08 ("les onglets se fondent dans le
                    // fond") : sans fond propre, un onglet non actif (bordure
                    // grise très claire, aucun remplissage) se distinguait à
                    // peine du fond crème général de l'appli (--background,
                    // globals.css) — même correctif déjà en place ailleurs
                    // pour ce genre de pastille (team-selector-pills.tsx).
                    "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {tab.label}
              {displayedPendingKey === tab.key ? "…" : ""}
            </button>
          ))}
        </div>
      )}

      {/* Retour de Cindy du 04/09 : content peut valoir `null` le temps
          qu'un clic recharge l'espace demandé (voir handleClick) -- un
          message plutôt qu'un vide silencieux pendant ce court instant. */}
      {/* Retour de Cindy du 06/09 (Sandrine MANZELLE, Bureau + joueuse +
          maman -- "Mon équipe" et "Mes enfants" sont réutilisés à vide l'un
          après l'autre) : "Mon équipe" et "Mes enfants" sont tous les deux
          le MÊME composant FamilyView (voir page.tsx, buildFamilyView).
          Sans clé distinguant les onglets, React les traite comme LA MÊME
          instance en changeant seulement ses props d'un onglet à l'autre --
          son état interne (le joueur sélectionné, voir family-view.tsx)
          survit alors au changement d'onglet et pointe vers un id absent de
          la nouvelle liste, ce qui vide tout l'écran sans le moindre
          message. `key` force React à démonter/remonter proprement dès que
          l'onglet actif change, quel que soit le composant qu'il utilise en
          dessous (protège aussi Bureau/Coach d'un bug de ce genre plus
          tard, pas seulement FamilyView). */}
      <div key={current.key} className="relative">
        {current.content ?? (
          <p className="text-sm text-zinc-500">Chargement de cet espace…</p>
        )}
        {/* Voile de chargement (retour de Cindy du 06/09, voir plus haut) :
            recouvre juste ce bloc-ci, jamais le menu au-dessus -- pendant
            ce temps, `current` pointe toujours vers l'ANCIEN onglet actif
            (activeKey ne bascule qu'une fois le nouveau prêt), donc c'est
            bien son contenu qu'on assombrit, en attendant le nouveau. */}
        {isPending && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-zinc-50/85 backdrop-blur-[1px]">
            <Image
              src="/logo.png"
              alt="UBAC"
              width={40}
              height={40}
              className="h-10 w-10 animate-pulse object-contain"
            />
            <p className="text-sm font-medium text-zinc-500">Chargement de cet espace...</p>
          </div>
        )}
      </div>
    </div>
  );
}
