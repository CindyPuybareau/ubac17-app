"use client";

// Retour de Cindy du 07/09 (deuxième passe) : le premier "Relancer"
// envoyait directement les emails en un clic, sans aperçu -- alors qu'une
// vraie fenêtre de prévisualisation (sujet/corps éditables, envoi
// explicite et distinct) existe déjà pour la sélection multiple dans
// CotisationParticipantsTable ("Relancer la sélection"). Ce bouton ne fait
// donc plus qu'y rediriger, avec tout présélectionné -- il ne déclenche
// plus aucun envoi lui-même.
//
// Vraie navigation (pas de SectionLinkCard/section-nav-context) : on veut
// que l'URL porte réellement "?preselect=en_attente" pour que
// CotisationParticipantsTable puisse le lire à son montage -- une bascule
// "douce" via le contexte ne changerait jamais l'URL (voir le commentaire
// d'AdminSidebar sur la lecture unique de "?section=..."). Un clic
// explicite et rare comme celui-ci n'a pas besoin d'éviter ce coût, à la
// différence du pré-chargement automatique du 07/09 (retiré le jour même,
// lui, pour raison de charge serveur).
export default function RelanceRedirectButton() {
  return (
    <button
      type="button"
      onClick={(e) => {
        // La carte entière est un lien vers "Cotisations & Licences"
        // (SectionLinkCard) -- ce bouton vit dedans mais déclenche sa
        // propre navigation, jamais celle (douce) de la carte.
        e.stopPropagation();
        e.preventDefault();
        window.location.href = "/dashboard?tab=admin&section=cotisations-licences&preselect=en_attente";
      }}
      className="rounded-full bg-navy/10 px-2 py-0.5 text-[11px] font-semibold text-navy transition-colors hover:bg-navy/15"
    >
      Relancer
    </button>
  );
}
