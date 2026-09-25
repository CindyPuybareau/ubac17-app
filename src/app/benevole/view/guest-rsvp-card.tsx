"use client";

import { useState } from "react";
import { Check, ExternalLink, Euro, X } from "lucide-react";
import { formatAmount } from "@/app/dashboard/cotisation-shared";

// Retour de Cindy du 25/09 ("les bénévoles doivent pouvoir cliquer sur
// présent ou absent... quand la commission est sélectionnée, plus de
// lecture seule... et s'ils cliquent présent, pouvoir payer avec le lien
// HelloAsso, même carte que les membres") : seule carte interactive de tout
// l'espace commission avec "Besoins bénévoles" (CommissionNeedRow,
// commission-view.tsx) -- même esprit (nom/prénom tapés à chaque clic, le
// lien étant partagé, jamais une identité mémorisée) et même route
// service_role (/api/guest-rsvp), jamais un appel Supabase direct.
//
// Retour de Cindy du 25/09 (suite, "intégrer la carte présent/absent dans
// la carte de l'événement") : rendue via EventRow/extra (child-calendar-
// tab.tsx), donc déjà DANS la carte blanche de l'événement -- plus de
// carte blanche à elle (border/shadow/bg), juste un séparateur horizontal,
// même patron que AttendanceSummary juste au-dessus.
export default function GuestRsvpPaidEventCard({
  eventId,
  token,
  isPaid,
  paidAmount,
  paymentLink,
  paidParticipants,
}: {
  eventId: string;
  token: string;
  isPaid: boolean;
  paidAmount: number | null;
  paymentLink: string | null;
  paidParticipants: { name: string }[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<{ name: string; status: "PRESENT" | "ABSENT" } | null>(
    null
  );
  // Retour de Cindy du 25/09 ("je ne peux plus me noter absent une fois
  // confirmé présent") : id de la ligne rsvps créée par CETTE carte, gardé
  // le temps de la visite -- permet à /api/guest-rsvp de mettre à jour
  // cette même ligne (au lieu d'en créer une deuxième) quand on change
  // d'avis, sans ressaisir son nom.
  const [rsvpId, setRsvpId] = useState<string | null>(null);

  async function respond(status: "PRESENT" | "ABSENT") {
    let name: string;
    if (answered) {
      name = answered.name;
    } else {
      const trimmedFirst = guestFirstName.trim();
      const trimmedLast = guestLastName.trim();
      if (!trimmedFirst || !trimmedLast) {
        setError("Indique ton prénom et ton nom.");
        return;
      }
      name = `${trimmedFirst} ${trimmedLast}`;
    }
    setPending(true);
    setError(null);
    try {
      let res = await fetch("/api/guest-rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, eventId, guestName: name, status, rsvpId }),
      });
      // Retour de Cindy du 25/09 (robustesse) : la ligne visée par rsvpId a
      // pu disparaître entre-temps (nettoyage manuel côté Bureau, par
      // exemple) -- plutôt que de rester bloqué sur une erreur, on retente
      // une seule fois comme une toute nouvelle réponse (sans rsvpId) au
      // lieu de forcer à tout recommencer depuis zéro.
      if (res.status === 404 && rsvpId) {
        res = await fetch("/api/guest-rsvp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, eventId, guestName: name, status }),
        });
      }
      const body = (await res.json().catch(() => null)) as { error?: string; rsvpId?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "Une erreur est survenue.");
        return;
      }
      setAnswered({ name, status });
      setRsvpId(body?.rsvpId ?? null);
      setFormOpen(false);
      setGuestFirstName("");
      setGuestLastName("");
    } finally {
      setPending(false);
    }
  }

  // Une fois répondu présent (optimiste) : rejoint la liste déjà connue des
  // participants payants -- même logique d'affichage que la carte membre
  // (myPaidParticipation, calendar-view.tsx), ici toujours vrai puisqu'on
  // vient de répondre présent nous-mêmes.
  const showPaymentLink = isPaid && paymentLink && answered?.status === "PRESENT";

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3">
      {!answered ? (
        <>
          {!formOpen ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark"
              >
                <Check className="h-3.5 w-3.5 shrink-0" />
                Présent
              </button>
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                <X className="h-3.5 w-3.5 shrink-0" />
                Absent
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <input
                  value={guestFirstName}
                  onChange={(e) => setGuestFirstName(e.target.value)}
                  placeholder="Ton prénom"
                  className="min-w-0 flex-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs"
                />
                <input
                  value={guestLastName}
                  onChange={(e) => setGuestLastName(e.target.value)}
                  placeholder="Ton nom"
                  className="min-w-0 flex-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs"
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => respond("PRESENT")}
                  className="flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  {pending ? "Envoi..." : "Confirmer présent"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => respond("ABSENT")}
                  className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5 shrink-0" />
                  {pending ? "Envoi..." : "Confirmer absent"}
                </button>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="text-xs font-medium text-zinc-400 hover:text-zinc-600"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-zinc-600">{answered.name}</p>
          {/* Retour de Cindy du 25/09 ("je ne peux plus me noter absent une
              fois confirmé présent") : les deux boutons restent cliquables
              après réponse (même esprit que RsvpButtons côté membres,
              dashboard/rsvp-buttons.tsx) -- cliquer l'autre met à jour la
              même ligne (rsvpId) plutôt que de bloquer la première réponse. */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => respond("PRESENT")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                answered.status === "PRESENT"
                  ? "bg-navy text-white"
                  : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              <Check className="h-3.5 w-3.5 shrink-0" />
              Présent
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => respond("ABSENT")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                answered.status === "ABSENT"
                  ? "bg-zinc-700 text-white"
                  : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              <X className="h-3.5 w-3.5 shrink-0" />
              Absent
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}

      {isPaid && paidAmount != null && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
          <Euro className="h-3.5 w-3.5 shrink-0" />
          Tarif : {formatAmount(paidAmount)}
        </p>
      )}
      {showPaymentLink && (
        <a
          href={paymentLink}
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          Payer via HelloAsso
        </a>
      )}
      {isPaid && paidParticipants.length > 0 && (
        <p className="text-[11px] text-zinc-400">
          Déjà inscrit·e·s : {paidParticipants.map((p) => p.name).join(", ")}
        </p>
      )}
    </div>
  );
}
