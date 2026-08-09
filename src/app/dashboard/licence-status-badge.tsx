// Shared badge for the FFBB licence progress (players.fbi_status). The
// stored value is free text — it comes from the club's own Excel import
// and from the "Statut FBI" dropdown in the member fiche — so it is never
// rewritten here: it is displayed verbatim and only colour-coded on the
// words it contains, which keeps unknown or future wordings readable
// instead of mislabelled.
//
// Vocabulary currently offered by member-detail-modal.tsx / add-member-modal.tsx:
//   "En attente saisie adhérent", "En cours de saisie",
//   "Licence générée", "A valider groupement sportif"
// plus "Qualifié" / "Validé" seen in imported data.
type Tone = { className: string; dotClassName: string };

const SAISIE: Tone = { className: "bg-orange-100 text-orange-700", dotClassName: "bg-orange-500" };
const GENEREE: Tone = { className: "bg-zinc-100 text-zinc-600", dotClassName: "bg-zinc-400" };
const A_VALIDER: Tone = { className: "bg-blue-100 text-blue-700", dotClassName: "bg-blue-500" };
const QUALIFIE: Tone = { className: "bg-green-100 text-green-700", dotClassName: "bg-green-500" };
const INCONNU: Tone = { className: "bg-zinc-100 text-zinc-600", dotClassName: "bg-zinc-400" };

// Accents are stripped before matching so "générée" and "generee" (and
// whatever casing the Excel used) all land on the same tone.
function normalize(status: string) {
  return status
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function licenceStatusTone(status: string): Tone {
  const s = normalize(status);
  // "A valider" must be tested before "valide", since it contains it —
  // otherwise a licence still awaiting the club would show up green.
  if (s.includes("a valider") || s.includes("groupement")) return A_VALIDER;
  if (s.includes("qualifi") || s.includes("valide") || s.includes("actif")) return QUALIFIE;
  if (s.includes("gener")) return GENEREE;
  if (s.includes("saisie") || s.includes("attente")) return SAISIE;
  return INCONNU;
}

export default function LicenceStatusBadge({ status }: { status: string | null | undefined }) {
  const value = status?.trim() ?? "";
  if (!value) return <span className="text-zinc-300">—</span>;
  const tone = licenceStatusTone(value);
  return (
    <span
      title={value}
      className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${tone.className}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dotClassName}`} />
      <span className="truncate">{value}</span>
    </span>
  );
}
