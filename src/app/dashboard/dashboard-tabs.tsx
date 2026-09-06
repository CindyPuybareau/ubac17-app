"use client";

import { useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";

export type DashboardTab = {
  key: string;
  label: string;
  content: ReactNode;
};

// Repère de chargement aux couleurs du club (logo qui pulse + barre de
// progression), repris à l'identique de dashboard/loading.tsx : partagé
// ici entre le cas "content vaut encore null" (juste en dessous) et le
// voile de changement d'onglet (plus bas) plutôt que dupliqué deux fois.
// Retour de Cindy du 06/09 ("c'est moche... logo avec chargement bien
// placé, centré et tout ! pas de retour à la ligne") : le texte porte
// désormais whitespace-nowrap -- rien ne justifie qu'une phrase aussi
// courte se coupe en deux lignes, quelle que soit la largeur de l'écran.
function SpaceLoadingIndicator() {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- même raison
          que club-reports-section.tsx : le logo doit s'afficher
          immédiatement, sans dépendre de l'optimisation à la volée de
          next/image (qui, pour ce court repère de chargement, n'a
          jamais le temps d'arriver). */}
      <img src="/logo.png" alt="UBAC" className="h-10 w-10 animate-pulse object-contain" />
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full w-1/3 animate-[loading-bar_1.1s_ease-in-out_infinite] rounded-full bg-ubac-yellow" />
      </div>
      <p className="whitespace-nowrap text-sm font-medium text-zinc-500">Chargement de cet espace...</p>
      <style>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}

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
          repère de chargement complet plutôt qu'un texte gris qui se
          coupait en deux lignes (retour de Cindy du 06/09, "c'est moche
          ... pas de retour à la ligne"), dans une carte à sa taille plutôt
          que perdu dans un grand espace blanc. */}
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
          <div className="flex items-center justify-center rounded-2xl border border-zinc-100 bg-white py-16 shadow-sm">
            <SpaceLoadingIndicator />
          </div>
        )}
        {/* Voile de chargement (retour de Cindy du 06/09, voir plus haut) :
            recouvre juste ce bloc-ci, jamais le menu au-dessus -- pendant
            ce temps, `current` pointe toujours vers l'ANCIEN onglet actif
            (activeKey ne bascule qu'une fois le nouveau prêt), donc c'est
            bien son contenu qu'on assombrit, en attendant le nouveau. */}
        {isPending && (
          <>
            {/* Fond qui recouvre TOUT l'ancien contenu, aussi haut soit-il
                (un onglet Bureau/Coach peut faire plusieurs écrans de
                haut) -- absolute inset-0 s'étire sur toute cette hauteur,
                pas seulement la partie visible. */}
            <div className="absolute inset-0 z-10 rounded-2xl bg-zinc-50" />
            {/* Retour de Cindy du 06/09 ("il faut scroller pour le voir
                sur téléphone", persistant même après le passage en `fixed`
                seul) : cette page a un ancêtre en overflow-x-hidden
                (page.tsx, filet anti-scroll-horizontal posé le 25/08) --
                déjà responsable une fois d'un piège CSS du même genre sur
                cette page (voir le popover des notifications, même
                fichier, juste au-dessus de <header>). Un `position:fixed`
                sous un ancêtre non "visible" en overflow n'est pas
                garanti de se caler sur le vrai viewport dans tous les
                navigateurs mobiles. createPortal sort ce voile de tout
                l'arbre DOM de la page pour le poser à la racine
                (document.body) -- même principe que les modales de
                l'appli (member-detail-modal.tsx, confirm-dialog.tsx...),
                qui n'ont jamais ce souci. */}
            {typeof document !== "undefined" &&
              createPortal(
                <div className="fixed left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
                  <SpaceLoadingIndicator />
                </div>,
                document.body
              )}
          </>
        )}
      </div>
    </div>
  );
}
