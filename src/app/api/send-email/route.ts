import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

// Two supported providers, in priority order:
//
// 1. Resend (RESEND_API_KEY) — the recommended one: a plain API key, no
//    mailbox credentials needed. RESEND_FROM must be an address on a
//    domain verified in the Resend dashboard (ex: "UBAC
//    <cotisations@ubac17.fr>"); without a verified domain Resend only
//    delivers to the account owner's own address.
// 2. Gmail SMTP (GMAIL_USER + GMAIL_APP_PASSWORD) — the historical path,
//    kept working so nothing breaks for whoever already has the club
//    mailbox's app password set up.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM ?? "UBAC <onboarding@resend.dev>";
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

export async function POST(request: Request) {
  const { to, subject, body, attachmentBase64, attachmentFilename } = await request.json();

  if (!to || !subject || !body) {
    return NextResponse.json(
      { error: "Destinataire, objet et message sont requis." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

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
          ? [{ filename: attachmentFilename, content: Buffer.from(attachmentBase64, "base64") }]
          : undefined,
      });
      // Resend answers 200 with an `error` payload rather than throwing on
      // a rejected send (unverified domain, invalid recipient...), so this
      // has to be checked explicitly or a failure would look like success.
      if (error) {
        return NextResponse.json(
          { error: `Envoi impossible : ${error.message}` },
          { status: 502 }
        );
      }
      return NextResponse.json({ success: true });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error ? `Envoi impossible : ${err.message}` : "Envoi impossible.",
        },
        { status: 502 }
      );
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
                filename: attachmentFilename,
                content: Buffer.from(attachmentBase64, "base64"),
                contentType: "application/pdf",
              },
            ]
          : undefined,
      });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error ? `Envoi impossible : ${err.message}` : "Envoi impossible.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    {
      error:
        "Service d'envoi d'emails non configuré. Veuillez renseigner RESEND_API_KEY dans les variables d'environnement Vercel.",
    },
    { status: 503 }
  );
}
