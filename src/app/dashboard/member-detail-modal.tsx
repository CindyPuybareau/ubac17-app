"use client";

import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Copy,
  MessageCircle,
  Send,
  Shield,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { teamLabel } from "@/lib/teams";
import { buildAppDeepLink, buildWhatsAppLink } from "@/lib/whatsapp";
import type { AdminMemberTeam, MemberDetail } from "./page";

const BUREAU_ROLE_OPTIONS = [
  "Président / Vice-Président",
  "Trésorier / Trésorier Adjoint",
  "Secrétaire / Secrétaire Adjoint",
  "Membre du Bureau",
  "Responsable Commission (Sponsors, Com, Animations, etc.)",
];

const TABS = [
  { key: "identity", label: "Identité", icon: User },
  { key: "license", label: "Licence & Équipe", icon: Shield },
  { key: "family", label: "Parents & Urgence", icon: Users },
  { key: "medical", label: "Santé & Chartes", icon: AlertTriangle },
  { key: "whatsapp", label: "Historique WhatsApp", icon: MessageCircle },
] as const;

type WhatsAppMessage = {
  id: string;
  direction: "ENVOYE" | "RECU";
  source: "APP" | "MANUEL";
  content: string;
  sent_at: string;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Self-contained: fetches/writes its own data directly rather than
// threading it through page.tsx -> members-table/team-card -> here, since
// nothing else in the app needs a member's WhatsApp history. RLS (Bureau,
// or the player's own coach) already scopes what comes back.
function WhatsAppHistoryTab({ playerId, phone }: { playerId: string; phone: string | null }) {
  const [messages, setMessages] = useState<WhatsAppMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"ENVOYE" | "RECU">("RECU");
  const [content, setContent] = useState("");
  const [sentAt, setSentAt] = useState(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("whatsapp_messages")
      .select("id, direction, source, content, sent_at")
      .eq("player_id", playerId)
      .order("sent_at", { ascending: false });
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    setMessages((data as WhatsAppMessage[] | null) ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  async function addManualEntry() {
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("whatsapp_messages").insert({
      player_id: playerId,
      direction,
      source: "MANUEL",
      content: content.trim(),
      sent_at: new Date(sentAt).toISOString(),
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setContent("");
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Ajouter un échange (message envoyé/reçu hors application)
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as "ENVOYE" | "RECU")}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="RECU">Reçu du membre</option>
            <option value="ENVOYE">Envoyé au membre</option>
          </select>
          <input
            type="datetime-local"
            value={sentAt}
            onChange={(e) => setSentAt(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm"
          />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="Contenu du message..."
          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={addManualEntry}
          disabled={saving || !content.trim()}
          className="w-fit rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy/90 disabled:opacity-50"
        >
          {saving ? "Enregistrement..." : "Enregistrer dans l'historique"}
        </button>
        {phone && (
          <a
            href={buildWhatsAppLink(phone, "") ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1.5 text-xs font-medium text-emerald-700 hover:underline"
          >
            <Send className="h-3 w-3" />
            Ouvrir WhatsApp avec ce membre
          </a>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-2">
        {messages === null && !error && (
          <p className="text-sm text-zinc-400">Chargement...</p>
        )}
        {messages?.length === 0 && (
          <p className="text-sm text-zinc-400">
            Aucun échange WhatsApp enregistré pour ce membre.
          </p>
        )}
        {messages?.map((m) => (
          <div
            key={m.id}
            className="flex flex-col gap-1 rounded-xl border border-zinc-100 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                  m.direction === "ENVOYE"
                    ? "bg-navy/10 text-navy"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {m.direction === "ENVOYE" ? "Envoyé" : "Reçu"}
              </span>
              <span className="text-xs text-zinc-400">
                {formatDateTime(m.sent_at)}
                {m.source === "MANUEL" ? " · saisie manuelle" : " · via l'app"}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-zinc-800">{m.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

type TabKey = (typeof TABS)[number]["key"];

function formatBirthDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR");
}

function Field({
  label,
  value,
  displayValue,
  editable,
  onChange,
  multiline,
  options,
  type = "text",
}: {
  label: string;
  value: string;
  displayValue?: string | null;
  editable: boolean;
  onChange: (v: string) => void;
  multiline?: boolean;
  options?: string[];
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {label}
      </span>
      {!editable ? (
        <span className="whitespace-pre-wrap text-sm text-zinc-800">
          {(displayValue ?? value)?.trim() || "—"}
        </span>
      ) : options ? (
        <select
          value={value}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <textarea
          value={value}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          rows={2}
          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        />
      )}
    </div>
  );
}

function ReadOnlyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {label}
      </span>
      {children}
    </div>
  );
}

export default function MemberDetailModal({
  member,
  readOnly,
  onClose,
  onArchive,
  archivedAt = null,
  teams = [],
  profileId = null,
  bureauRole: initialBureauRole = null,
  coachTeams: initialCoachTeams = [],
  pendingCoachTeams: initialPendingCoachTeams = [],
}: {
  member: MemberDetail;
  readOnly: boolean;
  onClose: () => void;
  onArchive?: () => void;
  archivedAt?: string | null;
  teams?: AdminMemberTeam[];
  profileId?: string | null;
  bureauRole?: string | null;
  coachTeams?: AdminMemberTeam[];
  pendingCoachTeams?: AdminMemberTeam[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("identity");
  const [linkCopied, setLinkCopied] = useState(false);

  function copyAppLink() {
    navigator.clipboard
      .writeText(buildAppDeepLink("members", { openMember: member.id }))
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      });
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState(member.teams[0]?.id ?? "");
  // The "Équipe" select only lists teams with a sort_order set — if this
  // member is still on a leftover row without one, it wouldn't match any
  // <option>, so the browser silently displays "Aucune équipe" while
  // teamId still holds that id. Save would then see no change and do
  // nothing. Surface the current team as an extra option so it genuinely
  // shows selected, and switching away from it (including to "Aucune
  // équipe") actually fires onChange.
  const currentTeam = member.teams[0];
  const teamOptions =
    currentTeam && !teams.some((t) => t.id === currentTeam.id)
      ? [...teams, currentTeam]
      : teams;
  const [coachTeamIds, setCoachTeamIds] = useState<Set<string>>(
    () => new Set([...initialCoachTeams, ...initialPendingCoachTeams].map((t) => t.id))
  );
  const [isCoach, setIsCoach] = useState(() => coachTeamIds.size > 0);
  // Fades the coached-teams block in on the frame after it mounts, rather
  // than mounting it already at full opacity — a plain conditional render
  // has nothing to transition from otherwise.
  const [coachTeamsVisible, setCoachTeamsVisible] = useState(isCoach);

  useEffect(() => {
    if (!isCoach) {
      setCoachTeamsVisible(false);
      return;
    }
    const id = setTimeout(() => setCoachTeamsVisible(true), 10);
    return () => clearTimeout(id);
  }, [isCoach]);

  function handleCoachToggle(checked: boolean) {
    setIsCoach(checked);
    if (!checked) setCoachTeamIds(new Set());
  }
  const [bureauRole, setBureauRole] = useState(initialBureauRole ?? "");
  // Guard against the classic controlled-<select> pitfall (already hit
  // once with the Équipe picker): if a legacy row's club_function doesn't
  // match any of the current options, surface it as an extra option so
  // the select shows the real value instead of silently falling back.
  const bureauRoleOptions =
    initialBureauRole && !BUREAU_ROLE_OPTIONS.includes(initialBureauRole)
      ? [...BUREAU_ROLE_OPTIONS, initialBureauRole]
      : BUREAU_ROLE_OPTIONS;
  const [form, setForm] = useState({
    firstName: member.firstName ?? "",
    lastName: member.lastName ?? "",
    birthDate: member.birthDate ?? "",
    sex: member.sex ?? "",
    registrationEmail: member.registrationEmail ?? "",
    registrationPhone: member.registrationPhone ?? "",
    address: member.address ?? "",
    postalCode: member.postalCode ?? "",
    city: member.city ?? "",
    secondaryEmail: member.secondaryEmail ?? "",
    motherPhone: member.motherPhone ?? "",
    fatherPhone: member.fatherPhone ?? "",
    otherPhones: member.otherPhones ?? "",
    secondaryAddress: member.secondaryAddress ?? "",
    licenseType: member.licenseType ?? "",
    membershipType: member.membershipType ?? "",
    fbiStatus: member.fbiStatus ?? "",
    medicalNotes: member.medicalNotes ?? "",
    otherNotes: member.otherNotes ?? "",
    imageRights: member.imageRights ?? "",
    licenseNumber: member.licenseNumber ?? "",
  });

  const editable = !readOnly;

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleCoachTeam(teamId: string) {
    setCoachTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  async function handleArchiveClick() {
    const name = [member.firstName, member.lastName].filter(Boolean).join(" ") || "ce membre";
    const ok = window.confirm(
      `Archiver la fiche de ${name} ? Elle n'apparaîtra plus dans la liste par défaut, mais ses données restent conservées et tu peux réactiver à tout moment.`
    );
    if (!ok || !onArchive) return;
    onArchive();
    onClose();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("players")
      .update({
        first_name: form.firstName || null,
        last_name: form.lastName || null,
        birth_date: form.birthDate || null,
        sex: form.sex || null,
        registration_email: form.registrationEmail || null,
        registration_phone: form.registrationPhone || null,
        address: form.address || null,
        postal_code: form.postalCode || null,
        city: form.city || null,
        secondary_email: form.secondaryEmail || null,
        mother_phone: form.motherPhone || null,
        father_phone: form.fatherPhone || null,
        other_phones: form.otherPhones || null,
        secondary_address: form.secondaryAddress || null,
        license_type: form.licenseType || null,
        membership_type: form.membershipType || null,
        fbi_status: form.fbiStatus || null,
        medical_notes: form.medicalNotes || null,
        other_notes: form.otherNotes || null,
        image_rights: form.imageRights || null,
        license_number: form.licenseNumber || null,
      })
      .eq("id", member.id);

    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    const currentTeamId = member.teams[0]?.id ?? "";
    if (teamId !== currentTeamId) {
      const { error: deleteError } = await supabase
        .from("team_players")
        .delete()
        .eq("player_id", member.id);
      if (deleteError) {
        setSaving(false);
        setError(`Équipe non mise à jour : ${deleteError.message}`);
        return;
      }
      if (teamId) {
        const { error: insertError } = await supabase
          .from("team_players")
          .insert({ team_id: teamId, player_id: member.id });
        if (insertError) {
          setSaving(false);
          setError(`Équipe non mise à jour : ${insertError.message}`);
          return;
        }
      }
    }

    // Coach team assignment works whether or not this member has a real
    // login account yet: linked -> real team_coaches (grants access),
    // unlinked -> team_pending_coaches (display-only badge, same table the
    // "en attente de compte" pastille reads from). The players<->profiles
    // auto-link runs silently in the background at signup — nothing here
    // needs to know about it.
    const initialCombinedCoachIds = new Set(
      [...initialCoachTeams, ...initialPendingCoachTeams].map((t) => t.id)
    );
    const desiredCoachIds = coachTeamIds;
    const toRemove = Array.from(initialCombinedCoachIds).filter(
      (id) => !desiredCoachIds.has(id)
    );
    const toAdd = Array.from(desiredCoachIds).filter(
      (id) => !initialCombinedCoachIds.has(id)
    );
    const coachTable = profileId ? "team_coaches" : "team_pending_coaches";
    const coachIdColumn = profileId ? "coach_id" : "player_id";
    const coachIdValue = profileId ?? member.id;

    if (toRemove.length > 0) {
      const { error: removeError } = await supabase
        .from(coachTable)
        .delete()
        .eq(coachIdColumn, coachIdValue)
        .in("team_id", toRemove);
      if (removeError) {
        setSaving(false);
        setError(`Équipes coachées non mises à jour : ${removeError.message}`);
        return;
      }
    }
    if (toAdd.length > 0) {
      const { error: addError } = await supabase
        .from(coachTable)
        .insert(toAdd.map((tid) => ({ team_id: tid, [coachIdColumn]: coachIdValue })));
      if (addError) {
        setSaving(false);
        setError(`Équipes coachées non mises à jour : ${addError.message}`);
        return;
      }
    }

    // Bureau access is pre-provisioned by email (same pattern as coach
    // invites) — works before the member ever signs up. club_function
    // holds the specific role for display today, ahead of the
    // finer-grained permissions it'll eventually drive.
    if (bureauRole !== (initialBureauRole ?? "")) {
      const email = form.registrationEmail || member.registrationEmail;
      if (email) {
        const { error: bureauError } = bureauRole
          ? await supabase
              .from("club_administrators")
              .upsert(
                { email, role: "ADMIN", club_function: bureauRole },
                { onConflict: "email" }
              )
          : await supabase
              .from("club_administrators")
              .delete()
              .eq("email", email);
        if (bureauError) {
          setSaving(false);
          setError(`Accès Bureau non mis à jour : ${bureauError.message}`);
          return;
        }
      }
    }

    setSaving(false);
    router.refresh();
    onClose();
  }

  const charterBadge = (value: string | null) => (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        value ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
      }`}
    >
      {value ? "Acceptée" : "Non acceptée"}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h3 className="font-semibold text-zinc-900">
              {[member.firstName, member.lastName].filter(Boolean).join(" ") ||
                "Membre"}
            </h3>
            {member.category && (
              <p className="text-xs text-zinc-500">{member.category}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={copyAppLink}
              title="Copier un lien à partager (ex: dans WhatsApp) pour revenir directement sur cette fiche"
              className="flex items-center gap-1.5 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <Copy className="h-4 w-4" />
              {linkCopied && <span className="text-xs font-medium text-emerald-600">Copié !</span>}
            </button>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-zinc-100 px-3 py-2 md:justify-between">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors md:text-sm ${
                  active ? "bg-navy text-white" : "text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "identity" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Prénom"
                value={form.firstName}
                editable={editable}
                onChange={(v) => set("firstName", v)}
              />
              <Field
                label="Nom"
                value={form.lastName}
                editable={editable}
                onChange={(v) => set("lastName", v)}
              />
              <Field
                label="Date de naissance"
                type="date"
                value={form.birthDate}
                displayValue={formatBirthDate(member.birthDate)}
                editable={editable}
                onChange={(v) => set("birthDate", v)}
              />
              <Field
                label="Sexe"
                value={form.sex}
                editable={editable}
                onChange={(v) => set("sex", v)}
                options={["Masculin", "Féminin"]}
              />
              <Field
                label="Email"
                type="email"
                value={form.registrationEmail}
                editable={editable}
                onChange={(v) => set("registrationEmail", v)}
              />
              <Field
                label="Téléphone"
                value={form.registrationPhone}
                editable={editable}
                onChange={(v) => set("registrationPhone", v)}
              />
              <Field
                label="Adresse"
                value={form.address}
                editable={editable}
                onChange={(v) => set("address", v)}
              />
              <Field
                label="Code postal"
                value={form.postalCode}
                editable={editable}
                onChange={(v) => set("postalCode", v)}
              />
              <Field
                label="Commune"
                value={form.city}
                editable={editable}
                onChange={(v) => set("city", v)}
              />
            </div>
          )}

          {tab === "family" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Email secondaire"
                type="email"
                value={form.secondaryEmail}
                editable={editable}
                onChange={(v) => set("secondaryEmail", v)}
              />
              <div />
              <Field
                label="Mère / conjointe"
                value={form.motherPhone}
                editable={editable}
                onChange={(v) => set("motherPhone", v)}
              />
              <Field
                label="Père / conjoint"
                value={form.fatherPhone}
                editable={editable}
                onChange={(v) => set("fatherPhone", v)}
              />
              <div className="sm:col-span-2">
                <Field
                  label="Autres téléphones"
                  multiline
                  value={form.otherPhones}
                  editable={editable}
                  onChange={(v) => set("otherPhones", v)}
                />
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="Adresse secondaire"
                  multiline
                  value={form.secondaryAddress}
                  editable={editable}
                  onChange={(v) => set("secondaryAddress", v)}
                />
              </div>
            </div>
          )}

          {tab === "license" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ReadOnlyField label="Catégorie">
                <span className="text-sm text-zinc-800">
                  {member.category ?? "—"}
                </span>
              </ReadOnlyField>
              {editable ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Équipe
                  </span>
                  <select
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                  >
                    <option value="">Aucune équipe</option>
                    {teamOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <ReadOnlyField label="Équipe(s)">
                  <div className="flex flex-wrap gap-1">
                    {member.teams.length === 0 ? (
                      <span className="text-sm text-zinc-400">—</span>
                    ) : (
                      member.teams.map((t) => (
                        <span
                          key={t.id}
                          className="rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold text-navy"
                        >
                          {t.category ?? t.name ?? "Équipe"}
                        </span>
                      ))
                    )}
                  </div>
                </ReadOnlyField>
              )}

              {editable && (
                <div className="flex flex-col gap-1.5 rounded-xl border border-zinc-100 bg-zinc-50 p-3 sm:col-span-2">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-zinc-700">
                      Ce membre est Entraîneur / Coach
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isCoach}
                      onClick={() => handleCoachToggle(!isCoach)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                        isCoach ? "bg-navy" : "bg-zinc-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          isCoach ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </label>
                  {isCoach && (
                    <div
                      className={`mt-1.5 transition-opacity duration-300 ${
                        coachTeamsVisible ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                        Équipes coachées par ce membre
                      </span>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {teams.map((t) => (
                          <label
                            key={t.id}
                            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                              coachTeamIds.has(t.id)
                                ? "border-purple-300 bg-purple-100 text-purple-700"
                                : "border-zinc-200 text-zinc-600"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={coachTeamIds.has(t.id)}
                              onChange={() => toggleCoachTeam(t.id)}
                              className="h-3.5 w-3.5 rounded border-zinc-300"
                            />
                            {teamLabel(t)}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {editable && (
                <div className="flex flex-col gap-1.5 rounded-xl border-2 border-ubac-yellow/50 bg-gradient-to-br from-ubac-yellow/10 to-navy/5 p-3.5 sm:col-span-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-navy">
                    <Shield className="h-3.5 w-3.5" />
                    Rôle au Bureau / Administration
                  </span>
                  <select
                    value={bureauRole}
                    onChange={(e) => setBureauRole(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm"
                  >
                    <option value="">Aucun (Par défaut)</option>
                    {bureauRoleOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <Field
                label="Type de licence demandée"
                value={form.licenseType}
                editable={editable}
                onChange={(v) => set("licenseType", v)}
                options={[
                  "Dirigeant",
                  "Joueur Compétition",
                  "Joueur Loisir (uniquement pour les séniors)",
                  "Dirigeant et Joueur Loisir (uniquement pour les séniors)",
                ]}
              />
              <Field
                label="Type d'adhésion"
                value={form.membershipType}
                editable={editable}
                onChange={(v) => set("membershipType", v)}
                options={["Nouvelle", "Réadhésion", "Mutation"]}
              />
              <Field
                label="Statut FBI"
                value={form.fbiStatus}
                editable={editable}
                onChange={(v) => set("fbiStatus", v)}
                options={[
                  "Licence générée",
                  "A valider groupement sportif",
                  "En attente saisie adhérent",
                  "En cours de saisie",
                ]}
              />
              <ReadOnlyField label="Statut Club">
                <span className="text-sm text-zinc-800">
                  {member.clubStatus ?? "—"}
                </span>
              </ReadOnlyField>
              <Field
                label="N° Licence"
                value={form.licenseNumber}
                editable={editable}
                onChange={(v) => set("licenseNumber", v)}
              />
            </div>
          )}

          {tab === "medical" && (
            <div className="grid grid-cols-1 gap-3">
              <Field
                label="Particularités médicales"
                multiline
                value={form.medicalNotes}
                editable={editable}
                onChange={(v) => set("medicalNotes", v)}
              />
              <Field
                label="Autres informations utiles"
                multiline
                value={form.otherNotes}
                editable={editable}
                onChange={(v) => set("otherNotes", v)}
              />
              <Field
                label="Droit à l'image"
                value={form.imageRights}
                editable={editable}
                onChange={(v) => set("imageRights", v)}
                options={["Oui", "Non"]}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ReadOnlyField label="Charte Joueur">
                  {charterBadge(member.playerCharterAccepted)}
                </ReadOnlyField>
                <ReadOnlyField label="Charte Parent">
                  {charterBadge(member.parentCharterAccepted)}
                </ReadOnlyField>
              </div>
            </div>
          )}

          {tab === "whatsapp" && (
            <WhatsAppHistoryTab
              playerId={member.id}
              phone={member.registrationPhone}
            />
          )}
        </div>

        {editable && (
          <div className="border-t border-zinc-100 px-5 py-3">
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-2">
              {onArchive && !archivedAt && (
                <button
                  type="button"
                  onClick={handleArchiveClick}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer ce membre
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
