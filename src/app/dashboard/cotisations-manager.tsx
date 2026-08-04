"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Tag, Target, Ticket, Wallet, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useScrollTopOnChange } from "@/lib/use-scroll-top-on-change";
import GaugeChart from "./gauge-chart";
import CotisationParticipantsTable, {
  computeStatus,
  formatAmount,
  roundCents,
} from "./cotisation-participants-table";
import type { AdminCollecte, AdminCotisation, AdminMember, CollecteType } from "./page";

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
  let enAttenteCount = 0;
  let totalDue = 0;
  let totalCollected = 0;

  list.forEach((c) => {
    const status = computeStatus(c);
    if (status === "PAYE") payeCount++;
    else if (status === "OFFERT") offertCount++;
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
    enAttenteCount,
    totalDue,
    totalCollected,
    percentage,
  };
}

function KpiHeader({ cotisations }: { cotisations: AdminCotisation[] }) {
  const kpis = useMemo(() => computeKpis(cotisations), [cotisations]);

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm md:p-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center justify-center rounded-xl bg-zinc-50 p-3 sm:col-span-2 lg:col-span-1">
          <GaugeChart percentage={kpis.percentage} label="Collecté" color="#F4C430" />
        </div>
        <div className="rounded-xl bg-green-50 p-3 text-center md:p-4">
          <p className="text-xl font-bold text-green-700 sm:text-2xl">{kpis.payeCount}</p>
          <p className="text-xs font-medium text-green-600 sm:text-sm">Payés</p>
        </div>
        <div className="rounded-xl bg-amber-50 p-3 text-center md:p-4">
          <p className="text-xl font-bold text-amber-700 sm:text-2xl">{kpis.offertCount}</p>
          <p className="text-xs font-medium text-amber-600 sm:text-sm">Offerts / Dispensés</p>
        </div>
        <div className="rounded-xl bg-red-50 p-3 text-center md:p-4">
          <p className="text-xl font-bold text-red-700 sm:text-2xl">{kpis.enAttenteCount}</p>
          <p className="text-xs font-medium text-red-600 sm:text-sm">En attente / Non payés</p>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl bg-ubac-yellow/10 p-3 md:p-4">
          <Wallet className="h-5 w-5 shrink-0 text-ubac-yellow-dark" />
          <div>
            <p className="text-xs font-medium text-ubac-yellow-dark sm:text-sm">Collecté</p>
            <p className="text-base font-bold text-zinc-900 sm:text-lg">
              {formatAmount(kpis.totalCollected)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl bg-navy/5 p-3 md:p-4">
          <Target className="h-5 w-5 shrink-0 text-navy" />
          <div>
            <p className="text-xs font-medium text-navy sm:text-sm">Attendu</p>
            <p className="text-base font-bold text-zinc-900 sm:text-lg">
              {formatAmount(kpis.totalDue)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CotisationsManager({
  cotisations,
  collectes,
  members,
}: {
  cotisations: AdminCotisation[];
  collectes: AdminCollecte[];
  members: AdminMember[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"cotisations" | "collectes">("cotisations");
  useScrollTopOnChange(tab);
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

  const tabButtonClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
      active ? "bg-navy text-white" : "text-zinc-500 hover:bg-zinc-100"
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

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTab("cotisations")} className={tabButtonClass(tab === "cotisations")}>
          <Tag className="h-3.5 w-3.5" />
          Cotisations &amp; Licences
        </button>
        <button onClick={() => setTab("collectes")} className={tabButtonClass(tab === "collectes")}>
          <Ticket className="h-3.5 w-3.5" />
          Stages &amp; Événements Payants
        </button>
      </div>

      {tab === "cotisations" && (
        <div className="flex flex-col gap-4">
          <KpiHeader cotisations={seasonCotisations} />
          <CotisationParticipantsTable
            cotisations={seasonCotisations}
            contactEmailByPlayerId={contactEmailByPlayerId}
            members={members}
            emptyLabel="Aucune cotisation pour la saison en cours."
          />
        </div>
      )}

      {tab === "collectes" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {collectes.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCollecteId(c.id)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedCollecteId === c.id
                    ? "border-navy bg-navy text-white"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {c.name}
                <span className="ml-1.5 text-xs opacity-70">
                  · {collecteTypeLabels[c.type]}
                </span>
              </button>
            ))}
            <button
              onClick={() => setCreatingCollecte((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:border-ubac-yellow hover:text-ubac-yellow-dark"
            >
              <Plus className="h-3.5 w-3.5" />
              Nouvelle collecte
            </button>
          </div>

          {creatingCollecte && (
            <div className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:gap-3">
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
                  <option value="EVENEMENT">Événement</option>
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
          )}

          {selectedCollecte ? (
            <div className="flex flex-col gap-4">
              <KpiHeader cotisations={collecteCotisations} />

              <div className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
                <button
                  onClick={() => setAddingParticipants((v) => !v)}
                  className="flex w-fit items-center gap-1.5 rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:border-ubac-yellow hover:text-ubac-yellow-dark"
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
                        className="w-full rounded-full border border-zinc-200 py-1.5 pl-9 pr-3 text-sm focus:border-ubac-yellow focus:outline-none"
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
                            {m.firstName} {(m.lastName ?? "").toUpperCase()}
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
                members={members}
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
    </div>
  );
}
