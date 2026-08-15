import nodemailer from "nodemailer";
import { Resend } from "resend";

// Deux fournisseurs supportés, par ordre de priorité — voir la logique
// originale dans /api/send-email/route.ts, extraite ici pour être
// réutilisable par un contexte serveur sans session (ex. une tâche cron),
// qui ne peut pas passer par la route HTTP (protégée par une session
// utilisateur authentifiée).
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM ?? "UBAC <onboarding@resend.dev>";
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

export function emailProviderConfigured(): "resend" | "gmail" | null {
  if (RESEND_API_KEY) return "resend";
  if (GMAIL_USER && GMAIL_APP_PASSWORD) return "gmail";
  return null;
}

export async function sendEmail({
  to,
  subject,
  body,
  attachmentBase64,
  attachmentFilename,
}: {
  to: string;
  subject: string;
  body: string;
  attachmentBase64?: string;
  attachmentFilename?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const hasAttachment = Boolean(attachmentBase64 && attachmentFilename);

  if (RESEND_API_KEY) {
    try {
      const resend = new Resend(RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: RESEND_FROM,
        to,
        subject,
        text: body,
        attachments: hasAttachment
          ? [
              {
                filename: attachmentFilename as string,
                content: Buffer.from(attachmentBase64 as string, "base64"),
              },
            ]
          : undefined,
      });
      // Resend répond 200 avec un `error` en payload plutôt que de lever
      // une exception sur un envoi rejeté (domaine non vérifié,
      // destinataire invalide...) — à vérifier explicitement, sinon un
      // échec ressemblerait à un succès.
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

  if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    try {
      await transporter.sendMail({
        from: `UBAC <${GMAIL_USER}>`,
        to,
        subject,
        text: body,
        attachments: hasAttachment
          ? [
              {
                filename: attachmentFilename as string,
                content: Buffer.from(attachmentBase64 as string, "base64"),
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

  return {
    ok: false,
    error:
      "Service d'envoi d'emails non configuré. Veuillez renseigner RESEND_API_KEY dans les variables d'environnement Vercel.",
  };
}
