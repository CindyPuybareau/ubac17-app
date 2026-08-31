// Every mail leaving the app is signed by the club, never by the
// individual Bureau member who happens to click "Envoyer". Single source
// of truth shared by the Cotisations relances and the Membres mail modal.
export const EMAIL_SIGNATURE = "Sportivement,\nL'équipe UBAC";

// L'expéditeur technique (Resend) n'est jamais une boîte que quelqu'un
// relève — c'est cette adresse qui doit recevoir les réponses. Posée en
// Reply-To sur chaque envoi (voir send-email.ts) plutôt qu'en From : le
// From reste le domaine technique/vérifié par Resend, mais "Répondre"
// dans n'importe quel client mail atterrit directement ici.
export const EMAIL_REPLY_TO = "ubac17.basket@gmail.com";

// Recognised on the normalised text (curly apostrophes, casing) so a
// hand-typed variant is never doubled by withSignature().
const SIGNATURE_MARKER = "l'équipe ubac";

function normalizeApostrophes(text: string) {
  // 1:1 substitution — indexes stay valid against the original string.
  return text.replace(/’/g, "'");
}

// Start offset of the signature block, including the "Sportivement," line
// above it when present; -1 when the body isn't signed yet.
export function signatureIndex(body: string) {
  const normalized = normalizeApostrophes(body);
  const markerIdx = normalized.toLowerCase().lastIndexOf(SIGNATURE_MARKER);
  if (markerIdx === -1) return -1;
  // Un simple lastIndexOf() se déclenchait sur n'importe quelle mention de
  // "l'équipe UBAC" en plein milieu d'une phrase ("...toute l'équipe UBAC
  // vous souhaite une bonne rentrée.") — withSignature() croyait alors le
  // message déjà signé et n'ajoutait jamais la vraie signature. On exige
  // que la mention commence bien sa PROPRE ligne (juste après un retour à
  // la ligne, ou en tout début de texte).
  const isStartOfLine = markerIdx === 0 || normalized[markerIdx - 1] === "\n";
  if (!isStartOfLine) return -1;
  const before = normalized.slice(0, markerIdx).trimEnd();
  const lastBreak = before.lastIndexOf("\n");
  const lastLine = before.slice(lastBreak + 1).trim();
  return /^sportivement,?$/i.test(lastLine) ? lastBreak + 1 : markerIdx;
}

// Pas exportée (nettoyage du 31/08) : utilisée uniquement par
// withSignature ci-dessous, jamais ailleurs dans le repo.
function hasSignature(body: string) {
  return signatureIndex(body) !== -1;
}

// Applied to every outgoing body right before sending, so a message the
// Bureau rewrote by hand in a preview modal still goes out signed.
export function withSignature(body: string) {
  const trimmed = body.trimEnd();
  if (hasSignature(trimmed)) return trimmed;
  return trimmed ? `${trimmed}\n\n${EMAIL_SIGNATURE}` : EMAIL_SIGNATURE;
}

// mailto: links depend on the browser/OS having a mail client registered
// as the default handler for that protocol — most users never set this
// up, so clicking one silently opens a blank inbox instead of a prefilled
// draft (the exact bug Cindy hit). Gmail's own compose URL bypasses that
// entirely: it opens Gmail's actual compose window, in-browser, with
// fields genuinely filled in, as long as the user is signed into Gmail.
export function buildGmailComposeLink(params: {
  to?: string;
  bcc?: string;
  subject?: string;
  body?: string;
}): string {
  const query = new URLSearchParams({ view: "cm", fs: "1" });
  if (params.to) query.set("to", params.to);
  if (params.bcc) query.set("bcc", params.bcc);
  if (params.subject) query.set("su", params.subject);
  if (params.body) query.set("body", params.body);
  return `https://mail.google.com/mail/?${query.toString()}`;
}
