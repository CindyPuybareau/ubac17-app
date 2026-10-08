"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  Clock,
  Euro,
  Flame,
  Handshake,
  HeartPulse,
  IdCard,
  Info,
  MessageCircle,
  ScrollText,
  Shield,
  ShieldCheck,
  Shirt,
  Target,
  Upload,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import TrombinoscopeButton from "@/app/dashboard/trombinoscope-button";
import CollapsibleCard from "./collapsible-card";

// Contenu des 3 documents officiels du club (retour de Cindy du 25/08,
// PDF fournis : Charte-du-Joueur-Licencie-25-26.pdf,
// Charte-du-Parent-de-Joueur-Licencie-25-26.pdf,
// Reglement-Interieur-2024-2025.pdf), retranscrits ici plutôt qu'affichés
// en PDF brut pour rester dans la charte graphique de l'app — voir
// documents-panel.tsx pour la répartition par espace (Bureau/Coach/Famille/
// Enfant). Lecture seule pour l'instant (retour de Cindy du 25/08) : pas de
// case à cocher ni de suivi de signature en base, comme pour le Règlement
// Intérieur et la Charte du Parent déjà en simple téléchargement sur
// ubac17.fr — même principe repris ici. Contenu réorganisé pour le
// Règlement Intérieur (articles regroupés par thème plutôt que numérotés un
// par un) pour une lecture plus confortable à l'écran ; rien n'a été
// retiré sur le fond. La ligne "Fait à Angoulins, le 01/07/2024" n'est pas
// reprise (date de signature obsolète, pas de nouvelle date à inventer).
type DocBlock =
  | { type: "checklist"; icon: LucideIcon; title: string; items: string[] }
  | { type: "prose"; paragraphs: string[] }
  | { type: "callout"; tone: "amber" | "red" | "navy"; icon: LucideIcon; title?: string; text: string };

export type ClubDocumentId = "charte-joueur" | "charte-parent" | "reglement-interieur";

type ClubDocument = {
  id: ClubDocumentId;
  title: string;
  icon: LucideIcon;
  blocks: DocBlock[];
};

const charteJoueur: ClubDocument = {
  id: "charte-joueur",
  title: "Charte du Joueur",
  icon: ScrollText,
  blocks: [
    {
      type: "checklist",
      icon: Clock,
      title: "1. Engagement et assiduité",
      items: [
        "Je m'engage à participer régulièrement aux entraînements et aux matchs.",
        "Je préviens mon entraîneur en cas d'absence ou de retard.",
        "Je respecte les horaires fixés par le club.",
      ],
    },
    {
      type: "checklist",
      icon: Handshake,
      title: "2. Respect et fair-play",
      items: [
        "Je respecte mes coéquipiers, mes entraîneurs, les arbitres et les adversaires.",
        "J'accepte les décisions de l'arbitre sans contestation.",
        "Je fais preuve de fair-play, sur et en dehors du terrain.",
      ],
    },
    {
      type: "checklist",
      icon: Flame,
      title: "3. Attitude et comportement",
      items: [
        "Je donne le meilleur de moi-même, quels que soient les résultats.",
        "Je fais preuve d'un bon état d'esprit : motivation, solidarité, humilité.",
        "Je représente dignement mon club à chaque événement.",
      ],
    },
    {
      type: "checklist",
      icon: Shirt,
      title: "4. Matériel et tenues",
      items: [
        "Je prends soin du matériel mis à disposition par le club.",
        "Je viens aux entraînements et aux matchs avec une tenue adaptée.",
        "Je porte les couleurs du club avec fierté lors des compétitions.",
      ],
    },
    {
      type: "checklist",
      icon: HeartPulse,
      title: "5. Hygiène de vie",
      items: [
        "J'adopte une hygiène de vie compatible avec la pratique du sport (sommeil, alimentation, hydratation).",
        "Je ne consomme pas de substances interdites ou dangereuses.",
      ],
    },
    {
      type: "checklist",
      icon: Users,
      title: "6. Vie de club",
      items: [
        "Je participe aux événements et à la vie associative du club selon le planning établi.",
        "Je ramène, pour les matchs à domicile, le goûter d'après match.",
        "Je demande à mes parents d'accompagner aux déplacements extérieurs.",
        "Je demande à mes parents de laver les maillots de mon équipe.",
        "Je participe aux formations e-marque/chrono et arbitrage interne (1 à 2 fois dans la saison).",
        "Je fais la table de marque (e-marque ou chrono) d'une autre équipe.",
        "J'arbitre au moins 1 match accompagné d'un arbitre aguerri.",
        "Je contribue à la bonne ambiance et à l'esprit d'équipe.",
      ],
    },
    {
      type: "callout",
      tone: "amber",
      icon: AlertTriangle,
      text: "Le non-respect de ces engagements entraînera une suspension d'un match.",
    },
  ],
};

