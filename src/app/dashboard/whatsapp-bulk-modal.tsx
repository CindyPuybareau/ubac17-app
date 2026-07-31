"use client";

import { useState } from "react";
import { Check, ExternalLink, MessageCircle, Send, Users, X } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/whatsapp";

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
  const [text, setText] = useState(defaultMessage);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const reachable = contacts.filter((c) => c.phone);

  function markSent(id: string) {
    setSentIds((prev) => new Set(prev).add(id));
  }

  function sendToAll() {
    // wa.me has no real multi-recipient send, so this opens one tab per
    // contact — staggered, since browsers silently drop window.open calls
    // fired back-to-back beyond the first in some popup-blocker configs.
    reachable.forEach((c, i) => {
      const link = buildWhatsAppLink(c.phone, text);
      if (!link) return;
      setTimeout(() => {
        window.open(link, "_blank", "noopener,noreferrer");
        markSent(c.id);
      }, i * 350);
    });
  }

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

        <label className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Message (envoyé à tout le monde)
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="mb-3 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        />

        {reachable.length >= 2 && (
          <button
            onClick={sendToAll}
            className="mb-3 flex items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            <Send className="h-4 w-4" />
            Envoyer à tout le monde ({reachable.length})
          </button>
        )}

        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <Users className="h-3.5 w-3.5" />
          Contacts individuels
        </p>

        <div className="flex flex-col gap-1 overflow-y-auto">
          {reachable.length === 0 && (
            <p className="text-sm text-zinc-400">Aucun numéro de téléphone connu.</p>
          )}
          {reachable.map((c) => {
            const sent = sentIds.has(c.id);
            const link = buildWhatsAppLink(c.phone, text);
            return (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50"
              >
                <span className="truncate text-sm text-zinc-700">{c.name}</span>
                <a
                  href={link ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => markSent(c.id)}
                  className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    sent
                      ? "border-zinc-200 text-zinc-400"
                      : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  {sent ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                  {sent ? "Envoyé" : "Envoyer"}
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
