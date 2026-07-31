"use client";

import { ExternalLink, MessageCircle, Users, X } from "lucide-react";
import WhatsAppButton from "./whatsapp-button";

export type WhatsAppContact = {
  id: string;
  name: string;
  phone: string | null;
};

export default function WhatsAppBulkModal({
  title,
  contacts,
  defaultMessage,
  groupLink,
  onClose,
}: {
  title: string;
  contacts: WhatsAppContact[];
  defaultMessage: string;
  groupLink?: string | null;
  onClose: () => void;
}) {
  const reachable = contacts.filter((c) => c.phone);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 font-semibold text-zinc-900">
            <MessageCircle className="h-4 w-4 shrink-0 text-emerald-600" />
            {title}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {groupLink && (
          <a
            href={groupLink}
            target="_blank"
            rel="noreferrer"
            className="mb-3 flex items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            <ExternalLink className="h-4 w-4" />
            Ouvrir le groupe WhatsApp
          </a>
        )}

        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <Users className="h-3.5 w-3.5" />
          {groupLink ? "Ou individuellement" : "Contacts individuels"}
        </p>

        <div className="flex flex-col gap-1 overflow-y-auto">
          {reachable.length === 0 && (
            <p className="text-sm text-zinc-400">Aucun numéro de téléphone connu.</p>
          )}
          {reachable.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50"
            >
              <span className="truncate text-sm text-zinc-700">{c.name}</span>
              <WhatsAppButton
                phone={c.phone}
                message={defaultMessage}
                label="Envoyer"
                className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
