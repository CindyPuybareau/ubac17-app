"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type DashboardTab = {
  key: string;
  label: string;
  content: ReactNode;
};

// Repère de chargement aux couleurs du club (logo qui pulse + barre de
// progression), repris à l'identique de dashboard/loading.tsx. Retour de
// Cindy du 06/09 ("c'est moche... logo avec chargement bien placé,
// centré et tout ! pas de retour à la ligne") : le texte porte désormais
// whitespace-nowrap -- rien ne justifie qu'une phrase aussi courte se
// coupe en deux lignes, quelle que soit la largeur de l'écran.
function SpaceLoadingIndicator() {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-zinc-100 bg-white py-16 shadow-sm">
      <div className="flex flex-col items-center justify-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- même
            raison que club-reports-section.tsx : le logo doit s'afficher
            immédiatement, sans dépendre de l'optimisation à la volée de
            next/image (qui, pour ce court repère de chargement, n'a
            jamais le temps d'arriver). */}
        <img src="/logo.png" alt="UBAC" className="h-10 w-10 animate-pulse object-contain" />
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-zinc-200">
          <div className="h-full w-1/3 animate-[loading-bar_1.1s_ease-in-out_infinite] rounded-full bg-ubac-yellow" />
        </div>
        <p className="whitespace-nowrap text-sm font-medium text-zinc-500">Chargement de cet espace...</p>
      </div>
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
  // VERS QUEL onglet on vient de cliquer, pour l'afficher sur ce bouton
  // précis. displayedPendingKey se recalcule à chaque rendu plutôt que
  // d'être remis à zéro via un useEffect : une fois activeKey a rejoint la
  // cible, il redevient `null` tout seul au rendu suivant -- pendingKey
  // lui-même n'a jamais besoin d'être nettoyé, chaque nouveau clic
  // l'écrase de toute façon.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const displayedPendingKey = pendingKey !== activeKey ? pendingKey : null;

  // Retour de Cindy du 07/09 ("un simple changement de vue sans reload
  // serait plus rapide", au sujet des onglets Bureau/Coach/Famille) : au
  // contraire des sections internes de Bureau (voir section-nav-context.tsx),
  // chaque ESPACE n'est réellement calculé que lorsqu'il devient actif
  // (retour du 04/09, "pourquoi ça bug quand on a plusieurs espaces") --
  // il n'existe donc rien à révéler instantanément sans un vrai aller-
  // retour serveur, contrairement aux cartes KPI. Le pré-chargement au
  // survol/focus/touch (handlePrefetch, plus bas) aide déjà, mais pas le
  // tout premier tap sur mobile (pas de survol avant). Cet effet lance ce
  // même pré-chargement pour les AUTRES onglets tout seul, une fois la
  // page posée -- en tâche de fond (requestIdleCallback, jamais en
  // concurrence avec le rendu de l'onglet actif ; setTimeout en repli pour
  // Safari, qui ne connaît pas requestIdleCallback), pour qu'un futur clic
  // les retrouve déjà prêts la plupart du temps. Se redéclenche à chaque
  // changement d'onglet actif, pour garder les autres "chauds". Placé
  // avant le "if (tabs.length === 0) return null" ci-dessous : les Hooks
  // React doivent s'exécuter inconditionnellement, jamais après un retour
  // anticipé.
  useEffect(() => {
    const otherKeys = tabs.map((t) => t.key).filter((key) => key !== activeKey);
    if (otherKeys.length === 0) return;

    function run() {
      const params = new URLSearchParams(searchParams.toString());
      for (const key of otherKeys) {
        params.set("tab", key);
        router.prefetch(`/dashboard?${params.toString()}`);
      }
    }

    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(run, 1500);
    return () => window.clearTimeout(id);
    // Dépendances volontairement réduites aux clés (activeKey + la liste
    // des clés d'onglets, jamais `tabs`/`router`/`searchParams` en entier) :
    // `tabs` porte du contenu JSX recréé à chaque rendu de page.tsx, et
    // `searchParams` change de référence à chaque navigation -- les inclure
    // relancerait ce pré-chargement en boucle plutôt qu'une fois par
    // vrai changement d'onglet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, tabs.map((t) => t.key).join(",")]);

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

      {/* Retour de Cindy du 06/09 ("toujours un écran blanc", "il faut
          scroller pour le voir", "toujours trop haut, dépasse de la carte
          blanche") : trois tentatives successives avec un voile en
          absolute/fixed puis un portail vers document.body n'ont jamais
          affiché ce repère de façon fiable sur téléphone -- trop de
          combinaisons possibles de hauteur de page, de défilement et de
          particularités des navigateurs mobiles pour un simple élément
          positionné "par-dessus". Approche radicalement plus simple : dès
          que l'onglet est en cours de chargement (isPending) OU que son
          contenu vaut encore null (juste après un premier clic, avant que
          page.tsx ait fini son premier calcul, voir le commentaire du
          04/09 plus haut dans l'historique), CE repère REMPLACE le
          contenu, dans le flux normal de la page -- juste sous les
          boutons d'onglets, exactement là où on vient de cliquer et où le
          regard est déjà posé. Aucun `fixed`, aucun `absolute`, aucun
          portail : impossible qu'il se retrouve hors champ, quelle que
          soit la hauteur de l'ancien contenu ou la position de
          défilement. Seule contrepartie : l'ancien contenu ne reste plus
          visible en fond (assombri) pendant l'attente -- un compromis
          largement préférable à un repère qu'on ne voit jamais. */}
      <div key={current.key}>
        {isPending || !current.content ? <SpaceLoadingIndicator /> : current.content}
      </div>
    </div>
  );
}
