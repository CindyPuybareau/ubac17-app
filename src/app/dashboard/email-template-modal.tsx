"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  ClipboardList,
  FileText,
  Mail,
  ScrollText,
  Send,
  Shield,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import { buildGmailComposeLink, withSignature } from "@/lib/email";
import { formatFirstName } from "@/lib/names";

type Template = {
  id: string;
  label: string;
  icon: typeof Mail;
  subject: string;
  url: string;
};

// Bureau-only: these embed a link to an external club document/form.
// Hidden entirely from Coach/Parent — only "Message classique" is theirs.
const BUREAU_TEMPLATES: Template[] = [
  {
    id: "decharge",
    label: "Formulaire de décharge",
    icon: FileText,
    subject: "UBAC - Formulaire de décharge",
    url: "https://docs.google.com/forms/d/e/1FAIpQLSc9_D8k2zOw3cIISkf0m7Y_ciUgtc_4wMX7v9nQ9nPTPTFDyA/viewform",
  },
  {
    id: "preinscription",
    label: "Formulaire de pré-inscription",
    icon: ClipboardList,
    subject: "UBAC - Formulaire de pré-inscription",
    url: "https://docs.google.com/forms/d/e/1FAIpQLSf4y8Fl3Q9-0BSlum9ejkN8411mfy1jRx6p7H-JPRQBdX2_kQ/viewform",
  },
  {
    id: "certificat",
    label: "Certificat médical",
    icon: Stethoscope,
    subject: "UBAC - Certificat médical",
    url: "https://api.ffbb.app/assets/0d8b1a47-4dfd-46ce-a626-e63aa5c28094?fs=242891",
  },
  {
    id: "surclassement",
    label: "Formulaire de surclassement",
    icon: ArrowUpRight,
    subject: "UBAC - Formulaire de surclassement",
    url: "https://api.ffbb.app/assets/c18ba90e-0cd4-4581-b9b2-67f70472d557?fs=101279",
  },
  {
    id: "reglement",
    label: "Règlement intérieur",
    icon: ScrollText,
    subject: "UBAC - Règlement intérieur",
    url: "https://ubac17.fr/wp-content/uploads/2024/06/Reglement-Interieur-2024-2025.pdf",
  },
  {
    id: "charte-joueur",
    label: "Charte du joueur",
    icon: Shield,
    subject: "UBAC - Charte du joueur",
    url: "https://ubac17.fr/wp-content/uploads/2025/05/Charte-du-Joueur-Licencie-25-26.pdf",
  },
  {
    id: "charte-parent",
    label: "Charte du parent",
    icon: Users,
    subject: "UBAC - Charte du parent",
    url: "https://ubac17.fr/wp-content/uploads/2025/05/Charte-du-Parent-de-Joueur-Licencie-25-26.pdf",
  },
];

// Both variants go through withSignature so the club signature is
// identical here and in the Cotisations relances — including on the blank
// "Message classique", which used to carry none at all.
function bodyFor(template: Template | null, recipientFirstName: string | null | undefined) {
  const greeting = `Bonjour ${recipientFirstName ? formatFirstName(recipientFirstName) : ""},`.replace(" ,", ",");
  // Blank line left between greeting and signature: that's where the
  // cursor lands to type the actual message.
  if (!template) return `${greeting}\n\n\n${withSignature("")}`;
  return withSignature(
    `${greeting}\n\nMerci de consulter/compléter le document suivant :\n${template.url}`
  );
}

export default function EmailTemplateModal({
  toEmail,
  recipientFirstName,
  canUseBureauTemplates,
  onClose,
}: {
  toEmail: string;
  recipientFirstName?: string | null;
  canUseBureauTemplates: boolean;
  onClose: () => void;
}) {
  const [templateId, setTemplateId] = useState("blank");
  const [subject, setSubject] = useState("UBAC - Message");
  const [body, setBody] = useState(bodyFor(null, recipientFirstName));
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleTemplateChange(id: string) {
    setTemplateId(id);
    const template = BUREAU_TEMPLATES.find((t) => t.id === id) ?? null;
    setSubject(template ? template.subject : "UBAC - Message");
    setBody(bodyFor(template, recipientFirstName));
  }

  // Applied on the final text rather than only on the template, so a body
  // rewritten (or emptied) by hand in the textarea still leaves signed.
  const signedBody = withSignature(body);
  const gmailComposeLink = buildGmailComposeLink({ to: toEmail, subject, body: signedBody });

  async function handleSend() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: toEmail, subject, body: signedBody }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error ?? "Envoi impossible." });
      } else {
        setResult({ ok: true, message: "E-mail envoyé depuis ubac17.basket@gmail.com." });
      }
    } catch {
      setResult({ ok: false, message: "Envoi impossible (problème de connexion)." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 font-semibold text-zinc-900">
            <Mail className="h-4 w-4 shrink-0 text-navy" />
            Envoyer un e-mail
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Modèle
          </label>
          <select
            value={templateId}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          >
            <option value="blank">Message classique (vierge)</option>
            {canUseBureauTemplates &&
              BUREAU_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Objet
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Message
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={7}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          />
        </div>

        <p className="text-xs text-zinc-400">
          Envoyé automatiquement depuis{" "}
          <span className="font-medium text-zinc-500">ubac17.basket@gmail.com</span>.
        </p>

        {result && (
          <p className={`text-sm ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
            {result.message}
          </p>
        )}

        <button
          onClick={handleSend}
          disabled={sending}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {sending ? "Envoi..." : "Envoyer"}
        </button>

        {result && !result.ok && (
          <a
            href={gmailComposeLink}
            target="_blank"
            rel="noreferrer"
            onClick={onClose}
            className="text-center text-xs text-zinc-400 underline hover:text-zinc-600"
          >
            Ou ouvrir un brouillon Gmail pré-rempli
          </a>
        )}
      </div>
    </div>
  );
}
