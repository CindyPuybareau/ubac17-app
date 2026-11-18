"use client";

// Suivis comptables d'une cotisation (retour de Cindy du 18/11, "si j'étais
// comptable") : aides Pass'Sport / Coupons Sport ANCV (à déclarer ->
// déclarée -> reçue) et remboursements (à faire -> fait). Deux blocs :
// - FollowUpPanels : en haut de la page Cotisations, ce qui reste à faire ;
// - FollowUpEditor : dans la fiche "Cotisation & Paiements" d'une personne.
// Bureau seul (RLS "admin manage cotisation_aids/refunds").
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BadgeEuro, Check, ChevronDown, ChevronUp, ClipboardCheck, Plus, Ticket, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  AID_KIND_LABEL,
  AID_STATUS_LABEL,
  type AidKind,
  type CotisationAid,
  type CotisationRefund,
} from "@/lib/cotisation-followups";
import ConfirmDialog from "./confirm-dialog";
import { categoryTheme } from "./team-card";
import { cotisationFirstName, cotisationLastName, formatAmount, roundCents } from "./cotisation-shared";
import type { AdminCotisation } from "./page";

const pillBase = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50";
const navyPill = `${pillBase} border-navy/20 bg-navy/5 text-navy hover:bg-navy/10`;
const greenPill = `${pillBase} border-court-green/30 bg-court-green/10 text-court-green hover:bg-court-green/15`;

const AID_STATUS_CLASS: Record<CotisationAid["status"], string> = {
  A_DECLARER: "bg-coral/15 text-coral-dark",
  DECLAREE: "bg-amber-100 text-amber-800",
  RECUE: "bg-court-green/15 text-court-green",
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Écritures partagées par les deux blocs : une requête par geste, suivie de
// router.refresh() (Realtime prévient aussi les autres écrans ouverts).
function useFollowUpActions() {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, action: () => PromiseLike<{ error: { message: string } | null; data: unknown[] | null }>) {
    setBusyId(id);
    setError(null);
    const { error: e, data } = await action();
    setBusyId(null);
    if (e || !data || data.length === 0) {
      setError(e ? e.message : "Rien n'a été enregistré (droits d'accès). Rechargez la page et réessayez.");
      return false;
    }
    router.refresh();
    return true;
  }

  const supabase = createClient();
  return {
    busyId,
    error,
    setAidStatus: (aid: CotisationAid, status: CotisationAid["status"], batch?: string | null) =>
      run(aid.id, () =>
        supabase
          .from("cotisation_aids")
          .update({
            status,
            batch: batch === undefined ? aid.batch : batch,
            status_changed_at: new Date().toISOString(),
          })
          .eq("id", aid.id)
          .select("id")
      ),
    setRefund: (refund: CotisationRefund, patch: { status?: CotisationRefund["status"]; ribReceived?: boolean }) =>
      run(refund.id, () =>
        supabase
          .from("cotisation_refunds")
          .update({
            ...(patch.status ? { status: patch.status, done_at: patch.status === "FAIT" ? todayIso() : null } : {}),
            ...(patch.ribReceived !== undefined ? { rib_received: patch.ribReceived } : {}),
          })
          .eq("id", refund.id)
          .select("id")
      ),
    addAid: (cotisationId: string, kind: AidKind, code: string, amount: number | null) =>
      run("new-aid", () =>
        supabase
          .from("cotisation_aids")
          .insert({
            cotisation_id: cotisationId,
            kind,
            code: code.trim().toUpperCase() || null,
            amount,
            status: "A_DECLARER",
            status_changed_at: new Date().toISOString(),
          })
          .select("id")
      ),
    addRefund: (cotisationId: string, amount: number, reason: string, ribReceived: boolean) =>
      run("new-refund", () =>
        supabase
          .from("cotisation_refunds")
          .insert({ cotisation_id: cotisationId, amount, reason: reason.trim() || null, rib_received: ribReceived })
          .select("id")
      ),
    deleteAid: (id: string) =>
      run(id, () => supabase.from("cotisation_aids").delete().eq("id", id).select("id")),
    deleteRefund: (id: string) =>
      run(id, () => supabase.from("cotisation_refunds").delete().eq("id", id).select("id")),
  };
}