const charteParent: ClubDocument = {
  id: "charte-parent",
  title: "Charte du Parent",
  icon: UserCheck,
  blocks: [
    {
      type: "checklist",
      icon: Users,
      title: "1. Soutien et accompagnement",
      items: [
        "Je soutiens mon enfant dans sa pratique du basket sans pression de performance.",
        "J'encourage l'effort, la persévérance et l'esprit d'équipe avant le résultat.",
        "Je l'aide à respecter ses engagements (présence aux entraînements, ponctualité, matériel…).",
      ],
    },
    {
      type: "checklist",
      icon: ShieldCheck,
      title: "2. Respect du cadre sportif",
      items: [
        "Je respecte les décisions des entraîneurs, arbitres et dirigeants du club.",
        "Je n'interviens pas pendant les matchs ou les entraînements.",
        "Je garde une attitude positive, même en cas de désaccord ou de frustration.",
      ],
    },
    {
      type: "checklist",
      icon: Handshake,
      title: "3. Fair-play et respect",
      items: [
        "Je respecte tous les acteurs du jeu : joueurs, arbitres, entraîneurs, bénévoles et parents.",
        "Je bannis tout comportement agressif, discriminant ou irrespectueux.",
        "Je montre l'exemple par mon comportement dans les tribunes ou lors des déplacements.",
      ],
    },
    {
      type: "checklist",
      icon: Shield,
      title: "4. Implication dans la vie du club",
      items: [
        "Je participe, dans la mesure de mes possibilités, aux événements et activités du club selon le planning établi.",
        "Je ramène, pour les matchs à domicile, le goûter d'après match.",
        "J'accompagne aux déplacements extérieurs.",
        "Je lave le jeu de maillot de l'équipe de mon enfant.",
        "Je tiens la buvette pendant le match de mon enfant.",
        "Je valorise l'esprit associatif et le travail des bénévoles.",
      ],
    },
    {
      type: "checklist",
      icon: MessageCircle,
      title: "5. Communication et confiance",
      items: [
        "En cas de problème, je privilégie le dialogue respectueux avec les entraîneurs ou les responsables du club.",
        "Je fais confiance à l'équipe encadrante dans ses choix pédagogiques et sportifs.",
      ],
    },
    {
      type: "callout",
      tone: "navy",
      icon: Info,
      title: "Licence bénévole (gratuite, offerte par le club)",
      text: "Sur le dossier d'inscription, une case permet de se proposer pour une aide ponctuelle : délégué·e de salle ou fair-play, e-marque/chrono (formation assurée par un bénévole), arbitrage d'un match de jeunes, ou aide lors des manifestations du club. Pour se porter volontaire, contactez le Bureau.",
    },
    {
      type: "callout",
      tone: "amber",
      icon: AlertTriangle,
      text: "Le non-respect entraînera un match de suspension.",
    },
  ],
};

