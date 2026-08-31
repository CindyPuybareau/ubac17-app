import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/send-email";
import { matchAndUpsertPlayer, type RegistrationInput } from "@/lib/inscription-matching";

// Reçoit une soumission du formulaire Google de pré-inscription (poussée
// par un petit script Apps Script côté Google, voir la documentation
// donnée à Cindy le 31/08) et crée/met à jour la fiche correspondante,
// avec la même logique de correspondance/fusion/suggestion d'équipe que
// l'import Excel "Suivi Inscriptions". Protégé par INSCRIPTION_WEBHOOK_SECRET
// : fermé par défaut (fail closed), même principe que CRON_SECRET pour
// les tâches planifiées — sans cette variable posée côté Vercel, la route
// refuse tout appel plutôt que de rester ouverte à qui la devine.
export async function POST(request: Request) {
  const secret = process.env.INSCRIPTION_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "INSCRIPTION_WEBHOOK_SECRET non configuré." },
      { status: 500 }
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  let body: Partial<RegistrationInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  if (!body.firstName || !body.lastName) {
    return NextResponse.json({ error: "Nom ou prénom manquant." }, { status: 400 });
  }

  const input: RegistrationInput = {
    firstName: body.firstName,
    lastName: body.lastName,
    birthDate: body.birthDate ?? null,
    sex: body.sex ?? null,
    licenseType: body.licenseType ?? null,
    parentEmail: body.parentEmail ?? null,
    registrationEmail: body.registrationEmail ?? null,
    registrationPhone: body.registrationPhone ?? null,
    address: body.address ?? null,
    postalCode: body.postalCode ?? null,
    city: body.city ?? null,
    secondaryEmail: body.secondaryEmail ?? null,
    motherPhone: body.motherPhone ?? null,
    fatherPhone: body.fatherPhone ?? null,
    otherPhones: body.otherPhones ?? null,
    secondaryAddress: body.secondaryAddress ?? null,
    licenseNumber: body.licenseNumber ?? null,
    membershipType: body.membershipType ?? null,
    fbiStatus: body.fbiStatus ?? null,
    medicalNotes: body.medicalNotes ?? null,
    otherNotes: body.otherNotes ?? null,
    imageRights: body.imageRights ?? null,
    playerCharterAccepted: body.playerCharterAccepted ?? null,
    parentCharterAccepted: body.parentCharterAccepted ?? null,
  };

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const result = await matchAndUpsertPlayer(supabase, input);

  if (result.kind === "error") {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  if (result.kind === "uncertain") {
    // Aucune fiche créée/modifiée — retour de Cindy du 31/08 : "on part
    // simple", pas de nouvel écran de vérification, juste un email pour
    // que le Bureau s'en occupe à la main, comme pour les autres alertes
    // déjà en place.
    const emailResult = await sendEmail({
      to: "ubac17.basket@gmail.com",
      subject: `UBAC — Inscription à vérifier : ${input.firstName} ${input.lastName}`,
      body: `Bonjour,\n\nUne inscription reçue via le formulaire n'a pas pu être rattachée automatiquement à une fiche Membres :\n\n${input.firstName} ${input.lastName}, né(e) le ${input.birthDate ?? "date inconnue"}.\n\nUn membre du même nom existe déjà en base (${result.candidateName}), mais sa date de naissance ne correspond pas — pour ne jamais fusionner deux personnes différentes par erreur, rien n'a été créé ni modifié automatiquement.\n\nMerci de vérifier dans l'onglet Membres et de créer/rattacher la fiche à la main si besoin.\n\nSportivement,\nL'appli UBAC`,
    });
    if (!emailResult.ok) {
      console.error("[inscription-webhook] envoi de l'email de vérification échoué:", emailResult.error);
    }
    return NextResponse.json({ status: "uncertain" });
  }

  if (result.kind === "inserted") {
    // Vraie nouvelle fiche (audit du 31/08, retour de Cindy) : le Bureau
    // est notifié à chaque arrivée au coup par coup — jamais pour l'import
    // Excel groupé, qui a son propre résumé à l'écran.
    const bureauEmail = await sendEmail({
      to: "ubac17.basket@gmail.com",
      subject: `UBAC — Nouveau membre : ${input.firstName} ${input.lastName}`,
      body: `Bonjour,\n\n${input.firstName} ${input.lastName} vient d'être ajouté(e) dans Membres via le formulaire d'inscription.\n\nSportivement,\nL'appli UBAC`,
    });
    if (!bureauEmail.ok) {
      console.error("[inscription-webhook] email nouveau membre échoué:", bureauEmail.error);
    }
  }

  return NextResponse.json({
    status: result.kind,
    playerId: result.playerId,
    teamAssigned: result.teamAssigned,
  });
}
