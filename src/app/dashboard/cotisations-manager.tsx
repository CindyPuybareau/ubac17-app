"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Gavel,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Tag,
  Target,
  Ticket,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useScrollTopOnChange } from "@/lib/use-scroll-top-on-change";
import { formatPersonName } from "@/lib/names";
import AnimatedNumber from "./animated-number";
import CategoryTariffsEditor from "./category-tariffs-editor";
import ConfirmDialog from "./confirm-dialog";
import CotisationParticipantsTable, {
  computeStatus,
  formatAmount,
  roundCents,
} from "./cotisation-participants-table";
import type { StatusKey } from "./cotisation-shared";
import { getCurrentSeasonLabel } from "@/lib/season";
import PenalitesManager from "./penalites-manager";
import type {
  AdminCategoryTariff,
  AdminCollecte,
  AdminCotisation,
  AdminMember,
  AdminMemberTeam,
  AdminPenalite,
  CollecteType,
} from "./page";

const collecteTypeLabels: Record<CollecteType, string> = {
  STAGE: "Stage",
  EVENEMENT: "Événement",
  BOUTIQUE: "Boutique",
};

// Retour de Cindy du 20/09 ("la carte peut-elle être plus sexy... tout est
// gris") : une icône + un accent de couleur par type, au lieu d'une carte
// entièrement en niveaux de gris -- même principe que les pastilles de
// type d'événement (event-style.ts) ou les tuiles KPI du tableau de bord
// (space-dashboard-summary.tsx), jamais réinventé, juste appliqué ici.
const collecteTypeStyle: Record<CollecteType, { icon: typeof Ticket; iconClass: string; iconBgClass: string; barClass: string }> = {
  STAGE: { icon: Target, iconClass: "text-navy", iconBgClass: "bg-navy/10", barClass: "bg-navy" },
  EVENEMENT: { icon: Ticket, iconClass: "text-ubac-yellow-dark", iconBgClass: "bg-ubac-yellow/15", barClass: "bg-ubac-yellow" },
  BOUTIQUE: { icon: Wallet, iconClass: "text-court-green", iconBgClass: "bg-court-green/10", barClass: "bg-court-green" },
};

// Matches the club's own Statut Club vocabulary exactly: Payé/Payé (-) →
// PAYE, Offerte dirigeant/coach → OFFERT, En attente paiement → EN_ATTENTE.
function computeKpis(list: AdminCotisation[]) {
  let payeCount = 0;
  let offertCount = 0;
  let partielCount = 0;
  let enAttenteCount = 0;
  let totalDue = 0;
  let totalCollected = 0;

  list.forEach((c) => {
    const status = computeStatus(c);
    if (status === "PAYE") payeCount++;
    else if (status === "OFFERT") offertCount++;
    else if (status === "PARTIEL") partielCount++;
    else enAttenteCount++;
    // Attendu / Collecté are raw totals of Prix à payer / Paiement — not
    // netted against remise, per the club's own accounting convention.
    totalDue = roundCents(totalDue + (c.prix ?? 0));
    totalCollected = roundCents(totalCollected + (c.paiement ?? 0));
  });

  const percentage =
    totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : list.length > 0 ? 100 : 0;

  return {
    total: list.length,
    payeCount,
    offertCount,
    partielCount,
    enAttenteCount,
    totalDue,
    totalCollected,
    percentage,
  };
}

// Retour de Cindy du 20/09 ("les membres... doivent apparaitre dans la
// carte seulement s'ils cliquent présent") : filtre partagé entre le détail
// d'une collecte (collecteCotisations) et le compteur affiché sur sa petite
// carte (visibleCountByCollecteId) -- jamais deux logiques différentes pour
// la même règle. presentPlayerIds vient de rsvpsByEvent (page.tsx) ; un
// paiement réel ou un "Offert" reste toujours visible même hors RSVP
// présent, même garde-fou que le déclencheur
// sync_paid_event_cotisation_on_rsvp (jamais caché, jamais perdu).
function visibleCollecteCotisations(collecte: AdminCollecte | undefined, all: AdminCotisation[]) {
  const list = all.filter((c) => c.collecteId === collecte?.id);
  if (!collecte?.presentPlayerIds) return list;
  const presentIds = new Set(collecte.presentPlayerIds);
  return list.filter(
    (c) => presentIds.has(c.playerId) || (c.paiement ?? 0) > 0 || c.statut === "OFFERT"
  );
}