// "Déclarée" demande le n° de lot (le "Enregistré (14)" du fichier).
function DeclareAidButton({
  aid,
  busy,
  onDeclare,
}: {
  aid: CotisationAid;
  busy: boolean;
  onDeclare: (batch: string | null) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [batch, setBatch] = useState("");
  if (!asking) {
    return (
      <button type="button" disabled={busy} onClick={() => setAsking(true)} className={navyPill}>
        <ClipboardCheck className="h-3.5 w-3.5" />
        Déclarée
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <input
        autoFocus
        value={batch}
        onChange={(e) => setBatch(e.target.value)}
        placeholder="N° de lot"
        aria-label={`N° de lot pour ${aid.code ?? AID_KIND_LABEL[aid.kind]}`}
        className="w-24 rounded-full border border-zinc-200 px-3 py-1.5 text-xs"
      />
      <button type="button" disabled={busy} onClick={() => onDeclare(batch.trim() || null)} className={navyPill}>
        <Check className="h-3.5 w-3.5" />
        OK
      </button>
    </span>
  );
}

function AidLine({
  aid,
  busy,
  actions,
  onDelete,
}: {
  aid: CotisationAid;
  busy: boolean;
  actions: ReturnType<typeof useFollowUpActions>;
  onDelete?: () => void;
}) {
  return (
    // Même mise en page sur chaque carte (retour de Cindy du 18/11, "le
    // responsive est à revoir") : à gauche le type, le code et le statut
    // dessous ; à droite le bouton, centré verticalement.
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
          <span className="font-semibold text-zinc-800">{AID_KIND_LABEL[aid.kind]}</span>
          {aid.code && <span className="break-all font-mono text-zinc-600">{aid.code}</span>}
          {aid.amount != null && <span className="font-semibold tabular-nums text-zinc-800">{formatAmount(aid.amount)}</span>}
        </p>
        <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${AID_STATUS_CLASS[aid.status]}`}>
          {AID_STATUS_LABEL[aid.status]}
          {aid.batch ? ` · lot ${aid.batch}` : ""}
        </span>
      </div>
      <span className="flex shrink-0 items-center gap-1">
        {aid.status === "A_DECLARER" && (
          <DeclareAidButton aid={aid} busy={busy} onDeclare={(batch) => actions.setAidStatus(aid, "DECLAREE", batch)} />
        )}
        {aid.status === "DECLAREE" && (
          <button type="button" disabled={busy} onClick={() => actions.setAidStatus(aid, "RECUE")} className={greenPill}>
            <Check className="h-3.5 w-3.5" />
            Reçue
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Supprimer cette aide"
            className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </div>
  );
}

function RefundLine({
  refund,
  busy,
  actions,
  onDelete,
}: {
  refund: CotisationRefund;
  busy: boolean;
  actions: ReturnType<typeof useFollowUpActions>;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
        <span className="font-semibold text-zinc-800">Remboursement</span>
        <span className="font-semibold tabular-nums text-zinc-800">{formatAmount(refund.amount)}</span>
        {refund.reason && <span className="text-zinc-600">{refund.reason}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          refund.status === "FAIT" ? "bg-court-green/15 text-court-green" : "bg-coral/15 text-coral-dark"
        }`}
      >
        {refund.status === "FAIT" ? `Fait${refund.doneAt ? ` le ${new Date(refund.doneAt).toLocaleDateString("fr-FR")}` : ""}` : "À faire"}
      </span>
      {refund.status === "A_FAIRE" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => actions.setRefund(refund, { ribReceived: !refund.ribReceived })}
          title={refund.ribReceived ? "Le RIB a été reçu (toucher pour annuler)" : "Toucher quand le RIB est reçu"}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            refund.ribReceived ? "bg-court-green/15 text-court-green" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {refund.ribReceived ? "RIB reçu" : "RIB attendu"}
        </button>
      )}
      </div>
      </div>
      <span className="flex shrink-0 items-center gap-1">
        {refund.status === "A_FAIRE" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => actions.setRefund(refund, { status: "FAIT" })}
            className={greenPill}
          >
            <Check className="h-3.5 w-3.5" />
            Fait
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Supprimer ce remboursement"
            className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </div>
  );
}

function CollapsiblePanel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/10 text-navy">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-zinc-900">{title}</span>
          <span className="block text-xs text-zinc-600">{subtitle}</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />}
      </button>
      {open && (
        <div className="grid gap-2 border-t border-zinc-100 px-3 pb-3 pt-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
      )}
    </div>
  );
}

