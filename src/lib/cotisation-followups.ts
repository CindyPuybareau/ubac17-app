// Suivis "comptable" d'une cotisation (retour de Cindy du 18/11, "si
// j'étais comptable") : aides Pass'Sport / Coupons Sport ANCV et
// remboursements -- deux suivis d'argent tenus jusqu'ici à la main dans le
// fichier du Bureau (colonnes "Pass et/ou Chèque Sport", "Statut Pass et/ou
// Sport" et "Remboursement"). Tables cotisation_aids / cotisation_refunds
// (migration 20261121110000), réservées au Bureau.
//
// Module pur (aucun import React ni client Supabase) : utilisé par la page
// serveur (chargement), l'import du fichier et les composants client.

export type AidKind = "PASS_SPORT" | "ANCV";
export type AidStatus = "A_DECLARER" | "DECLAREE" | "RECUE";
export type RefundStatus = "A_FAIRE" | "FAIT";

export type CotisationAid = {
  id: string;
  kind: AidKind;
  code: string | null;
  amount: number | null;
  status: AidStatus;
  batch: string | null;
};

export type CotisationRefund = {
  id: string;
  amount: number;
  reason: string | null;
  ribReceived: boolean;
  status: RefundStatus;
  doneAt: string | null;
  fromImport: boolean;
};

export const AID_KIND_LABEL: Record<AidKind, string> = {
  PASS_SPORT: "Pass Sport",
  ANCV: "Coupon Sport ANCV",
};

export const AID_STATUS_LABEL: Record<AidStatus, string> = {
  A_DECLARER: "À déclarer",
  DECLAREE: "Déclarée",
  RECUE: "Reçue",
};

// Un réimport du fichier ne fait jamais reculer une aide déjà plus avancée
// dans l'appli (ex. "Reçue" saisie ici, le fichier dit encore "Enregistré").
export const AID_STATUS_RANK: Record<AidStatus, number> = { A_DECLARER: 0, DECLAREE: 1, RECUE: 2 };
export const REFUND_STATUS_RANK: Record<RefundStatus, number> = { A_FAIRE: 0, FAIT: 1 };

export type ParsedAid = { kind: AidKind; code: string; status: AidStatus; batch: string | null };

function aidKindFromPrefix(prefix: string): AidKind {
  return prefix.toUpperCase() === "PS" ? "PASS_SPORT" : "ANCV";
}

function statusFromText(text: string): AidStatus {
  if (/re[çc]u|rembours|vers[ée]/i.test(text)) return "RECUE";
  if (/enregistr|d[ée]clar/i.test(text)) return "DECLAREE";
  return "A_DECLARER";
}

// "PS: 26-NFLL-PCED", "CS: 83F51G58 / CS: 4DR7RF53", "CS:CTRNB24T / PS: 26-VQHM-LDDG"
// + statut "Enregistré (14)", "Enregistré (11 et 12)", "CS: Enregistré (5) / PS: Enregistré".
export function parseAidsFromFile(codesText: string | null, statusText: string | null): ParsedAid[] {
  const codes: { kind: AidKind; code: string }[] = [];
  for (const m of (codesText ?? "").matchAll(/\b(PS|CS)\s*:\s*([A-Z0-9][A-Z0-9-]*)/gi)) {
    codes.push({ kind: aidKindFromPrefix(m[1]), code: m[2].toUpperCase() });
  }
  if (codes.length === 0) return [];

  // Statut : soit un seul pour tout, soit un par type ("CS: … / PS: …").
  const parts = (statusText ?? "").split("/").map((p) => p.trim()).filter(Boolean);
  const byKind = new Map<AidKind | "ALL", { status: AidStatus; batches: string[] }>();
  for (const part of parts) {
    const prefix = part.match(/^(PS|CS)\s*:/i);
    const key: AidKind | "ALL" = prefix ? aidKindFromPrefix(prefix[1]) : "ALL";
    const inParens = part.match(/\(([^)]*)\)/);
    const batches = inParens ? Array.from(inParens[1].matchAll(/\d+/g)).map((n) => n[0]) : [];
    byKind.set(key, { status: statusFromText(part), batches });
  }

  const counters = new Map<AidKind | "ALL", number>();
  return codes.map((c) => {
    const key: AidKind | "ALL" = byKind.has(c.kind) ? c.kind : "ALL";
    const info = byKind.get(key);
    if (!info) return { ...c, status: "A_DECLARER", batch: null };
    const sameGroupCount = key === "ALL" ? codes.length : codes.filter((x) => x.kind === key).length;
    const index = counters.get(key) ?? 0;
    counters.set(key, index + 1);
    // Autant de n° de lot que de codes : un chacun ; sinon le texte entier.
    const batch =
      info.batches.length === 0
        ? null
        : info.batches.length === sameGroupCount
          ? info.batches[index]
          : info.batches.join(" et ");
    return { ...c, status: info.status, batch };
  });
}

export type ParsedRefund = { amount: number; status: RefundStatus; ribReceived: boolean; reason: string | null };

// "Fait: 20€ (FT)", "A faire: 160€", "A faire: 30€ (RIB ok)", "A faire: 15€ (attente RIB)", "A faire: 162,09"
export function parseRefundFromFile(text: string | null): ParsedRefund | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(fait|[àa]\s*faire)\s*:?\s*([\d\s]+(?:[.,]\d+)?)\s*€?\s*(.*)$/i);
  if (!m) return null;
  const amount = Number(m[2].replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const status: RefundStatus = /^fait/i.test(m[1]) ? "FAIT" : "A_FAIRE";
  const rest = m[3].trim();
  const ribReceived = status === "FAIT" || /rib\s*ok/i.test(rest);
  const reason =
    rest
      .replace(/[()]/g, " ")
      .replace(/rib\s*ok|attente\s*rib/gi, " ")
      .replace(/\s+/g, " ")
      .trim() || null;
  return { amount: Math.round(amount * 100) / 100, status, ribReceived, reason };
}

// Lignes brutes de la base -> types de l'appli.
export function mapAidRow(r: {
  id: string;
  kind: string;
  code: string | null;
  amount: number | string | null;
  status: string;
  batch: string | null;
}): CotisationAid {
  return {
    id: r.id,
    kind: r.kind === "PASS_SPORT" ? "PASS_SPORT" : "ANCV",
    code: r.code,
    amount: r.amount == null ? null : Number(r.amount),
    status: r.status === "RECUE" ? "RECUE" : r.status === "DECLAREE" ? "DECLAREE" : "A_DECLARER",
    batch: r.batch,
  };
}

export function mapRefundRow(r: {
  id: string;
  amount: number | string;
  reason: string | null;
  rib_received: boolean;
  status: string;
  done_at: string | null;
  import_key: string | null;
}): CotisationRefund {
  return {
    id: r.id,
    amount: Number(r.amount),
    reason: r.reason,
    ribReceived: r.rib_received,
    status: r.status === "FAIT" ? "FAIT" : "A_FAIRE",
    doneAt: r.done_at,
    fromImport: r.import_key !== null,
  };
}
