"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Check, Clock, MapPin, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import TaskSourceBadge from "./task-source-badge";
import RoleIcon from "./role-icon";
import type {
  CarpoolOffer,
  EventRoleType,
  EventTasksState,
  TaskType,
} from "./event-tasks";

// Un trajet propose une heure de rendez-vous parmi les options du jour de
// l'événement : demander une date complète serait une friction inutile,
// un covoiturage part toujours le jour même.
function combineDateAndTime(eventDateIso: string, time: string) {
  const date = new Date(eventDateIso);
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function formatDepartureTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function remainingSeats(offer: CarpoolOffer) {
  const reserved = offer.reservations.reduce((sum, r) => sum + r.seats, 0);
  return Math.max(0, offer.seats - reserved);
}

export default function MatchTasksPanel({
  eventId,
  eventDate,
  roster,
  myPlayerIds,
  canAssignAnyone,
  initialTasks,
  initialCarpool,
  roles,
  showCarpool,
}: {
  eventId: string;
  // Date de l'événement (event.start_time) : sert uniquement à situer
  // l'heure de rendez-vous saisie sur le bon jour.
  eventDate: string;
  roster: { id: string; name: string }[];
  myPlayerIds: string[];
  canAssignAnyone: boolean;
  initialTasks: EventTasksState;
  initialCarpool: CarpoolOffer[];
  // Catalogue applicable a ce type d evenement, resolu par l appelant.
  roles: EventRoleType[];
  // Faux sur un entrainement ou un match a domicile : il n y a rien a
  // organiser, et un bloc vide invite a une action sans objet.
  showCarpool: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [carpoolError, setCarpoolError] = useState<string | null>(null);
  const [offerFormOpen, setOfferFormOpen] = useState(false);
  const [seatsInput, setSeatsInput] = useState("");
  const [timeInput, setTimeInput] = useState("");
  const [meetingPointInput, setMeetingPointInput] = useState("");
  const [reserveSeatsInput, setReserveSeatsInput] = useState<Record<string, string>>({});

  async function volunteer(taskType: TaskType, playerId: string) {
    setPending(taskType);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("event_tasks")
      .insert({
        event_id: eventId,
        task_type: taskType,
        player_id: playerId,
        source: "VOLUNTEER",
      });
    setPending(null);
    if (insertError) {
      setError("Déjà attribué à quelqu'un d'autre.");
    }
    router.refresh();
  }

  async function withdraw(taskType: TaskType) {
    setPending(taskType);
    const supabase = createClient();
    await supabase
      .from("event_tasks")
      .delete()
      .eq("event_id", eventId)
      .eq("task_type", taskType);
    setPending(null);
    router.refresh();
  }

  async function assign(taskType: TaskType, playerId: string) {
    if (!playerId) return;
    setPending(taskType);
    const supabase = createClient();
    if (initialTasks[taskType]) {
      await supabase
        .from("event_tasks")
        .update({ player_id: playerId, source: "COACH" })
        .eq("event_id", eventId)
        .eq("task_type", taskType);
    } else {
      await supabase
        .from("event_tasks")
        .insert({
          event_id: eventId,
          task_type: taskType,
          player_id: playerId,
          source: "COACH",
        });
    }
    setPending(null);
    router.refresh();
  }

  const myOffer = initialCarpool.find((o) => myPlayerIds.includes(o.playerId));

  async function proposeOffer() {
    const seats = Number(seatsInput);
    if (!seats || seats <= 0) {
      setCarpoolError("Indique au moins une place.");
      return;
    }
    setPending("carpool");
    setCarpoolError(null);
    const supabase = createClient();
    const { error: writeError } = await supabase.from("event_carpool_offers").upsert(
      {
        event_id: eventId,
        player_id: myPlayerIds[0],
        seats,
        departure_time: timeInput ? combineDateAndTime(eventDate, timeInput) : null,
        meeting_point: meetingPointInput.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,player_id" }
    );
    setPending(null);
    if (writeError) {
      setCarpoolError(
        writeError.message.includes("places déjà réservées")
          ? writeError.message
          : "Enregistrement impossible, réessaie."
      );
      return;
    }
    setOfferFormOpen(false);
    router.refresh();
  }

  async function withdrawOffer() {
    setPending("carpool");
    const supabase = createClient();
    await supabase
      .from("event_carpool_offers")
      .delete()
      .eq("event_id", eventId)
      .eq("player_id", myPlayerIds[0]);
    setPending(null);
    router.refresh();
  }

  async function reserve(offer: CarpoolOffer) {
    const seats = Number(reserveSeatsInput[offer.id] ?? "1") || 1;
    setPending(`reserve:${offer.id}`);
    setCarpoolError(null);
    const supabase = createClient();
    const { error: writeError } = await supabase.from("event_carpool_reservations").upsert(
      { offer_id: offer.id, player_id: myPlayerIds[0], seats },
      { onConflict: "offer_id,player_id" }
    );
    setPending(null);
    if (writeError) {
      setCarpoolError(
        writeError.message.includes("Plus assez de places")
          ? writeError.message
          : "Réservation impossible, réessaie."
      );
      return;
    }
    router.refresh();
  }

  async function cancelReservation(offerId: string) {
    setPending(`cancel:${offerId}`);
    const supabase = createClient();
    await supabase
      .from("event_carpool_reservations")
      .delete()
      .eq("offer_id", offerId)
      .eq("player_id", myPlayerIds[0]);
    setPending(null);
    router.refresh();
  }

  // Sur un entraînement il ne reste ni rôle applicable ni covoiturage : le
  // titre seul au-dessus d'un cadre vide ressemblerait à un bug.
  if (roles.length === 0 && !showCarpool) return null;

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Organisation Parents
      </p>

      {/* Deux colonnes sur écran large, empilées sur mobile — même
          disposition que la liste des événements à venir côté parent. */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {roles.map((role) => {
        const taskType = role.code;
        const assignment = initialTasks[taskType] ?? null;
        const assignedToMe = assignment ? myPlayerIds.includes(assignment.playerId) : false;

        return (
          <div
            key={taskType}
            // Bouton collé au texte plutôt que renvoyé au bord droit.
            className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <RoleIcon icon={role.icon} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-700">{role.label}</p>
                <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <span className="truncate">
                    {assignment ? assignment.playerName : "Non attribué"}
                  </span>
                  {assignment && <TaskSourceBadge source={assignment.source} />}
                </p>
              </div>
            </div>

            {canAssignAnyone ? (
              <select
                defaultValue={assignment?.playerId ?? ""}
                disabled={pending === taskType}
                onChange={(e) => assign(taskType, e.target.value)}
                className="w-full rounded-full border border-zinc-200 bg-white px-2.5 py-2 text-xs disabled:opacity-60 sm:w-auto"
              >
                <option value="" disabled>
                  Choisir...
                </option>
                {roster.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : !assignment && myPlayerIds.length > 0 ? (
              <button
                type="button"
                disabled={pending === taskType}
                onClick={() => volunteer(taskType, myPlayerIds[0])}
                className="w-full rounded-full bg-navy px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-60 sm:w-auto"
              >
                Je m&apos;en occupe
              </button>
            ) : assignedToMe ? (
              <button
                type="button"
                disabled={pending === taskType}
                onClick={() => withdraw(taskType)}
                className="flex w-full items-center justify-center gap-1 rounded-full border border-zinc-200 px-3 py-2.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-60 sm:w-auto"
              >
                <X className="h-3 w-3" />
                Annuler
              </button>
            ) : null}
          </div>
        );
      })}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {showCarpool && (
      <div className="flex flex-col gap-2.5 rounded-lg bg-white px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Car className="h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-xs font-medium text-zinc-700">Covoiturage & trajet</p>
        </div>

        {/* Proposer ou modifier son propre trajet. */}
        {myPlayerIds.length > 0 && (
          <div className="flex flex-col gap-2">
            {myOffer && !offerFormOpen ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-2.5 py-2">
                <p className="text-xs text-emerald-800">
                  Tu proposes <span className="font-semibold">{myOffer.seats} place{myOffer.seats > 1 ? "s" : ""}</span>
                  {myOffer.departureTime && ` · départ ${formatDepartureTime(myOffer.departureTime)}`}
                  {myOffer.meetingPoint && ` · ${myOffer.meetingPoint}`}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSeatsInput(String(myOffer.seats));
                      setTimeInput(myOffer.departureTime ? formatDepartureTime(myOffer.departureTime) : "");
                      setMeetingPointInput(myOffer.meetingPoint ?? "");
                      setOfferFormOpen(true);
                    }}
                    className="rounded-full border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-white"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    disabled={pending === "carpool"}
                    onClick={withdrawOffer}
                    className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-60"
                  >
                    Retirer
                  </button>
                </div>
              </div>
            ) : offerFormOpen ? (
              <div className="flex flex-col gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                    Places
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={seatsInput}
                      onChange={(e) => setSeatsInput(e.target.value)}
                      placeholder="3"
                      className="w-14 rounded-full border border-zinc-200 px-2 py-1.5 text-center text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <input
                      type="time"
                      value={timeInput}
                      onChange={(e) => setTimeInput(e.target.value)}
                      className="rounded-full border border-zinc-200 px-2 py-1.5 text-xs"
                    />
                  </label>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <input
                    type="text"
                    value={meetingPointInput}
                    onChange={(e) => setMeetingPointInput(e.target.value)}
                    placeholder="Lieu de rendez-vous (facultatif)"
                    className="flex-1 rounded-full border border-zinc-200 px-2.5 py-1.5 text-xs"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOfferFormOpen(false)}
                    className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-white"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={pending === "carpool"}
                    onClick={proposeOffer}
                    className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {pending === "carpool" ? "Enregistrement..." : "Valider le trajet"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSeatsInput("");
                  setTimeInput("");
                  setMeetingPointInput("");
                  setOfferFormOpen(true);
                }}
                className="w-fit rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Proposer un trajet
              </button>
            )}
          </div>
        )}

        {carpoolError && <p className="text-xs text-red-600">{carpoolError}</p>}

        {/* Trajets proposés par toute l'équipe, le mien compris. */}
        {initialCarpool.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {initialCarpool.map((offer) => {
              const remaining = remainingSeats(offer);
              const isMine = myPlayerIds.includes(offer.playerId);
              const myReservation = offer.reservations.find((r) =>
                myPlayerIds.includes(r.playerId)
              );
              return (
                <li key={offer.id} className="rounded-lg border border-zinc-100 px-2.5 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <p className="text-xs text-zinc-700">
                      <span className="font-semibold">{offer.playerName}</span>
                      {offer.departureTime && (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-zinc-500">
                          <Clock className="h-3 w-3" />
                          {formatDepartureTime(offer.departureTime)}
                        </span>
                      )}
                      {offer.meetingPoint && (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-zinc-500">
                          <MapPin className="h-3 w-3" />
                          {offer.meetingPoint}
                        </span>
                      )}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        remaining > 0
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {remaining > 0
                        ? `${remaining}/${offer.seats} place${offer.seats > 1 ? "s" : ""}`
                        : "Complet"}
                    </span>
                  </div>

                  {offer.reservations.length > 0 && (
                    <p className="mt-1 truncate text-[11px] text-zinc-400">
                      {offer.reservations
                        .map((r) => `${r.playerName} (${r.seats})`)
                        .join(", ")}
                    </p>
                  )}

                  {!isMine && myPlayerIds.length > 0 && (
                    <div className="mt-1.5">
                      {myReservation ? (
                        <div className="flex items-center gap-1.5">
                          <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <Check className="h-3.5 w-3.5" />
                            Réservé ({myReservation.seats})
                          </span>
                          <button
                            type="button"
                            disabled={pending === `cancel:${offer.id}`}
                            onClick={() => cancelReservation(offer.id)}
                            className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : remaining > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={remaining}
                            value={reserveSeatsInput[offer.id] ?? "1"}
                            onChange={(e) =>
                              setReserveSeatsInput((s) => ({ ...s, [offer.id]: e.target.value }))
                            }
                            className="w-12 rounded-full border border-zinc-200 px-2 py-1 text-center text-xs"
                          />
                          <button
                            type="button"
                            disabled={pending === `reserve:${offer.id}`}
                            onClick={() => reserve(offer)}
                            className="rounded-full bg-navy px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-60"
                          >
                            Réserver
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-zinc-400">Aucune place proposée pour l&apos;instant.</p>
        )}
      </div>
      )}
    </div>
  );
}