function PersonHeader({ c, onOpen }: { c: AdminCotisation; onOpen: (id: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <button type="button" onClick={() => onOpen(c.id)} className="break-words text-left font-semibold leading-snug text-zinc-900 hover:underline">
        {cotisationLastName(c)} {cotisationFirstName(c)}
      </button>
      {c.category && (
        <span
          className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${categoryTheme(c.category).badge}`}
        >
          {c.category}
        </span>
      )}
    </div>
  );
}

// Bloc de la page Cotisations : ce qui reste à faire, replié par défaut.
export function FollowUpPanels({
  cotisations,
  onOpen,
}: {
  cotisations: AdminCotisation[];
  onOpen: (id: string) => void;
}) {
  const actions = useFollowUpActions();

  const aidItems = useMemo(
    () =>
      cotisations
        .flatMap((c) => (c.aids ?? []).map((aid) => ({ c, aid })))
        .sort(
          (a, b) =>
            (a.aid.status === "A_DECLARER" ? 0 : a.aid.status === "DECLAREE" ? 1 : 2) -
              (b.aid.status === "A_DECLARER" ? 0 : b.aid.status === "DECLAREE" ? 1 : 2) ||
            cotisationLastName(a.c).localeCompare(cotisationLastName(b.c), "fr")
        ),
    [cotisations]
  );
  const refundItems = useMemo(
    () =>
      cotisations
        .flatMap((c) => (c.refunds ?? []).map((refund) => ({ c, refund })))
        .sort(
          (a, b) =>
            (a.refund.status === "A_FAIRE" ? 0 : 1) - (b.refund.status === "A_FAIRE" ? 0 : 1) ||
            cotisationLastName(a.c).localeCompare(cotisationLastName(b.c), "fr")
        ),
    [cotisations]
  );
  if (aidItems.length === 0 && refundItems.length === 0) return null;

  const toDeclare = aidItems.filter((x) => x.aid.status === "A_DECLARER").length;
  const declared = aidItems.filter((x) => x.aid.status === "DECLAREE");
  const received = aidItems.filter((x) => x.aid.status === "RECUE").length;
  const declaredAmount = roundCents(declared.reduce((s, x) => s + (x.aid.amount ?? 0), 0));
  const refundsToDo = refundItems.filter((x) => x.refund.status === "A_FAIRE");
  const refundsToDoAmount = roundCents(refundsToDo.reduce((s, x) => s + x.refund.amount, 0));

  return (
    <div className="flex flex-col gap-3">
      {actions.error && <p className="px-1 text-xs font-semibold text-red-600">{actions.error}</p>}
      {aidItems.length > 0 && (
        <CollapsiblePanel
          icon={<Ticket className="h-4 w-4" />}
          title={`Aides Pass Sport / ANCV · ${aidItems.length}`}
          subtitle={[
            toDeclare > 0 ? `${toDeclare} à déclarer` : null,
            declared.length > 0
              ? `${declared.length} déclarée${declared.length > 1 ? "s" : ""}, en attente${declaredAmount > 0 ? ` (${formatAmount(declaredAmount)})` : ""}`
              : null,
            received > 0 ? `${received} reçue${received > 1 ? "s" : ""}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          {aidItems
            .filter((x) => x.aid.status !== "RECUE")
            .map(({ c, aid }) => (
              <div key={aid.id} className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2.5">
                <PersonHeader c={c} onOpen={onOpen} />
                <div className="mt-1.5">
                  <AidLine aid={aid} busy={actions.busyId === aid.id} actions={actions} />
                </div>
              </div>
            ))}
          {received > 0 && (
            <p className="col-span-full px-1 text-[11px] text-zinc-500">
              Les aides reçues restent visibles dans la fiche de chaque personne.
            </p>
          )}
        </CollapsiblePanel>
      )}
      {refundItems.length > 0 && (
        <CollapsiblePanel
          icon={<BadgeEuro className="h-4 w-4" />}
          title={`Remboursements · ${refundsToDo.length} à faire`}
          subtitle={
            refundsToDo.length > 0
              ? `${formatAmount(refundsToDoAmount)} à rembourser · ${refundsToDo.filter((x) => !x.refund.ribReceived).length} RIB attendu${refundsToDo.filter((x) => !x.refund.ribReceived).length > 1 ? "s" : ""}`
              : "Tout est remboursé"
          }
        >
          {refundItems
            .filter((x) => x.refund.status === "A_FAIRE")
            .map(({ c, refund }) => (
              <div key={refund.id} className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2.5">
                <PersonHeader c={c} onOpen={onOpen} />
                <div className="mt-1.5">
                  <RefundLine refund={refund} busy={actions.busyId === refund.id} actions={actions} />
                </div>
              </div>
            ))}
          {refundItems.length > refundsToDo.length && (
            <p className="col-span-full px-1 text-[11px] text-zinc-500">
              {refundItems.length - refundsToDo.length} remboursement{refundItems.length - refundsToDo.length > 1 ? "s" : ""} déjà fait
              {refundItems.length - refundsToDo.length > 1 ? "s" : ""}, visible{refundItems.length - refundsToDo.length > 1 ? "s" : ""} dans la fiche de chaque personne.
            </p>
          )}
        </CollapsiblePanel>
      )}
    </div>
  );
}

// Bloc de la fiche "Cotisation & Paiements" : tout le suivi d'UNE personne,
// avec ajout d'une aide ou d'un remboursement.
export function FollowUpEditor({ cotisation: c }: { cotisation: AdminCotisation }) {
  const actions = useFollowUpActions();
  const [adding, setAdding] = useState<"aid" | "refund" | null>(null);
  const [aidKind, setAidKind] = useState<AidKind>("PASS_SPORT");
  const [aidCode, setAidCode] = useState("");
  const [aidAmount, setAidAmount] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundRib, setRefundRib] = useState(false);
  const [toDelete, setToDelete] = useState<{ kind: "aid" | "refund"; id: string; label: string } | null>(null);
  const aids = c.aids ?? [];
  const refunds = c.refunds ?? [];

  async function saveAid() {
    const amount = aidAmount.trim() ? Number(aidAmount.replace(",", ".")) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return;
    if (await actions.addAid(c.id, aidKind, aidCode, amount)) {
      setAdding(null);
      setAidCode("");
      setAidAmount("");
    }
  }
  async function saveRefund() {
    const amount = Number(refundAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (await actions.addRefund(c.id, roundCents(amount), refundReason, refundRib)) {
      setAdding(null);
      setRefundAmount("");
      setRefundReason("");
      setRefundRib(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-2">
      <p className="mb-1 text-xs font-semibold text-zinc-500">Aides et remboursements</p>
      <div className="flex flex-col gap-2">
        {aids.map((aid) => (
          <AidLine
            key={aid.id}
            aid={aid}
            busy={actions.busyId === aid.id}
            actions={actions}
            onDelete={() => setToDelete({ kind: "aid", id: aid.id, label: `${AID_KIND_LABEL[aid.kind]}${aid.code ? ` ${aid.code}` : ""}` })}
          />
        ))}
        {refunds.map((refund) => (
          <RefundLine
            key={refund.id}
            refund={refund}
            busy={actions.busyId === refund.id}
            actions={actions}
            onDelete={() => setToDelete({ kind: "refund", id: refund.id, label: `remboursement de ${formatAmount(refund.amount)}` })}
          />
        ))}
        {aids.length === 0 && refunds.length === 0 && adding === null && (
          <p className="text-xs text-zinc-400">Aucune aide ni aucun remboursement.</p>
        )}

        {adding === "aid" && (
          <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-2">
            <div className="flex flex-wrap gap-1.5">
              {(["PASS_SPORT", "ANCV"] as AidKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAidKind(k)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    aidKind === k ? "border-navy bg-navy text-white" : "border-zinc-200 bg-white text-zinc-700"
                  }`}
                >
                  {AID_KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                value={aidCode}
                onChange={(e) => setAidCode(e.target.value)}
                placeholder={aidKind === "PASS_SPORT" ? "Code Pass Sport" : "N° du coupon"}
                className="min-w-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
              <input
                value={aidAmount}
                onChange={(e) => setAidAmount(e.target.value)}
                inputMode="decimal"
                placeholder="Montant (€)"
                className="min-w-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={actions.busyId === "new-aid"} onClick={saveAid} className={navyPill}>
                Ajouter l&apos;aide
              </button>
              <button type="button" onClick={() => setAdding(null)} className="text-xs font-semibold text-zinc-500">
                Annuler
              </button>
            </div>
          </div>
        )}

        {adding === "refund" && (
          <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-2">
            <div className="grid grid-cols-2 gap-1.5">
              <input
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                inputMode="decimal"
                placeholder="Montant (€)"
                className="min-w-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
              <input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Motif (optionnel)"
                className="min-w-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-700">
              <input type="checkbox" checked={refundRib} onChange={(e) => setRefundRib(e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-300" />
              RIB reçu
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={actions.busyId === "new-refund"} onClick={saveRefund} className={navyPill}>
                Ajouter le remboursement
              </button>
              <button type="button" onClick={() => setAdding(null)} className="text-xs font-semibold text-zinc-500">
                Annuler
              </button>
            </div>
          </div>
        )}

        {adding === null && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setAdding("aid")} className={navyPill}>
              <Plus className="h-3.5 w-3.5" />
              Aide Pass Sport / ANCV
            </button>
            <button type="button" onClick={() => setAdding("refund")} className={navyPill}>
              <Plus className="h-3.5 w-3.5" />
              Remboursement
            </button>
          </div>
        )}
        {actions.error && <p className="text-xs font-semibold text-red-600">{actions.error}</p>}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer ?"
        message={toDelete ? `Supprimer ${toDelete.label} ? Cette ligne disparaîtra définitivement du suivi.` : ""}
        confirmLabel="Supprimer"
        destructive
        pending={toDelete !== null && actions.busyId === toDelete.id}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const ok = toDelete.kind === "aid" ? await actions.deleteAid(toDelete.id) : await actions.deleteRefund(toDelete.id);
          if (ok) setToDelete(null);
        }}
      />
    </div>
  );
}
