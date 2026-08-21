"use client";

import { MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/client";

// Bascule directe vers WhatsApp, sans étape intermédiaire — contrairement à
// WhatsAppButton (whatsapp-button.tsx) qui ouvre une modale de composition
// avant d'envoyer. Retour de Cindy du 2026-08-21 : à côté du numéro de
// téléphone, dans le tableau Membres et les cartes équipe (Bureau + Coach
// uniquement — jamais montré côté Joueurs/Parents/Enfant puisque ni
// members-table.tsx ni team-card.tsx n'y sont utilisés), un clic doit
// ouvrir WhatsApp tout de suite, pas un aller-retour en plus.
export default function WhatsAppDirectButton({
  phone,
  message,
  playerId,
  className,
}: {
  phone: string | null | undefined;
  message: string;
  // Historisé comme les autres envois WhatsApp de l'appli (voir
  // whatsapp-button.tsx) — le message par défaut est celui réellement
  // envoyé puisqu'il n'y a ici aucune étape de modification avant l'envoi.
  playerId?: string;
  className?: string;
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
      <MessageCircle className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}