// One card shape for all seven KPIs — same height, padding and radius, so
// the row reads as a single band instead of tiles of assorted sizes.
function KpiCard({
  icon: Icon,
  iconClass,
  value,
  kind,
  label,
  wide = false,
  onClick,
  active = false,
  activeClassName = "",
}: {
  icon: typeof Wallet;
  iconClass: string;
  // Retour de Cindy du 06/09 ("une sorte de compteur") : value est
  // désormais le NOMBRE brut (plus une chaîne déjà mise en forme), pour
  // qu'AnimatedNumber puisse l'animer de 0 jusqu'à sa vraie valeur. `kind`
  // (une chaîne, pas une fonction) même API que bureau-dashboard.tsx --
  // voir animated-number.tsx : ce fichier-ci est déjà "use client" en
  // entier donc une fonction serait passée sans planter, mais autant
  // garder une seule et même API pour les deux KpiCard.
  value: number;
  kind: "integer" | "amount" | "percent";
  label: string;
  wide?: boolean;
  // Retour de Cindy du 14/09 ("les 4 cartes de statut cliquables, jamais
  // Collecté/Total collecté/Total attendu") : onClick n'est fourni que par
  // les 4 cartes de statut de KpiHeader (usage principal) -- un vrai
  // <button> plutôt qu'un <div> + onClick, pour avoir le clavier
  // (Entrée/Espace) gratuitement et ne jamais rendre tabbable les 3 cartes
  // non filtrables.
  onClick?: () => void;
  active?: boolean;
  activeClassName?: string;
}) {
  const cardBody = (
    <>
      <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
      <p
        className={`font-bold text-slate-900 ${
          // Les montants ("9 624,09 €") sont des chaînes bien plus longues
          // que les pourcentages/entiers ("56 %", "57") -- une taille un
          // cran plus petite leur donne la marge qui manquait sur les
          // largeurs intermédiaires (tablette), sans toucher aux cartes
          // courtes qui n'en ont pas besoin.
          kind === "amount" ? "text-base sm:text-lg md:text-xl" : "text-xl sm:text-2xl"
        }`}
      >
        <AnimatedNumber value={value} kind={kind} />
      </p>
      <p className="text-xs font-medium leading-tight text-slate-500">{label}</p>
    </>
  );

  // min-w-0 : sans ça, une grille CSS ne laisse jamais une carte
  // rétrécir sous la largeur intrinsèque de son contenu (min-width:auto
  // par défaut sur un élément de grille) -- un montant en euros au
  // format français ("17 298,96 €") est un seul bloc insécable (espace
  // fine insécable avant "€" et entre les milliers), impossible à
  // couper : sans min-w-0, la carte débordait littéralement sur sa
  // voisine plutôt que de laisser le texte se réduire dans son cadre
  // (signalé par Cindy le 07/09, sur tablette). overflow-hidden en
  // filet de sécurité si jamais un montant futur reste malgré tout trop
  // long pour sa carte.
  const baseClass = `flex h-full min-w-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border p-4 text-center shadow-sm transition-colors ${
    wide ? "col-span-2" : ""
  }`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`${baseClass} cursor-pointer ${
          active ? activeClassName : "border-slate-200 bg-white hover:bg-slate-50"
        }`}
      >
        {cardBody}
      </button>
    );
  }

  return <div className={`${baseClass} border-slate-200 bg-white`}>{cardBody}</div>;
}

