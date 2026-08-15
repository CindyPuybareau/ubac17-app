import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emailProviderConfigured, sendEmail } from "@/lib/send-email";

// Lets the client know upfront whether automatic sending is available, so
// the relance modal can offer the right button (direct 1-click send vs
// guided manual draft) instead of only finding out after a failed POST —
// which would also mean opening Gmail after an async gap, i.e. straight
// into the browser's popup blocker.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const provider = emailProviderConfigured();
  return NextResponse.json({ configured: provider !== null, provider });
}

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

  const result = await sendEmail({ to, subject, body, attachmentBase64, attachmentFilename });

  if (!result.ok) {
    const status = result.error.startsWith("Service d'envoi") ? 503 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true });
}
