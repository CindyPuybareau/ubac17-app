"use client";

import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/whatsapp";

export default function WhatsAppButton({
  phone,
  message,
  label,
  className,
}: {
  phone: string | null | undefined;
  message: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(message);

  if (!phone) return null;
  const link = buildWhatsAppLink(phone, text);
  if (!link && !open) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setText(message);
          setOpen(true);
        }}
        title="Contacter sur WhatsApp"
        className={
          className ??
          "flex items-center gap-1.5 rounded-full p-1.5 text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600"
        }
      >
        <MessageCircle className="h-3.5 w-3.5 shrink-0" />
        {label && <span>{label}</span>}
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
                Message WhatsApp
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
            <a
              href={buildWhatsAppLink(phone, text) ?? "#"}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
            >
              <Send className="h-4 w-4" />
              Envoyer sur WhatsApp
            </a>
          </div>
        </div>
      )}
    </>
  );
}
