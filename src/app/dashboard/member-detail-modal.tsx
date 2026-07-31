"use client";

import { useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Shield, User, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AdminMemberTeam, MemberDetail, ProfileDirectoryEntry } from "./page";

const TABS = [
  { key: "identity", label: "Identité", icon: User },
  { key: "license", label: "Licence & Équipe", icon: Shield },
  { key: "family", label: "Parents & Urgence", icon: Users },
  { key: "medical", label: "Santé & Chartes", icon: AlertTriangle },
] as const;

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
  teams = [],
  profileDirectory = [],
  profileId: initialProfileId = null,
  isBureau: initialIsBureau = false,
  coachTeams: initialCoachTeams = [],
}: {
  member: MemberDetail;
  readOnly: boolean;
  onClose: () => void;
  teams?: AdminMemberTeam[];
  profileDirectory?: ProfileDirectoryEntry[];
  profileId?: string | null;
  isBureau?: boolean;
  coachTeams?: AdminMemberTeam[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("identity");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState(member.teams[0]?.id ?? "");
  // The "Équipe" select only ever lists the 13 canonical teams — if this
  // member is still on a legacy one (z.Sénior, U13...), it wouldn't match
  // any <option>, so the browser silently displays "Aucune équipe" while
  // teamId still holds the legacy id. Save would then see no change and
  // do nothing. Surface the current legacy team as an extra option so it
  // genuinely shows selected, and switching away from it (including to
  // "Aucune équipe") actually fires onChange.
  const currentTeam = member.teams[0];
  const teamOptions =
    currentTeam && !teams.some((t) => t.id === currentTeam.id)
      ? [...teams, currentTeam]
      : teams;
  const [profileId, setProfileId] = useState(initialProfileId ?? "");
  const [coachChecked, setCoachChecked] = useState(initialCoachTeams.length > 0);
  const [coachTeamIds, setCoachTeamIds] = useState<Set<string>>(
    () => new Set(initialCoachTeams.map((t) => t.id))
  );
  const [bureauChecked, setBureauChecked] = useState(initialIsBureau);
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

  function handleCoachCheckboxChange(checked: boolean) {
    setCoachChecked(checked);
    if (!checked) setCoachTeamIds(new Set());
  }

  const linkedProfile = profileDirectory.find((p) => p.id === profileId);

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

    if (profileId !== (initialProfileId ?? "")) {
      const { error: linkError } = await supabase
        .from("players")
        .update({ profile_id: profileId || null })
        .eq("id", member.id);
      if (linkError) {
        setSaving(false);
        setError(`Liaison du compte impossible : ${linkError.message}`);
        return;
      }
    }

    if (profileId) {
      const initialCoachIds = new Set(initialCoachTeams.map((t) => t.id));
      const desiredCoachIds = coachChecked ? coachTeamIds : new Set<string>();
      const toRemove = Array.from(initialCoachIds).filter(
        (id) => !desiredCoachIds.has(id)
      );
      const toAdd = Array.from(desiredCoachIds).filter(
        (id) => !initialCoachIds.has(id)
      );

      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from("team_coaches")
          .delete()
          .eq("coach_id", profileId)
          .in("team_id", toRemove);
        if (removeError) {
          setSaving(false);
          setError(`Équipes coachées non mises à jour : ${removeError.message}`);
          return;
        }
      }
      if (toAdd.length > 0) {
        const { error: addError } = await supabase
          .from("team_coaches")
          .insert(toAdd.map((tid) => ({ team_id: tid, coach_id: profileId })));
        if (addError) {
          setSaving(false);
          setError(`Équipes coachées non mises à jour : ${addError.message}`);
          return;
        }
      }

      if (bureauChecked !== initialIsBureau) {
        const linkedEmail = profileDirectory.find((p) => p.id === profileId)?.email;
        if (linkedEmail) {
          const { error: bureauError } = bureauChecked
            ? await supabase
                .from("club_administrators")
                .insert({ email: linkedEmail, role: "ADMIN" })
            : await supabase
                .from("club_administrators")
                .delete()
                .eq("email", linkedEmail);
          if (bureauError) {
            setSaving(false);
            setError(`Accès Bureau non mis à jour : ${bureauError.message}`);
            return;
          }
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
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
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
                        {t.name}
                        {t.category ? ` · ${t.category}` : ""}
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
                <div className="flex flex-col gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3 sm:col-span-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Compte de connexion
                    </span>
                    {linkedProfile ? (
                      <p className="text-sm text-zinc-800">
                        Lié à{" "}
                        <span className="font-medium">
                          {linkedProfile.email ?? "compte sans email"}
                        </span>
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-zinc-400">Aucun compte lié</p>
                        <select
                          value=""
                          onChange={(e) => setProfileId(e.target.value)}
                          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                        >
                          <option value="" disabled>
                            Lier à un compte existant...
                          </option>
                          {profileDirectory.map((p) => (
                            <option key={p.id} value={p.id}>
                              {[p.firstName, p.lastName].filter(Boolean).join(" ") ||
                                "Sans nom"}
                              {p.email ? ` · ${p.email}` : ""}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>

                  {linkedProfile && (
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                        <input
                          type="checkbox"
                          checked={coachChecked}
                          onChange={(e) => handleCoachCheckboxChange(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                        />
                        Coach
                      </label>
                      {coachChecked && (
                        <div className="ml-6 flex flex-wrap gap-2">
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
                              {t.name}
                              {t.category ? ` · ${t.category}` : ""}
                            </label>
                          ))}
                        </div>
                      )}

                      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                        <input
                          type="checkbox"
                          checked={bureauChecked}
                          onChange={(e) => setBureauChecked(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                        />
                        Bureau
                      </label>
                    </div>
                  )}
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
        </div>

        {editable && (
          <div className="border-t border-zinc-100 px-5 py-3">
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
