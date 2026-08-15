// Logique de calcul et gabarits de relance des cotisations — extraits de
// cotisation-participants-table.tsx (qui porte "use client") pour rester
// importables depuis du code serveur pur : bureau-dashboard.tsx (Server
// Component) et /api/cron/bureau-alerts (Route Handler, hors de l'arbre
// React) en ont besoin sans jamais rendre le moindre composant React —
// même principe que event-style.ts, hors de calendar-view.tsx pour la
// même raison.
import { EMAIL_SIGNATURE } from "@/lib/email";
import { formatFirstName, formatLastName } from "@/lib/names";
import type { AdminCotisation } from "./page";

export type StatusKey = "PAYE" | "PARTIEL" | "OFFERT" | "EN_ATTENTE";

export function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}

export function due(c: AdminCotisation) {
  return Math.max(0, roundCents((c.prix ?? 0) - (c.remise ?? 0)));
}

export function balanceDue(c: AdminCotisation) {
  return Math.max(0, roundCents(due(c) - (c.paiement ?? 0)));
}

// Always derived live from the amounts — Payé (solde <= 0), Partiel (au
// moins un versement mais solde > 0), En attente (rien versé) — except
// "Offert" which stays a manual override from the club's own import/
// designation (dirigeant, coach...): that's not an amount concept, so it
// can never be derived and always wins regardless of what's been paid.
export function computeStatus(c: AdminCotisation): StatusKey {
  if (c.statut === "OFFERT") return "OFFERT";
  const d = due(c);
  const paid = c.paiement ?? 0;
  if (d <= 0 || paid >= d) return "PAYE";
  if (paid > 0) return "PARTIEL";
  return "EN_ATTENTE";
}

// Amounts are derived from floating-point arithmetic (prix - remise,
// running sums), which produces values like 2613.0899999999997 — round to
// cents and use French thousands/decimal separators.
export function formatAmount(value: number | null | undefined) {
  const cents = Math.round((value ?? 0) * 100);
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

// Same "NOM" convention as the Membres table: last name shown fully
// uppercase, falling back to the free-text playerName when a cotisation's
// player row doesn't carry split first/last name fields (older imports).
export function cotisationLastName(c: AdminCotisation) {
  return formatLastName(c.lastName) || c.playerName || "—";
}

export function cotisationFirstName(c: AdminCotisation) {
  return c.firstName ? formatFirstName(c.firstName) : "—";
}

// Plain number for the {tarif}/{paye}/{solde} placeholders — the templates
// already write the € sign themselves ("Montant : {tarif} €"), so this
// deliberately doesn't use formatAmount's currency formatting (that would
// print "160,00 € €").
export function formatPlaceholderAmount(value: number | null | undefined) {
  const cents = Math.round((value ?? 0) * 100);
  return (cents / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export type RelanceTemplateKey = "EN_ATTENTE" | "PARTIEL" | "PAYE";

export const RELANCE_TEMPLATES: Record<RelanceTemplateKey, { subject: string; body: string }> = {
  EN_ATTENTE: {
    subject: "UBAC Basket - Rappel pour votre cotisation",
    body: `Bonjour {prenom}, sauf erreur de notre part, nous n'avons pas encore reçu votre règlement concernant la cotisation de cette saison (Montant : {tarif} €). Merci de bien vouloir faire le nécessaire ou de contacter le bureau en cas de besoin.\n\n${EMAIL_SIGNATURE}`,
  },
  PARTIEL: {
    subject: "UBAC Basket - Solde de votre cotisation",
    body: `Bonjour {prenom}, nous vous remercions pour vos premiers versements. Nous vous rappelons qu'il reste un solde de {solde} € à régler sur votre cotisation (Cotisation globale : {tarif} €, déjà réglé : {paye} €). Merci de régulariser ce solde prochainement.\n\n${EMAIL_SIGNATURE}`,
  },
  PAYE: {
    subject: "UBAC Basket - Attestation & Confirmation de cotisation à jour",
    body: `Bonjour {prenom}, nous vous confirmons que votre cotisation pour cette saison est entièrement réglée ({tarif} €). Un grand merci pour votre engagement au sein du club ! Votre reçu/attestation reste disponible auprès du bureau si besoin.\n\n${EMAIL_SIGNATURE}`,
  },
};

// OFFERT (waived by the club) has nothing left to chase, same as PAYE —
// reuse the "confirmation" wording rather than inventing a 4th template
// the ticket doesn't ask for.
export function relanceTemplateKeyFor(c: AdminCotisation): RelanceTemplateKey {
  const status = computeStatus(c);
  return status === "PARTIEL" || status === "EN_ATTENTE" ? status : "PAYE";
}

export function renderRelanceTemplate(text: string, c: AdminCotisation) {
  return text
    .replace(/\{prenom\}/g, cotisationFirstName(c))
    .replace(/\{nom\}/g, cotisationLastName(c))
    .replace(/\{tarif\}/g, formatPlaceholderAmount(c.prix))
    .replace(/\{paye\}/g, formatPlaceholderAmount(c.paiement))
    .replace(/\{solde\}/g, formatPlaceholderAmount(balanceDue(c)));
}