const reglementInterieur: ClubDocument = {
  id: "reglement-interieur",
  title: "Règlement Intérieur",
  icon: BookOpen,
  blocks: [
    {
      type: "prose",
      paragraphs: [
        "L'Union Basket Angoulins Châtelaillon Saint-Vivien est affiliée à la FFBB, association loi de 1901. Ce règlement s'applique à tous les membres de l'UBAC, ainsi qu'aux représentants légaux des membres mineurs — il définit les droits et devoirs de chacun pour que la pratique du basket se déroule dans les meilleures conditions.",
        "L'adhésion au club engage le licencié à respecter ce règlement et à participer activement à la vie du club.",
      ],
    },
    {
      type: "checklist",
      icon: Target,
      title: "Nos objectifs",
      items: [
        "Former l'ensemble des adhérents aux règles du basket-ball.",
        "Développer les compétences individuelles et collectives selon le projet de formation défini pour chaque catégorie.",
        "Développer l'esprit d'équipe.",
      ],
    },
    {
      type: "checklist",
      icon: ScrollText,
      title: "Inscription et licence",
      items: [
        "Être licencié·e au club (ou titulaire d'un diplôme d'État pour encadrer une équipe).",
        "S'acquitter de sa cotisation — gratuite pour les entraîneurs, arbitres et Officiels de Table de Marque (OTM) ; aucun dépôt de licence sans règlement intégral.",
        "Accepter ce règlement sur le formulaire d'inscription en ligne : aucune licence n'est validée sans dossier complet.",
        "Déjà licencié·e dans un autre club et souhaitant s'entraîner à l'UBAC : en faire la demande par mail à ubac17.basket@gmail.com.",
      ],
    },
    {
      type: "checklist",
      icon: ShieldCheck,
      title: "Licenciés mineurs",
      items: [
        "Les parents s'assurent des horaires d'entraînements et de matchs en contact régulier avec l'entraîneur.",
        "L'enfant est sous la responsabilité du club une fois confié en personne à l'entraîneur — jamais simplement déposé sur le parking.",
        "La responsabilité du club s'arrête à la sortie des vestiaires (après la douche) : les parents viennent chercher leur enfant dans le gymnase.",
        "En déplacement, la responsabilité du club dure de la prise en charge par l'entraîneur/manager jusqu'au retour au point de rendez-vous convenu.",
        "Montres, gourmettes et autres bijoux sont interdits pendant la pratique — le club décline toute responsabilité en cas de perte ou de vol.",
      ],
    },
    {
      type: "checklist",
      icon: Users,
      title: "Pour tous les licenciés",
      items: [
        "Apporter sa propre bouteille d'eau et laisser vestiaires et abords du terrain propres après chaque séance.",
        "Ranger le matériel utilisé (ballons, cônes…) après chaque séance.",
        "Répondre aux invitations à arbitrer, tenir une table de marque ou être responsable de salle — trouver un remplaçant en cas d'indisponibilité et prévenir les responsables.",
        "Respecter le code de la route lors des déplacements en covoiturage.",
        "Participer activement à la vie du club : l'UBAC n'est pas un centre de loisirs, chaque parent s'engage à participer aux déplacements extérieurs.",
      ],
    },
    {
      type: "callout",
      tone: "red",
      icon: Euro,
      title: "Amendes",
      text: "Une faute technique ou disqualifiante (joueur, entraîneur) ou une absence non excusée (arbitre officiel) entraîne une amende : 30 € à la 1ʳᵉ faute, 100 € à la 2ᵉ.",
    },
    {
      type: "callout",
      tone: "navy",
      icon: Info,
      text: "Le président, après consultation du bureau, se réserve le droit d'exclure du club toute personne licenciée qui ne respecterait pas ce règlement ou le règlement sportif.",
    },
    {
      type: "prose",
      paragraphs: [
        "Les membres de l'UBAC sont des bénévoles qui consacrent beaucoup de leur temps à vos enfants — merci de respecter les horaires de début et de fin des entraînements et des matchs (même si la route ou les prolongations peuvent parfois nous mettre en retard).",
        "Le club offre les formations d'arbitre, de coach ou d'OTM à tout licencié désireux de s'investir davantage. Toute personne souhaitant participer, organiser ou proposer des manifestations est la bienvenue.",
      ],
    },
  ],
};

const documentsById: Record<ClubDocumentId, ClubDocument> = {
  "charte-joueur": charteJoueur,
  "charte-parent": charteParent,
  "reglement-interieur": reglementInterieur,
};

const calloutStyles: Record<"amber" | "red" | "navy", string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-700",
  navy: "border-ubac-blue/15 bg-ubac-blue/5 text-navy",
};

