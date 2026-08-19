"use client";

import { useState } from "react";
import { BellRing, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Remplace l'appel express : le coach ne pointe plus à la place des
// familles, il leur demande de répondre. Un bandeau apparaît alors dans
// leur espace tant que la réponse manque.
export default function RequestAttendanceButton({
  eventId,
  requestedAt,
  pendingCount,
  teamName,
  startTime,
}: {
  eventId: string;
  requestedAt: string | null;
  // Réponses encore manquantes : sans elles, la demande n'a pas d'objet.
  pendingCount: number;
  // Servent au texte de la notification poussée sur le téléphone.
  teamName: string;
  startTime: string;
}) {
  const [sentAt, setSentAt] = useState<string | null>(requestedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request() {
    setSaving(true);
    setError(null);
    const now = new Date().toISOString();
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("events")
      .update({ attendance_requested_at: now })
      .eq("id", eventId);
    setSaving(false);
    if (updateError) {
      setError("Demande non enregistrée, réessaie.");
      return;
    }
    setSentAt(now);

    // La notification est un bonus : le bandeau dans l'app, lui, est déjà
    // en place grâce à la date enregistrée ci-dessus. Un échec d'envoi ne
    // doit donc pas se présenter comme un échec de la demande.
    const when = new Date(startTime).toLocaleString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    try {
      await fetch("/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          title: `UBAC — ${teamName}`,
          body: `Le coach attend ta réponse pour ${when}.`,
          url: "/dashboard",
        }),
      });
    } catch {
      // Silencieux volontairement : voir ci-dessus.
    }
    // Pas de router.refresh() : le bandeau se met déjà à jour ci-dessus
    // (setSentAt) et events est surveillée en temps réel (realtime-sync.tsx)
    // pour le reste de l'écran — un refresh explicite en plus rechargeait
    // deux fois pour un seul clic (retour de Cindy du 2026-08-20).
  }

  if (pendingCount === 0) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
        <Check className="h-4 w-4 shrink-0" />
        Tout le monde a répondu
      </span>
    );
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={request}
        disabled={saving}
        className="flex items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
      >
        <BellRing className="h-4 w-4 shrink-0" />
        {saving
          ? "Envoi..."
          : sentAt
            ? "Relancer les familles"
            : "Demander les présences"}
      </button>
      {sentAt && (
        <span className="text-[11px] text-zinc-400">
          Demandé le{" "}
          {new Date(sentAt).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
          })}
        </span>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
