"use client";

import { useState } from "react";
import { ExternalLink, Send, X } from "lucide-react";
import { buildWhatsAppForwardLink } from "@/lib/whatsapp";

// Retour de Cindy du 29/08 ("tous les boutons whatsapp des équipes... même
// vert, même icône partout, nommés comme le groupe qu'on a nommé à la
// base") : même style plein vert + ExternalLink que le bouton "Ouvrir sur
// WhatsApp" (team-card.tsx, whatsapp-groups-manager.tsx...) — c'était le
// seul bouton whatsapp d'équipe encore en contour, avec une phrase
// reconstruite ("Envoyer sur le groupe WhatsApp Séniors M") au lieu du nom
// réel du groupe. `groupName` (renommé depuis `teamName`) reçoit
// maintenant whatsappGroup.name directement depuis l'appelant.
export default function WhatsAppGroupButton({
  groupName,
  defaultMessage,
  className,
}: {
  groupName: string;
  defaultMessage: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(defaultMessage);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setText(defaultMessage);
          setOpen(true);
        }}
        className={
          className ??
          "flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
        }
      >
        <ExternalLink className="h-4 w-4" />
        Groupe WhatsApp {groupName}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-semibold text-zinc-900">
                <ExternalLink className="h-4 w-4 shrink-0 text-emerald-600" />
                Groupe WhatsApp {groupName}
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
            />
            <p className="mt-2 text-xs text-zinc-400">
              WhatsApp va s&apos;ouvrir avec ce message prêt à envoyer : choisis
              le groupe {groupName} dans la liste, puis appuie sur envoyer.
            </p>
            <a
              href={buildWhatsAppForwardLink(text)}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
            >
              <Send className="h-4 w-4" />
              Ouvrir WhatsApp
            </a>
          </div>
        </div>
      )}
    </>
  );
}
