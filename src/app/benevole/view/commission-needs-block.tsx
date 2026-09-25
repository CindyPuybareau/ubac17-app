"use client";

import { useState } from "react";
import { HandHeart } from "lucide-react";
import RoleIcon from "@/app/dashboard/role-icon";
import {
  volunteerRoleIcon,
  volunteerRoleLabel,
  type VolunteerNeed,
} from "@/app/dashboard/event-volunteer-needs";

function remainingSlots(need: VolunteerNeed) {
  return Math.max(0, need.requiredCount - need.signups.length);
}

// Extrait de commission-view.tsx le 25/09 ("regrouper les besoins en
// organisation avec les présences") : ce bloc (besoins + "Je me propose")
// vivait uniquement sur le Tableau de bord -- déplacé ici pour être
// réutilisé tel quel sous la carte présent/absent + paiement
// (GuestRsvpPaidEventCard), sur le Tableau de bord ET le Calendrier. Un
// seul geste : se proposer, prénom à l'appui (retour de Cindy du 10/09 --
// le lien est partagé par toute une commission, pas propre à une
// personne : pas d'identité permanente à retrouver d'un visiteur à
// l'autre, juste un prénom saisi à chaque fois). Écrit via
// /api/commission-signup, jamais un appel Supabase direct (aucune session
// d'aucune sorte sur ce lien).
function CommissionNeedRow({ need, token }: { need: VolunteerNeed; token: string }) {
  const [localNeed, setLocalNeed] = useState(need);
  const [formOpen, setFormOpen] = useState(false);
  // Retour de Cindy du 13/09 ("une case, nom et un prénom") : un seul champ
  // "Ton prénom" ne suffisait plus à distinguer deux bénévoles homonymes
  // (plusieurs "Marie" possibles sur une même commission). Toujours envoyé
  // comme un seul guestName à l'API (jamais touché, aucune migration) --
  // juste composé des deux ici plutôt qu'un seul champ côté formulaire.
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justJoinedAs, setJustJoinedAs] = useState<string | null>(null);
  const label = volunteerRoleLabel(localNeed.roleCode, localNeed.customLabel);
  const icon = volunteerRoleIcon(localNeed.roleCode);
  const remaining = remainingSlots(localNeed);

  async function submit() {
    const trimmedFirst = guestFirstName.trim();
    const trimmedLast = guestLastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      setError("Indique ton prénom et ton nom.");
      return;
    }
    const trimmed = `${trimmedFirst} ${trimmedLast}`;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/commission-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, needId: localNeed.id, guestName: trimmed }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "Une erreur est survenue.");
        return;
      }
      setLocalNeed((prev) => ({
        ...prev,
        signups: [
          ...prev.signups,
          {
            id: `local-${Date.now()}`,
            playerId: null,
            benevoleId: null,
            commissionGroupId: null,
            guestName: trimmed,
            playerName: trimmed,
            source: "VOLUNTEER",
          },
        ],
      }));
      setJustJoinedAs(trimmed);
      setFormOpen(false);
      setGuestFirstName("");
      setGuestLastName("");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RoleIcon icon={icon} />
          <p className="text-xs font-medium text-zinc-700">{label}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            remaining > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {remaining > 0
            ? `${localNeed.signups.length}/${localNeed.requiredCount}`
            : `Complet (${localNeed.signups.length}/${localNeed.requiredCount})`}
        </span>
      </div>
      {localNeed.signups.length > 0 && (
        <p className="text-xs text-zinc-400">
          {localNeed.signups.map((s) => s.playerName || "Bénévole").join(", ")}
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {justJoinedAs && !formOpen && (
        <p className="text-xs font-medium text-emerald-600">Merci {justJoinedAs}, c&apos;est noté !</p>
      )}
      {formOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            autoFocus
            value={guestFirstName}
            onChange={(e) => setGuestFirstName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ton prénom"
            className="w-28 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
          />
          <input
            type="text"
            value={guestLastName}
            onChange={(e) => setGuestLastName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ton nom"
            className="w-28 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-60"
          >
            {pending ? "..." : "Valider"}
          </button>
          <button
            type="button"
            onClick={() => {
              setFormOpen(false);
              setError(null);
            }}
            className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Annuler
          </button>
        </div>
      ) : remaining > 0 ? (
        <button
          type="button"
          onClick={() => {
            setFormOpen(true);
            setJustJoinedAs(null);
          }}
          className="w-fit shrink-0 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark"
        >
          Je me propose
        </button>
      ) : null}
    </div>
  );
}

// Retour de Cindy du 25/09 : conteneur "Besoins d'organisation" tel qu'il
// vivait dans EventCard (commission-view.tsx) -- réutilisé maintenant aussi
// sous la carte présent/absent + paiement du Calendrier (profile-
// sections.tsx), pour ne jamais avoir deux présentations différentes du
// même besoin selon l'onglet.
export default function CommissionNeedsBlock({
  needs,
  token,
}: {
  needs: VolunteerNeed[];
  token: string;
}) {
  return (
    // Retour de Cindy du 25/09 ("tout gris ! un peu de couleurs") : teinte
    // ambrée (même esprit "entraide" que le HandHeart de l'en-tête Tableau
    // de bord, commission-view.tsx) au lieu du gris neutre -- les lignes
    // elles-mêmes gardent leur fond blanc, déjà colorées via RoleIcon et
    // les pastilles ambré/émeraude, pas de surcharge.
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-100 bg-amber-50/70 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
        <HandHeart className="h-3.5 w-3.5 shrink-0" />
        Besoins d&apos;organisation
      </p>
      {needs.length === 0 ? (
        <p className="text-xs text-zinc-400">Aucun besoin pour le moment.</p>
      ) : (
        needs.map((need) => <CommissionNeedRow key={need.id} need={need} token={token} />)
      )}
    </div>
  );
}
