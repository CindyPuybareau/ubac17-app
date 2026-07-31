"use client";

import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { buildWhatsAppForwardLink } from "@/lib/whatsapp";

export default function WhatsAppGroupButton({
  teamName,
  defaultMessage,
  className,
}: {
  teamName: string;
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
          "flex items-center gap-1.5 rounded-full border border-emerald-200 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
        }
      >
        <MessageCircle className="h-4 w-4" />
        Envoyer sur le groupe WhatsApp {teamName}
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
                <MessageCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                Groupe WhatsApp {teamName}
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
              le groupe {teamName} dans la liste, puis appuie sur envoyer.
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
