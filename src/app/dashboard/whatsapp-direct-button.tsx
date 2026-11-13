"use client";

import { MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/client";

// Restauré le 11/11 (retour de la secrétaire via Cindy, "remettre le
// bouton WhatsApp dans Membres individuellement") -- identique au bouton
// retiré le 19/10 avec "Groupes WhatsApp" (3eba096), qui n'avait pourtant
// aucun rapport avec les groupes : bascule directe vers WhatsApp, sans
// étape intermédiaire. Retour de Cindy du 2026-08-21 : à côté du numéro de
// téléphone, dans le tableau Membres (Bureau uniquement — jamais montré
// côté Joueurs/Parents/Enfant puisque members-table.tsx n'y est pas
// utilisé), un clic doit ouvrir WhatsApp tout de suite, pas un aller-retour
// en plus.
export default function WhatsAppDirectButton({
  phone,
  message,
  playerId,
  className,
  iconClassName,
}: {
  phone: string | null | undefined;
  message: string;
  // Historisé comme les autres envois WhatsApp de l'appli (voir
  // whatsapp_messages) — le message par défaut est celui réellement
  // envoyé puisqu'il n'y a ici aucune étape de modification avant l'envoi.
  playerId?: string;
  className?: string;
  // Taille de l'icône quand le bouton est agrandi (rond Appeler/WhatsApp des
  // cartes Membres sur téléphone, 13/11).
  iconClassName?: string;
}) {
  const link = buildWhatsAppLink(phone, message);
  if (!link) return null;

  function logSend() {
    if (!playerId) return;
    const supabase = createClient();
    supabase
      .from("whatsapp_messages")
      .insert({
        player_id: playerId,
        direction: "ENVOYE",
        source: "APP",
        content: message,
      })
      .then(() => {});
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noreferrer"
      title="Ouvrir sur WhatsApp"
      onClick={(e) => {
        e.stopPropagation();
        logSend();
      }}
      className={
        className ??
        "inline-flex shrink-0 items-center rounded-full p-1 text-emerald-600 transition-colors hover:bg-emerald-50"
      }
    >
      <MessageCircle className={iconClassName ?? "h-3.5 w-3.5 shrink-0"} />
    </a>
  );
}