function KpiHeader({
  cotisations,
  statusFilter,
  onStatusFilterChange,
}: {
  cotisations: AdminCotisation[];
  // Retour de Cindy du 14/09 ("les cartes KPI cliquables appliquent le
  // même filtre que le select existant") : optionnels -- le 2e usage de
  // KpiHeader (détail d'une collecte, plus bas dans ce fichier) n'a pas de
  // filtre partagé avec un tableau et garde ses cartes non cliquables,
  // exactement comme avant.
  statusFilter?: StatusKey | "ALL";
  onStatusFilterChange?: (value: StatusKey | "ALL") => void;
}) {
  const kpis = useMemo(() => computeKpis(cotisations), [cotisations]);

  // Un clic sur la carte déjà active revient à "Tous les statuts" --
  // même bascule que si on recliquait la même option dans le <select>.
  const toggleFilter = (key: StatusKey) => {
    onStatusFilterChange?.(statusFilter === key ? "ALL" : key);
  };

  // 7 cartes sur 2 / 3 / 4 colonnes maximum (retour de Cindy du 07/09,
  // "sur tablette ça ne fonctionne pas, les chiffres débordent") : la
  // grille montait jusqu'à 7 colonnes égales dès 1024px (lg), pile dans la
  // plage des tablettes en paysage -- bien trop étroit pour un montant en
  // euros. Plafonnée à 4 colonnes à partir de md, quelle que soit la
  // largeur d'écran au-delà : "Total attendu" reste sur 2 colonnes à
  // toutes les tailles (col-span-2 sans variante lg qui l'annulait), ce
  // qui referme exactement la rangée à 4+4 sans case vide (4 cartes
  // simples + 1 carte simple + 1 carte double = 4 puis 4).
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      <KpiCard
        icon={TrendingUp}
        iconClass="text-navy"
        value={kpis.percentage}
        kind="percent"
        label="Collecté"
      />
      <KpiCard
        icon={CheckCircle2}
        iconClass="text-court-green"
        value={kpis.payeCount}
        kind="integer"
        label="Payés"
        onClick={onStatusFilterChange ? () => toggleFilter("PAYE") : undefined}
        active={statusFilter === "PAYE"}
        activeClassName="border-court-green bg-court-green/10"
      />
      <KpiCard
        icon={Clock}
        iconClass="text-parquet-dark"
        value={kpis.partielCount}
        kind="integer"
        label="Partiels"
        onClick={onStatusFilterChange ? () => toggleFilter("PARTIEL") : undefined}
        active={statusFilter === "PARTIEL"}
        activeClassName="border-parquet-dark bg-parquet/15"
      />
      <KpiCard
        icon={ShieldCheck}
        iconClass="text-navy"
        value={kpis.offertCount}
        kind="integer"
        label="Offerts"
        onClick={onStatusFilterChange ? () => toggleFilter("OFFERT") : undefined}
        active={statusFilter === "OFFERT"}
        activeClassName="border-navy bg-navy/10"
      />
      <KpiCard
        icon={AlertTriangle}
        iconClass="text-coral-dark"
        value={kpis.enAttenteCount}
        kind="integer"
        label="En attente"
        onClick={onStatusFilterChange ? () => toggleFilter("EN_ATTENTE") : undefined}
        active={statusFilter === "EN_ATTENTE"}
        activeClassName="border-coral-dark bg-coral/15"
      />
      <KpiCard
        icon={Wallet}
        iconClass="text-amber-700"
        value={kpis.totalCollected}
        kind="amount"
        label="Total collecté"
      />
      <KpiCard
        icon={Target}
        iconClass="text-indigo-600"
        value={kpis.totalDue}
        kind="amount"
        label="Total attendu"
        wide
      />
    </div>
  );
}

type CotisationsTab = "cotisations" | "collectes" | "penalites";

