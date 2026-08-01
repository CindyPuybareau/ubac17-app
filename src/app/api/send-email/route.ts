import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";

// Gmail SMTP requires a Google "App Password" (16 chars, generated at
// myaccount.google.com/apppasswords once 2-Step Verification is on for
// the account) — the account's normal login password won't authenticate
// here. Both env vars are set directly in Vercel (Project Settings ->
// Environment Variables), never passed through the app itself.
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

export async function POST(request: Request) {
  const { to, subject, body } = await request.json();

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

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return NextResponse.json(
      {
        error:
          "Envoi automatique non configuré : GMAIL_USER et GMAIL_APP_PASSWORD doivent être définis dans les variables d'environnement Vercel.",
      },
      { status: 503 }
    );
  }

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
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Envoi impossible : ${err.message}`
            : "Envoi impossible.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
