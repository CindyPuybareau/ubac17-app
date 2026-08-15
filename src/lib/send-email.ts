import nodemailer from "nodemailer";
import { Resend } from "resend";
import { EMAIL_REPLY_TO } from "@/lib/email";

// Deux fournisseurs supportés. Resend est tenté en premier s'il est
// configuré ; s'il échoue (ex. compte Resend en mode "test" tant qu'aucun
// domaine n'est vérifié — il refuse alors tout destinataire autre que le
// propriétaire du compte), on retombe automatiquement sur Gmail s'il est
// configuré, plutôt que de simplement remonter l'échec. Le jour où un
// domaine est vérifié chez Resend, ce repli ne se déclenche plus jamais —
// aucun changement de code nécessaire.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM ?? "UBAC <onboarding@resend.dev>";
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

export function emailProviderConfigured(): "resend" | "gmail" | null {
  if (RESEND_API_KEY) return "resend";
  if (GMAIL_USER && GMAIL_APP_PASSWORD) return "gmail";
  return null;
}

type SendResult =
  | { ok: true; simulated?: true }
  | { ok: false; error: string };

async function sendViaResend(params: {
  to: string;
  subject: string;
  body: string;
  attachmentBase64?: string;
  attachmentFilename?: string;
}): Promise<SendResult> {
  const hasAttachment = Boolean(params.attachmentBase64 && params.attachmentFilename);
  try {
    const resend = new Resend(RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: RESEND_FROM,
      to: params.to,
      subject: params.subject,
      text: params.body,
      // Le From reste le domaine technique vérifié par Resend — c'est le
      // Reply-To qui fait qu'un "Répondre" dans n'importe quelle boîte
      // mail atterrit directement sur l'adresse du club, jamais sur
      // onboarding@resend.dev.
      replyTo: EMAIL_REPLY_TO,
      attachments: hasAttachment
        ? [
            {
              filename: params.attachmentFilename as string,
              content: Buffer.from(params.attachmentBase64 as string, "base64"),
            },
          ]
        : undefined,
    });
    // Resend répond 200 avec un `error` en payload plutôt que de lever une
    // exception sur un envoi rejeté (domaine non vérifié, destinataire
    // invalide...) — à vérifier explicitement, sinon un échec ressemblerait
    // à un succès.
    if (error) {
      return { ok: false, error: `Envoi impossible : ${error.message}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `Envoi impossible : ${err.message}` : "Envoi impossible.",
    };
  }
}

async function sendViaGmail(params: {
  to: string;
  subject: string;
  body: string;
  attachmentBase64?: string;
  attachmentFilename?: string;
}): Promise<SendResult> {
  const hasAttachment = Boolean(params.attachmentBase64 && params.attachmentFilename);
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  try {
    await transporter.sendMail({
      from: `UBAC <${GMAIL_USER}>`,
      to: params.to,
      subject: params.subject,
      text: params.body,
      replyTo: EMAIL_REPLY_TO,
      attachments: hasAttachment
        ? [
            {
              filename: params.attachmentFilename as string,
              content: Buffer.from(params.attachmentBase64 as string, "base64"),
              contentType: "application/pdf",
            },
          ]
        : undefined,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `Envoi impossible : ${err.message}` : "Envoi impossible.",
    };
  }
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  attachmentBase64?: string;
  attachmentFilename?: string;
}): Promise<SendResult> {
  const gmailAvailable = Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);

  if (RESEND_API_KEY) {
    const result = await sendViaResend(params);
    if (result.ok) return result;
    if (gmailAvailable) return sendViaGmail(params);
    return result;
  }

  if (gmailAvailable) {
    return sendViaGmail(params);
  }

  // Aucun fournisseur configuré — typiquement en local, où RESEND_API_KEY
  // n'est pas forcément renseignée dans .env.local. On simule plutôt que
  // d'échouer : la page qui a déclenché l'envoi continue de fonctionner
  // normalement (pas de 500, pas de blocage), et le contenu de l'email
  // "envoyé" reste inspectable dans les logs du serveur de dev. Les
  // appelants qui font aussi foi d'un envoi réel (ex. le cron des
  // relances, qui marque une cotisation comme relancée) doivent traiter
  // `simulated: true` comme "rien n'est réellement parti".
  console.info("Email simulé pour :", params.to, "| Objet :", params.subject);
  return { ok: true, simulated: true };
}