export default function CotisationsManager({
  cotisations,
  collectes,
  members,
  categoryTariffs,
  canonicalTeamRefs,
  penalites,
  forcedTab,
}: {
  cotisations: AdminCotisation[];
  collectes: AdminCollecte[];
  members: AdminMember[];
  categoryTariffs: AdminCategoryTariff[];
  canonicalTeamRefs: AdminMemberTeam[];
  penalites: AdminPenalite[];
  // Retour de Cindy du 2026-08-22 : "Cotisations" éclatée en 3 entrées du
  // menu latéral ("Cotisations et licences" / "Événements payants" /
  // "Pénalités") plutôt que des onglets en haut de page — même
  // convention que forcedTab sur CoachOrganisation / forcedView sur
  // CalendarView.
  forcedTab?: CotisationsTab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<CotisationsTab>(forcedTab ?? "cotisations");
  const shownTab = forcedTab ?? tab;
  // Désactivé quand forcedTab est fourni : le montage vient alors d'un
  // clic dans le menu (sous-onglet dédié), qui ne scrolle déjà plus (voir
  // use-scroll-top-on-change.ts) — sans ce garde-fou, le montage du
  // composant relancerait quand même le saut de scroll à chaque clic.
  useScrollTopOnChange(tab, undefined, !forcedTab);
  const [selectedCollecteId, setSelectedCollecteId] = useState<string | null>(
    collectes[0]?.id ?? null
  );
  // Retour de Cindy du 14/09 ("les cartes KPI cliquables réutilisent le
  // filtre existant") : remonté ici depuis CotisationParticipantsTable
  // (qui le gardait en interne) pour que KpiHeader (son frère, pas son
  // parent) et le <select> "Tous les statuts" du tableau partagent le
  // même état -- uniquement pour l'onglet principal "Cotisations et
  // licences" ; le détail d'une collecte (plus bas) garde son propre
  // filtre interne, non concerné par cette demande.
  const [mainStatusFilter, setMainStatusFilter] = useState<StatusKey | "ALL">("ALL");
  const [creatingCollecte, setCreatingCollecte] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CollecteType>("STAGE");
  const [newPrix, setNewPrix] = useState("");
  const [creatingSaving, setCreatingSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addingParticipants, setAddingParticipants] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const [selectedNewIds, setSelectedNewIds] = useState<Set<string>>(new Set());
  const [addingSaving, setAddingSaving] = useState(false);

  // Retour de Cindy du 2026-08-25 : le lien HelloAsso peut être ajouté ou
  // corrigé après coup ici, sans repasser par l'événement — utile pour un
  // événement payant créé sans lien renseigné, ou un lien mal collé.
  const [editingLink, setEditingLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [savingLink, setSavingLink] = useState(false);

  // Retour de Cindy du 29/08 ("je ne comprend pas comment supprimer
  // l'évenement") : aucune collecte ne pouvait être supprimée depuis
  // l'appli, quel que soit son état — un test oublié restait donc pour
  // toujours. deleteTarget porte la collecte visée (state à part plutôt
  // que confondu avec selectedCollecte : on peut vouloir supprimer une
  // collecte différente de celle actuellement affichée dans le détail,
  // directement depuis sa carte).
  const [deleteTarget, setDeleteTarget] = useState<AdminCollecte | null>(null);
  const [deletingCollecte, setDeletingCollecte] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const contactEmailByPlayerId = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => {
      if (m.email) map[m.id] = m.email;
    });
    return map;
  }, [members]);

  // Retour de Cindy du 16/09 ("je supprime un membre, je le vois encore
  // dans Cotisations") : "Supprimer" un membre l'archive (voir "Archiver
  // ce membre" dans sa fiche) -- ses données, y compris sa cotisation,
  // persistent volontairement (règle #1 du projet), mais rien ne les
  // masquait ici. Uniquement les cotisations de SAISON (celles d'un
  // "Événement payant", avec collecteId, restent visibles quel que soit le
  // statut actuel du membre -- un historique de qui a payé un tournoi
  // passé reste pertinent même après un départ).
  const archivedPlayerIds = useMemo(
    () => new Set(members.filter((m) => m.archivedAt).map((m) => m.id)),
    [members]
  );
  const seasonCotisations = useMemo(
    () => cotisations.filter((c) => !c.collecteId && !archivedPlayerIds.has(c.playerId)),
    [cotisations, archivedPlayerIds]
  );

  // Retour de Cindy du 14/09 (Cyril Charpenteau, coach sans équipe joueur,
  // sans aucune ligne Cotisations) : il n'existe ni trigger automatique ni
  // import qui couvre systématiquement ce cas -- un coach sans catégorie
  // joueur n'obtient sa ligne (souvent 0€/Offert) que si le Bureau la crée
  // à la main. Ce bandeau détecte silencieusement les futurs oublis
  // plutôt que de les découvrir des mois plus tard : tout membre actif
  // sans aucune ligne pour la saison en cours (hors "Événements payants",
  // qui n'ont jamais vocation à couvrir tout le monde).
  const currentSeasonLabel = useMemo(() => getCurrentSeasonLabel(), []);
  const membersMissingCotisation = useMemo(() => {
    const covered = new Set(
      seasonCotisations
        .filter((c) => c.saison === currentSeasonLabel)
        .map((c) => c.playerId)
    );
    return members.filter((m) => !m.archivedAt && !covered.has(m.id));
  }, [members, seasonCotisations, currentSeasonLabel]);

  const selectedCollecte = collectes.find((c) => c.id === selectedCollecteId) ?? null;
  // Retour de Cindy du 20/09 ("les membres... doivent apparaitre dans la
  // carte seulement s'ils cliquent présent") : la liste affichée suit en
  // direct le RSVP de l'événement lié -- présentPlayerIds vient de
  // rsvpsByEvent (page.tsx), jamais figé, aucune ligne supprimée en base.
  const collecteCotisations = useMemo(
    () => visibleCollecteCotisations(selectedCollecte ?? undefined, cotisations),
    [cotisations, selectedCollecte]
  );

  // Un mini-résumé (collecté/attendu) par carte, pour qu'on voie d'un coup
  // d'œil laquelle mérite d'être ouverte — plutôt qu'une simple pastille de
  // nom sans autre information (retour de Cindy du 29/08, "on ne s'y
  // retrouve pas").
  const kpisByCollecteId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeKpis>>();
    collectes.forEach((c) => {
      map.set(c.id, computeKpis(cotisations.filter((co) => co.collecteId === c.id)));
    });
    return map;
  }, [collectes, cotisations]);

  // Retour de Cindy du 20/09 ("aucun participant doit etre relié dans la
  // carte") : même compteur que collecteCotisations (visibleCollecteCotisations
  // ci-dessus), affiché sur chaque petite carte pour rester cohérent avec ce
  // qu'on voit une fois la collecte ouverte -- jamais le nombre brut de
  // lignes cotisations (qui inclurait les anciens participants en attente
  // ajoutés en masse avant l'inscription libre).
  const visibleCountByCollecteId = useMemo(() => {
    const map = new Map<string, number>();
    collectes.forEach((c) => {
      map.set(c.id, visibleCollecteCotisations(c, cotisations).length);
    });
    return map;
  }, [collectes, cotisations]);

  // Retour de Cindy du 20/09 ("total collecté doit etre en haut de page...
  // ce sera le total collecter de tous les evenement payant") : somme du
  // "Total collecté" de chaque collecte (kpisByCollecteId ci-dessus, déjà
  // basé sur TOUS les paiements réels, jamais filtré par présence RSVP) --
  // visible en tête de l'onglet, avant même d'ouvrir une collecte.
  const totalCollectedAllCollectes = useMemo(
    () =>
      Array.from(kpisByCollecteId.values()).reduce((sum, k) => sum + k.totalCollected, 0),
    [kpisByCollecteId]
  );

  const availableMembers = useMemo(() => {
    const existingIds = new Set(collecteCotisations.map((c) => c.playerId));
    const q = participantSearch.trim().toLowerCase();
    return members.filter((m) => {
      if (m.archivedAt || existingIds.has(m.id)) return false;
      if (!q) return true;
      return `${m.firstName ?? ""} ${m.lastName ?? ""}`.toLowerCase().includes(q);
    });
  }, [members, collecteCotisations, participantSearch]);

  async function createCollecte() {
    if (!newName.trim()) return;
    setCreatingSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("collectes")
      .insert({
        name: newName.trim(),
        type: newType,
        prix: newPrix ? Number(newPrix) : null,
      })
      .select("id")
      .single();

    setCreatingSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCreatingCollecte(false);
    setNewName("");
    setNewPrix("");
    setSelectedCollecteId(data?.id ?? null);
    router.refresh();
  }

  function toggleNewParticipant(id: string) {
    setSelectedNewIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addParticipants() {
    if (!selectedCollecte || selectedNewIds.size === 0) return;
    setAddingSaving(true);
    setError(null);
    const supabase = createClient();
    const rows = Array.from(selectedNewIds).map((playerId) => ({
      player_id: playerId,
      collecte_id: selectedCollecte.id,
      saison: selectedCollecte.name,
      prix: selectedCollecte.prix,
      remise: 0,
      paiement: 0,
      statut: null,
    }));
    const { error: insertError } = await supabase.from("cotisations").insert(rows);
    setAddingSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setAddingParticipants(false);
    setSelectedNewIds(new Set());
    router.refresh();
  }

  async function saveLink() {
    if (!selectedCollecte) return;
    setSavingLink(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("collectes")
      .update({ payment_link: linkDraft.trim() || null })
      .eq("id", selectedCollecte.id);
    setSavingLink(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditingLink(false);
    router.refresh();
  }

  async function deleteCollecte() {
    if (!deleteTarget) return;
    setDeletingCollecte(true);
    setDeleteError(null);
    const supabase = createClient();
    // cotisations.collecte_id est en "on delete cascade" (migration
    // 20260802000000) : ses participants et paiements enregistrés
    // disparaissent avec elle, pas besoin d'un second appel.
    const { error: deleteErr, data: deleteData } = await supabase
      .from("collectes")
      .delete()
      .eq("id", deleteTarget.id)
      .select("id");
    setDeletingCollecte(false);
    if (deleteErr) {
      setDeleteError(deleteErr.message);
      return;
    }
    // Audit du 31/08 : RLS peut bloquer silencieusement (0 ligne, pas
    // d'erreur) — sans ce contrôle, la collecte et tous ses paiements
    // réels semblaient supprimés côté écran alors qu'ils persistent en
    // base.
    if ((deleteData?.length ?? 0) === 0) {
      setDeleteError(
        "Suppression bloquée par les droits d'accès (RLS). Réessaie."
      );
      return;
    }
    if (selectedCollecteId === deleteTarget.id) {
      setSelectedCollecteId(collectes.find((c) => c.id !== deleteTarget.id)?.id ?? null);
    }
    setDeleteTarget(null);
    router.refresh();
  }

  const tabButtonClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
      // Inactive keeps the club navy (icon + label) instead of grey: on a
      // white background the grey read as a disabled control rather than
      // a second tab one can switch to.
      active ? "bg-navy text-white" : "text-navy hover:bg-blue-50"
    }`;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="shrink-0 rounded-full p-1 text-red-400 hover:bg-red-100 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {!forcedTab && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTab("cotisations")} className={tabButtonClass(tab === "cotisations")}>
            <Tag className="h-3.5 w-3.5" />
            Cotisations &amp; Licences
          </button>
          <button onClick={() => setTab("collectes")} className={tabButtonClass(tab === "collectes")}>
            <Ticket className="h-3.5 w-3.5" />
            Événements payants
          </button>
          <button onClick={() => setTab("penalites")} className={tabButtonClass(tab === "penalites")}>
            <Gavel className="h-3.5 w-3.5" />
            Pénalités
          </button>
        </div>
      )}

      {shownTab === "penalites" && <PenalitesManager penalites={penalites} members={members} />}

      {shownTab === "cotisations" && (
        <div className="flex flex-col gap-4">
          {/* L'interrupteur des relances automatiques vit désormais dans
              l'onglet Accueil, avec les autres envois automatiques du
              club — un seul panneau de contrôle plutôt qu'un par onglet. */}
          <CategoryTariffsEditor categories={canonicalTeamRefs} tariffs={categoryTariffs} />
          {membersMissingCotisation.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <span className="font-semibold">
                  {membersMissingCotisation.length} membre
                  {membersMissingCotisation.length > 1 ? "s" : ""} actif
                  {membersMissingCotisation.length > 1 ? "s" : ""} sans ligne de cotisation
                  {membersMissingCotisation.length > 1 ? "s" : ""} pour la saison {currentSeasonLabel}
                </span>{" "}
                (souvent un coach sans équipe joueur, à ajouter manuellement) :{" "}
                {membersMissingCotisation
                  .map((m) => `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim())
                  .join(", ")}
                .
              </p>
            </div>
          )}
          <KpiHeader
            cotisations={seasonCotisations}
            statusFilter={mainStatusFilter}
            onStatusFilterChange={setMainStatusFilter}
          />
          <CotisationParticipantsTable
            cotisations={seasonCotisations}
            contactEmailByPlayerId={contactEmailByPlayerId}
            emptyLabel="Aucune cotisation pour la saison en cours."
            statusFilter={mainStatusFilter}
            onStatusFilterChange={setMainStatusFilter}
          />
        </div>
      )}

      {shownTab === "collectes" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:max-w-xs">
            <KpiCard
              icon={Wallet}
              iconClass="text-amber-700"
              value={totalCollectedAllCollectes}
              kind="amount"
              label="Total collecté"
            />
          </div>
          {/* Retour de Cindy du 29/08 ("un truc ne va pas niveau visibilité
              et clarté") : de simples pastilles de nom ne montraient ni le
              lien vers l'événement du calendrier, ni un moyen de supprimer
              la collecte — remplacées par de vraies cartes : montant
              collecté/attendu en un coup d'œil, date de l'événement rattaché
              ou repère "Événement supprimé" pour une collecte orpheline
              (event_id passé à null par la suppression de l'événement,
              volontairement conservée pour ne jamais perdre un historique de
              paiements réels — voir deleteCollecte plus haut), et une
              corbeille directe. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {collectes.map((c) => {
              const kpis = kpisByCollecteId.get(c.id);
              const isOrphaned = c.type === "EVENEMENT" && !c.eventId;
              const typeStyle = collecteTypeStyle[c.type];
              const TypeIcon = typeStyle.icon;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCollecteId(c.id)}
                  className={`flex cursor-pointer flex-col gap-2.5 rounded-2xl border border-l-4 p-4 text-left shadow-sm transition-colors ${
                    selectedCollecteId === c.id
                      ? "border-navy border-l-navy bg-blue-50/40"
                      : `border-zinc-200 bg-white hover:bg-zinc-50 ${
                          c.type === "STAGE"
                            ? "border-l-navy"
                            : c.type === "BOUTIQUE"
                              ? "border-l-court-green"
                              : "border-l-ubac-yellow"
                        }`
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${typeStyle.iconBgClass}`}
                      >
                        <TypeIcon className={`h-4 w-4 ${typeStyle.iconClass}`} />
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-semibold text-zinc-900">{c.name}</span>
                        <span className={`text-xs font-medium ${typeStyle.iconClass}`}>
                          {collecteTypeLabels[c.type]}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(c);
                      }}
                      title="Supprimer cette collecte"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {/* Retour de Cindy du 29/08 ("j'aimerai voir la date de
                      l'evenement payant, quand a til lieu ?") : eventDate
                      est un instantané pris à la création de la collecte,
                      jamais effacé même une fois l'événement supprimé —
                      contrairement à eventStartTime (jointure en direct,
                      redevient null dans ce cas). Les deux peuvent donc
                      s'afficher ensemble : la date d'origine ET le repère
                      "Événement supprimé". */}
                  {(c.eventStartTime || c.eventDate) && (
                    <span className="flex items-center gap-1 text-xs text-zinc-500">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-navy" />
                      {new Date(c.eventStartTime ?? c.eventDate ?? "").toLocaleDateString(
                        "fr-FR",
                        { day: "numeric", month: "short", year: "numeric" }
                      )}
                    </span>
                  )}
                  {isOrphaned && (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Événement supprimé
                    </span>
                  )}
                  {/* Retour de Cindy du 20/09 ("aucun participants doit etre
                      relié dans la carte") : même compteur que la liste du
                      détail (visibleCollecteCotisations), présent uniquement
                      si un événement est lié -- une collecte Stage/Boutique
                      sans RSVP possible n'a pas ce filtre, donc pas ce
                      compteur (son nombre de lignes est déjà fiable tel quel). */}
                  {c.eventId && (
                    <span className="flex items-center gap-1 text-xs text-zinc-500">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      {visibleCountByCollecteId.get(c.id) ?? 0} participant
                      {(visibleCountByCollecteId.get(c.id) ?? 0) > 1 ? "s" : ""}
                    </span>
                  )}
                  {/* Retour de Cindy du 20/09 ("le lien de paiement hello
                      asso... doit etre visible dans la carte et pas au
                      milieu de la page" puis "supprimer le lien hello asso
                      qui est tout seul dans une carte") : lecture ET
                      édition directement ici, plus de bloc séparé au milieu
                      de la page -- stopPropagation partout pour ne pas
                      interférer avec la sélection de la collecte au clic
                      sur la carte. Auto-rempli à la création de l'événement
                      payant (create-event-form.tsx, champ "Lien HelloAsso")
                      -- l'édition ici ne sert qu'à corriger ou compléter. */}
                  {selectedCollecteId === c.id && editingLink ? (
                    <div
                      className="flex flex-col gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="url"
                        autoFocus
                        placeholder="https://www.helloasso.com/..."
                        value={linkDraft}
                        onChange={(e) => setLinkDraft(e.target.value)}
                        className="min-w-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
                      />
                      <div className="flex shrink-0 gap-3">
                        <button
                          onClick={saveLink}
                          disabled={savingLink}
                          className="rounded-full bg-ubac-yellow px-3 py-1 text-xs font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
                        >
                          {savingLink ? "Enregistrement..." : "Enregistrer"}
                        </button>
                        <button
                          onClick={() => setEditingLink(false)}
                          className="text-xs text-zinc-500 hover:underline"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : c.paymentLink ? (
                    <div className="flex w-fit items-center gap-1">
                      <a
                        href={c.paymentLink}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex w-fit items-center gap-1.5 truncate rounded-full border border-navy/20 bg-navy/5 px-2.5 py-1 text-xs font-medium text-navy hover:bg-navy/10"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        Lien de paiement
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCollecteId(c.id);
                          setLinkDraft(c.paymentLink ?? "");
                          setEditingLink(true);
                        }}
                        title="Modifier le lien"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCollecteId(c.id);
                        setLinkDraft("");
                        setEditingLink(true);
                      }}
                      className="flex w-fit items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Ajouter un lien de paiement
                    </button>
                  )}
                  {kpis && kpis.total > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-bold text-court-green">
                          {formatAmount(kpis.totalCollected)}
                        </span>
                        <span className="text-xs text-zinc-500">
                          sur {formatAmount(kpis.totalDue)} attendu
                        </span>
                      </div>
                      {/* Barre de progression (retour de Cindy du 20/09) :
                          même pourcentage déjà calculé pour le grand
                          KpiHeader (kpis.percentage, computeKpis plus haut)
                          -- juste réutilisé ici en version compacte. */}
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={`h-full rounded-full ${typeStyle.barClass} transition-all`}
                          style={{ width: `${Math.min(100, kpis.percentage)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <button
              onClick={() => setCreatingCollecte((v) => !v)}
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-zinc-300 p-4 text-sm font-semibold text-navy transition-colors hover:bg-blue-50/40"
            >
              <Plus className="h-3.5 w-3.5" />
              Nouvelle collecte
            </button>
          </div>

          {creatingCollecte && (
            <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
              {/* Retour de Cindy du 29/08 : un "Événement" créé ici (nom +
                  type + tarif seulement) n'avait ni date ni lien vers le
                  calendrier, ni participants pré-remplis — indiscernable
                  d'une collecte orpheline dès sa création. "Événement"
                  retiré des choix ci-dessous : un seul chemin désormais,
                  "Créer un événement" + case "Événement payant", qui bascule
                  automatiquement la collecte ici avec toutes ces
                  informations. Stage/Boutique n'ont pas cet équivalent
                  calendrier, ils gardent ce formulaire. */}
              <p className="flex items-start gap-1.5 text-xs text-zinc-500">
                <Ticket className="h-3.5 w-3.5 shrink-0 text-navy" />
                Pour un événement payant (stage, tournoi...), crée-le depuis
                Calendrier ou Événements avec la case &laquo;&nbsp;Événement
                payant&nbsp;&raquo; — sa collecte apparaîtra ici automatiquement,
                déjà reliée et avec ses participants. Ce formulaire sert
                seulement pour un stage externe ou une boutique, sans
                événement au calendrier.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Nom</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Stage Toussaint 2026"
                    className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as CollecteType)}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                  >
                    <option value="STAGE">Stage</option>
                    <option value="BOUTIQUE">Boutique</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Tarif (€)</label>
                  <input
                    type="number"
                    value={newPrix}
                    onChange={(e) => setNewPrix(e.target.value)}
                    className="w-24 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                  />
                </div>
                <button
                  onClick={createCollecte}
                  disabled={creatingSaving || !newName.trim()}
                  className="rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
                >
                  {creatingSaving ? "Création..." : "Créer"}
                </button>
              </div>
            </div>
          )}

          {selectedCollecte ? (
            <div className="flex flex-col gap-4">
              {/* Retour de Cindy du 20/09 ("total collecté est deux fois
                  présent, je ne veux que celui du haut") : le "Total
                  collecté" agrégé en tête de page (totalCollectedAllCollectes
                  plus haut) suffit -- plus de doublon ici au niveau du
                  détail d'une collecte. */}
              {/* Retour de Cindy du 20/09 ("les participants seront ajoutés
                  automatiquement... quand ils tapent présent") : pour une
                  collecte "Événement" avec RSVP actif (presentPlayerIds non
                  null), l'ajout manuel n'a plus lieu d'être -- il reste
                  disponible pour Stage/Boutique (pas de RSVP possible) et
                  pour un événement orphelin ou hors fenêtre RSVP, seuls cas
                  où l'inscription automatique ne peut pas s'appliquer. */}
              {selectedCollecte.presentPlayerIds === null && (
                <div className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <button
                    onClick={() => setAddingParticipants((v) => !v)}
                    className="flex w-fit items-center gap-1.5 rounded-full bg-ubac-yellow px-3 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter des participants
                  </button>
                  {addingParticipants && (
                    <div className="flex flex-col gap-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                        <input
                          value={participantSearch}
                          onChange={(e) => setParticipantSearch(e.target.value)}
                          placeholder="Rechercher un membre..."
                          className="w-full rounded-full border border-zinc-200 bg-white py-1.5 pl-9 pr-3 text-sm focus:border-ubac-yellow focus:outline-none"
                        />
                      </div>
                      <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-lg bg-zinc-50 p-2">
                        {availableMembers.map((m) => (
                          <li key={m.id}>
                            <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white">
                              <input
                                type="checkbox"
                                checked={selectedNewIds.has(m.id)}
                                onChange={() => toggleNewParticipant(m.id)}
                                className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                              />
                              {formatPersonName(m.firstName, m.lastName)}
                              {m.category ? (
                                <span className="text-xs text-zinc-400">· {m.category}</span>
                              ) : null}
                            </label>
                          </li>
                        ))}
                        {availableMembers.length === 0 && (
                          <li className="px-2 py-1.5 text-sm text-zinc-400">
                            Tous les membres sont déjà dans cette collecte.
                          </li>
                        )}
                      </ul>
                      <button
                        onClick={addParticipants}
                        disabled={addingSaving || selectedNewIds.size === 0}
                        className="w-fit rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
                      >
                        {addingSaving
                          ? "Ajout..."
                          : `Ajouter (${selectedNewIds.size})`}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <CotisationParticipantsTable
                cotisations={collecteCotisations}
                contactEmailByPlayerId={contactEmailByPlayerId}
                emptyLabel="Aucun participant pour cette collecte."
              />
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              Crée une collecte (stage, événement ou boutique) pour commencer à
              suivre ses participants et ses paiements.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Supprimer cette collecte ?"
        message={
          deleteTarget && (kpisByCollecteId.get(deleteTarget.id)?.totalCollected ?? 0) > 0 ? (
            <>
              Des paiements sont déjà enregistrés dessus (
              {formatAmount(kpisByCollecteId.get(deleteTarget.id)!.totalCollected)} collectés).
              Supprimer &laquo;&nbsp;{deleteTarget.name}&nbsp;&raquo; effacera aussi ces
              paiements et tous ses participants, définitivement.
            </>
          ) : (
            <>
              Supprimer &laquo;&nbsp;{deleteTarget?.name}&nbsp;&raquo; et tous ses
              participants, définitivement ?
            </>
          )
        }
        confirmLabel="Supprimer"
        pending={deletingCollecte}
        pendingLabel="Suppression..."
        error={deleteError}
        onConfirm={deleteCollecte}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      />
    </div>
  );
}
