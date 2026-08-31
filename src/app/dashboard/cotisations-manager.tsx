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
  Link2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Tag,
  Target,
  Ticket,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useScrollTopOnChange } from "@/lib/use-scroll-top-on-change";
import { formatPersonName } from "@/lib/names";
import CategoryTariffsEditor from "./category-tariffs-editor";
import ConfirmDialog from "./confirm-dialog";
import CotisationParticipantsTable, {
  computeStatus,
  formatAmount,
  roundCents,
} from "./cotisation-participants-table";
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

// One card shape for all seven KPIs — same height, padding and radius, so
// the row reads as a single band instead of tiles of assorted sizes.
function KpiCard({
  icon: Icon,
  iconClass,
  value,
  label,
  wide = false,
}: {
  icon: typeof Wallet;
  iconClass: string;
  value: string;
  label: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm ${
        wide ? "col-span-2 md:col-span-2 lg:col-span-1" : ""
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
      <p className="text-xl font-bold text-slate-900 sm:text-2xl">{value}</p>
      <p className="text-xs font-medium leading-tight text-slate-500">{label}</p>
    </div>
  );
}

function KpiHeader({ cotisations }: { cotisations: AdminCotisation[] }) {
  const kpis = useMemo(() => computeKpis(cotisations), [cotisations]);

  // 7 cards over 2 / 4 / 7 columns. The last one spans two columns below
  // lg so neither breakpoint ends on a half-empty row.
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
      <KpiCard
        icon={TrendingUp}
        iconClass="text-navy"
        value={`${kpis.percentage} %`}
        label="Collecté"
      />
      <KpiCard
        icon={CheckCircle2}
        iconClass="text-court-green"
        value={String(kpis.payeCount)}
        label="Payés"
      />
      <KpiCard
        icon={Clock}
        iconClass="text-parquet-dark"
        value={String(kpis.partielCount)}
        label="Partiels"
      />
      <KpiCard
        icon={ShieldCheck}
        iconClass="text-navy"
        value={String(kpis.offertCount)}
        label="Offerts / Dispensés"
      />
      <KpiCard
        icon={AlertTriangle}
        iconClass="text-coral-dark"
        value={String(kpis.enAttenteCount)}
        label="En attente / Non payés"
      />
      <KpiCard
        icon={Wallet}
        iconClass="text-amber-700"
        value={formatAmount(kpis.totalCollected)}
        label="Total collecté"
      />
      <KpiCard
        icon={Target}
        iconClass="text-indigo-600"
        value={formatAmount(kpis.totalDue)}
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

  const seasonCotisations = useMemo(
    () => cotisations.filter((c) => !c.collecteId),
    [cotisations]
  );

  const selectedCollecte = collectes.find((c) => c.id === selectedCollecteId) ?? null;
  const collecteCotisations = useMemo(
    () => cotisations.filter((c) => c.collecteId === selectedCollecteId),
    [cotisations, selectedCollecteId]
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
          <KpiHeader cotisations={seasonCotisations} />
          <CotisationParticipantsTable
            cotisations={seasonCotisations}
            contactEmailByPlayerId={contactEmailByPlayerId}
            emptyLabel="Aucune cotisation pour la saison en cours."
          />
        </div>
      )}

      {shownTab === "collectes" && (
        <div className="flex flex-col gap-4">
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
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCollecteId(c.id)}
                  className={`flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 text-left shadow-sm transition-colors ${
                    selectedCollecteId === c.id
                      ? "border-navy bg-blue-50/40"
                      : "border-zinc-200 bg-white hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold text-zinc-900">{c.name}</span>
                      <span className="text-xs text-zinc-500">{collecteTypeLabels[c.type]}</span>
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
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
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
                  {kpis && kpis.total > 0 && (
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-semibold text-zinc-900">
                        {formatAmount(kpis.totalCollected)}
                      </span>
                      <span className="text-xs text-zinc-500">
                        sur {formatAmount(kpis.totalDue)} attendu
                      </span>
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
              <KpiHeader cotisations={collecteCotisations} />

              {/* Lien HelloAsso (retour de Cindy du 2026-08-25) : affiché
                  ici même pour une collecte non liée à un événement (ex.
                  Stage) — un lien de paiement externe peut être utile pour
                  n'importe quel type de collecte, pas seulement un
                  "Événement". Éditable après coup si absent ou à corriger. */}
              <div className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <Link2 className="h-3.5 w-3.5 text-navy" />
                  Lien de paiement (HelloAsso...)
                </p>
                {editingLink ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="url"
                      autoFocus
                      placeholder="https://www.helloasso.com/..."
                      value={linkDraft}
                      onChange={(e) => setLinkDraft(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                    />
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={saveLink}
                        disabled={savingLink}
                        className="rounded-full bg-ubac-yellow px-3.5 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
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
                ) : selectedCollecte.paymentLink ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={selectedCollecte.paymentLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 items-center gap-1.5 truncate text-sm text-navy hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{selectedCollecte.paymentLink}</span>
                    </a>
                    <button
                      onClick={() => {
                        setLinkDraft(selectedCollecte.paymentLink ?? "");
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
                    onClick={() => {
                      setLinkDraft("");
                      setEditingLink(true);
                    }}
                    className="flex w-fit items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter un lien de paiement
                  </button>
                )}
              </div>

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