function DocumentBlock({ block }: { block: DocBlock }) {
  if (block.type === "checklist") {
    const Icon = block.icon;
    return (
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          <Icon className="h-4 w-4 shrink-0 text-ubac-blue" />
          {block.title}
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 pl-1">
          {block.items.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-zinc-600">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ubac-yellow-dark" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (block.type === "prose") {
    return (
      <div className="flex flex-col gap-2">
        {block.paragraphs.map((p) => (
          <p key={p} className="text-sm leading-relaxed text-zinc-600">
            {p}
          </p>
        ))}
      </div>
    );
  }

  const Icon = block.icon;
  return (
    <div className={`flex gap-2.5 rounded-xl border p-3 ${calloutStyles[block.tone]}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-sm">
        {block.title && <span className="font-semibold">{block.title} — </span>}
        {block.text}
      </p>
    </div>
  );
}

// Une carte repliable par document — même habillage que les autres
// encarts "Organisation" de l'app (collapsible-card.tsx).
export function DocumentCard({ id }: { id: ClubDocumentId }) {
  const doc = documentsById[id];
  return (
    <CollapsibleCard icon={doc.icon} title={doc.title} badge="Saison 2026-2027">
      {doc.blocks.map((block, i) => (
        <DocumentBlock key={i} block={block} />
      ))}
    </CollapsibleCard>
  );
}

// Retour de Cindy du 08/10 ("trombinoscope officiels... concerne les
// parents, les coachs et le bureau") : même emplacement que les chartes
// (onglet "Documents", seul endroit commun à Bureau/Coach/Famille), mais
// contenu différent -- un vrai PDF déposé par le Bureau, pas du texte
// retranscrit. Bucket dédié "club-documents" (voir sa migration) : un
// seul fichier pour tout le club, jamais par équipe (un e-marque ou un
// chronométreur n'appartient à aucune équipe en particulier).
// canManage=true seulement côté Bureau (admin-view.tsx) -- Coach/Famille
// n'ont que le bouton de consultation, jamais l'envoi.
function OfficialsTrombinoscopeCard({
  path,
  canManage,
}: {
  path: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [trombinoscopePath, setTrombinoscopePath] = useState(path);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rien à afficher pour Coach/Famille tant que le Bureau n'a encore rien
  // envoyé -- pas de carte vide à montrer sans aucune action possible.
  if (!canManage && !trombinoscopePath) return null;

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Choisis un fichier PDF.");
      return;
    }
    if (file.size > 26214400) {
      setError(`Fichier trop lourd (${(file.size / 1024 / 1024).toFixed(1)} Mo, 25 Mo maximum).`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const path = "officiels/trombinoscope.pdf";
      const { error: uploadErr } = await supabase.storage
        .from("club-documents")
        .upload(path, file, { upsert: true, contentType: "application/pdf" });
      if (uploadErr) {
        setError(`Envoi impossible : ${uploadErr.message}`);
        return;
      }
      const { error: updateErr } = await supabase
        .from("club_settings")
        .update({ officials_trombinoscope_path: path })
        .eq("id", true);
      if (updateErr) {
        setError(`Enregistrement impossible : ${updateErr.message}`);
        return;
      }
      setTrombinoscopePath(path);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <CollapsibleCard icon={IdCard} title="Trombinoscope officiels" badge="Saison 2026-2027">
      <p className="text-sm text-zinc-600">
        Photos et noms des officiels de table de marque (e-marque, chronométreur, marqueur...) et
        délégués du club, à consulter avant un match officiel à domicile.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {canManage && (
          <label
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              trombinoscopePath
                ? "bg-sky-100 text-sky-700 hover:bg-sky-200"
                : "bg-navy text-white hover:bg-navy-dark"
            } ${uploading ? "cursor-wait opacity-60" : "cursor-pointer"}`}
          >
            <Upload className="h-3.5 w-3.5 shrink-0" />
            {uploading
              ? "Envoi…"
              : trombinoscopePath
                ? "Remplacer le trombinoscope"
                : "Envoyer le trombinoscope"}
            <input
              type="file"
              accept="application/pdf"
              onChange={onChange}
              disabled={uploading}
              className="hidden"
            />
          </label>
        )}
        <TrombinoscopeButton path={trombinoscopePath} bucket="club-documents" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </CollapsibleCard>
  );
}

// Répartition par espace (retour de Cindy du 25/08) :
// - Bureau et Coach : Règlement Intérieur uniquement.
// - Famille (parents) : Charte du Joueur + Charte du Parent + Règlement
//   Intérieur — ce sont eux qui portent la responsabilité légale pour un
//   enfant mineur.
// - Enfant : Charte du Joueur + Règlement Intérieur — pas la Charte du
//   Parent, qui ne le concerne pas directement.
export default function DocumentsPanel({
  documentIds,
  officialsTrombinoscopePath,
  canManageOfficialsTrombinoscope = false,
}: {
  documentIds: ClubDocumentId[];
  // Retour de Cindy du 08/10 : absent (undefined) pour les espaces qui ne
  // concernent pas le trombinoscope officiels (Enfant, bénévole) -- la
  // carte ne s'affiche alors jamais, aucun changement pour ces espaces.
  officialsTrombinoscopePath?: string | null;
  canManageOfficialsTrombinoscope?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500">
        Documents officiels du club, saison 2026-2027 — mêmes engagements que sur le dossier
        d&apos;inscription papier.
      </p>
      {documentIds.map((id) => (
        <DocumentCard key={id} id={id} />
      ))}
      {officialsTrombinoscopePath !== undefined && (
        <OfficialsTrombinoscopeCard
          path={officialsTrombinoscopePath}
          canManage={canManageOfficialsTrombinoscope}
        />
      )}
    </div>
  );
}
