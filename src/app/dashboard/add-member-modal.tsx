"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Shield, User, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { teamLabel } from "@/lib/teams";
import { Field } from "./member-detail-modal";
import type { AdminMemberTeam } from "./page";

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
  { key: "family", label: "Contacts, Parents & Urgence", icon: Users },
  { key: "medical", label: "Santé, Chartes & Historique", icon: AlertTriangle },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  birthDate: "",
  sex: "",
  registrationEmail: "",
  registrationPhone: "",
  address: "",
  postalCode: "",
  city: "",
  secondaryEmail: "",
  motherPhone: "",
  fatherPhone: "",
  otherPhones: "",
  secondaryAddress: "",
  licenseType: "",
  membershipType: "",
  fbiStatus: "",
  medicalNotes: "",
  otherNotes: "",
  imageRights: "",
  licenseNumber: "",
  licenseExpiresAt: "",
  medicalCertificateExpiresAt: "",
};

// Creation form, structured to look and behave exactly like the existing
// (editable) MemberDetailModal — same tabs pattern, same <Field> inputs —
// but writing to `players` via insert instead of update, then wiring the
// new row into team_players / team_pending_coaches / club_administrators
// exactly the way MemberDetailModal's handleSave does for an existing
// member. No profile_id exists yet for a brand-new member, so any coach
// assignment always goes through team_pending_coaches (display-only badge
// until the person actually signs up) — never team_coaches directly.
export default function AddMemberModal({
  teams,
  onClose,
  onCreated,
}: {
  teams: AdminMemberTeam[];
  onClose: () => void;
  onCreated: (fullName: string) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("identity");
  const [form, setForm] = useState(EMPTY_FORM);
  const [teamId, setTeamId] = useState("");
  const [isCoach, setIsCoach] = useState(false);
  const [coachTeamIds, setCoachTeamIds] = useState<Set<string>>(new Set());
  const [bureauRole, setBureauRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleCoachTeam(id: string) {
    setCoachTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCoachToggle(checked: boolean) {
    setIsCoach(checked);
    if (!checked) setCoachTeamIds(new Set());
  }

  async function handleCreate() {
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    if (!firstName || !lastName) {
      setError("Le nom et le prénom sont obligatoires.");
      setTab("identity");
      return;
    }
    if (bureauRole && !form.registrationEmail.trim()) {
      setError("Un email est nécessaire pour accorder un accès Bureau.");
      setTab("family");
      return;
    }

    setSaving(true);
    setError(null);
    const supabase = createClient();

    const category = teams.find((t) => t.id === teamId)?.category ?? null;

    const { data: inserted, error: insertError } = await supabase
      .from("players")
      .insert({
        first_name: firstName,
        last_name: lastName,
        birth_date: form.birthDate || null,
        category,
        sex: form.sex || null,
        registration_email: form.registrationEmail.trim() || null,
        registration_phone: form.registrationPhone.trim() || null,
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
        license_expires_at: form.licenseExpiresAt || null,
        medical_certificate_expires_at: form.medicalCertificateExpiresAt || null,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      setSaving(false);
      setError(insertError?.message ?? "Création impossible.");
      return;
    }
    const newPlayerId = inserted.id as string;

    if (teamId) {
      const { error: teamError } = await supabase
        .from("team_players")
        .insert({ team_id: teamId, player_id: newPlayerId });
      if (teamError) {
        setSaving(false);
        setError(`Membre créé, mais l'affectation à l'équipe a échoué : ${teamError.message}`);
        return;
      }
    }

    if (isCoach && coachTeamIds.size > 0) {
      const { error: coachError } = await supabase
        .from("team_pending_coaches")
        .insert(Array.from(coachTeamIds).map((tid) => ({ team_id: tid, player_id: newPlayerId })));
      if (coachError) {
        setSaving(false);
        setError(`Membre créé, mais l'affectation Coach a échoué : ${coachError.message}`);
        return;
      }
    }

    if (bureauRole && form.registrationEmail.trim()) {
      const { error: bureauError } = await supabase
        .from("club_administrators")
        .upsert(
          { email: form.registrationEmail.trim(), role: "ADMIN", club_function: bureauRole },
          { onConflict: "email" }
        );
      if (bureauError) {
        setSaving(false);
        setError(`Membre créé, mais l'accès Bureau a échoué : ${bureauError.message}`);
        return;
      }
    }

    setSaving(false);
    onCreated(`${firstName} ${lastName}`);
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h3 className="font-semibold text-zinc-900">Ajouter un membre</h3>
            <p className="text-xs text-zinc-500">
              Nouvelle fiche + affectation immédiate à une équipe, sans passer par l&apos;onglet Équipes.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
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
                label="Prénom *"
                value={form.firstName}
                editable
                onChange={(v) => set("firstName", v)}
              />
              <Field
                label="Nom *"
                value={form.lastName}
                editable
                onChange={(v) => set("lastName", v)}
              />
              <Field
                label="Date de naissance"
                type="date"
                value={form.birthDate}
                editable
                onChange={(v) => set("birthDate", v)}
              />
              <Field
                label="Sexe"
                value={form.sex}
                editable
                onChange={(v) => set("sex", v)}
                options={["Masculin", "Féminin"]}
              />
              <Field
                label="Adresse"
                value={form.address}
                editable
                onChange={(v) => set("address", v)}
              />
              <Field
                label="Code postal"
                value={form.postalCode}
                editable
                onChange={(v) => set("postalCode", v)}
              />
              <Field
                label="Commune"
                value={form.city}
                editable
                onChange={(v) => set("city", v)}
              />
            </div>
          )}

          {tab === "license" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Équipe / Catégorie d&apos;affectation
                </span>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                >
                  <option value="">Aucune équipe pour l&apos;instant</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {teamLabel(t)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-zinc-400">
                  La catégorie (et le statut Rookie/Old Soldier éventuel) est déduite
                  automatiquement de cette équipe et de la date de naissance.
                </span>
              </div>

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
                  <div className="mt-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Équipe(s) qu&apos;il/elle coache
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
                  {BUREAU_ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {bureauRole && (
                  <span className="text-xs text-zinc-500">
                    Nécessite un email (onglet &quot;Contacts, Parents &amp; Urgence&quot;).
                  </span>
                )}
              </div>

              <Field
                label="Type de licence demandée"
                value={form.licenseType}
                editable
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
                editable
                onChange={(v) => set("membershipType", v)}
                options={["Nouvelle", "Réadhésion", "Mutation"]}
              />
              <Field
                label="Statut FBI"
                value={form.fbiStatus}
                editable
                onChange={(v) => set("fbiStatus", v)}
                options={[
                  "Licence générée",
                  "A valider groupement sportif",
                  "En attente saisie adhérent",
                  "En cours de saisie",
                ]}
              />
              <Field
                label="N° Licence"
                value={form.licenseNumber}
                editable
                onChange={(v) => set("licenseNumber", v)}
              />
              <Field
                label="Licence valable jusqu'au"
                type="date"
                value={form.licenseExpiresAt}
                editable
                onChange={(v) => set("licenseExpiresAt", v)}
              />
            </div>
          )}

          {tab === "family" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Email"
                type="email"
                value={form.registrationEmail}
                editable
                onChange={(v) => set("registrationEmail", v)}
              />
              <Field
                label="Téléphone"
                value={form.registrationPhone}
                editable
                onChange={(v) => set("registrationPhone", v)}
              />
              <Field
                label="Email secondaire"
                type="email"
                value={form.secondaryEmail}
                editable
                onChange={(v) => set("secondaryEmail", v)}
              />
              <div />
              <Field
                label="Mère / conjointe (contact parent ou urgence)"
                value={form.motherPhone}
                editable
                onChange={(v) => set("motherPhone", v)}
              />
              <Field
                label="Père / conjoint (contact parent ou urgence)"
                value={form.fatherPhone}
                editable
                onChange={(v) => set("fatherPhone", v)}
              />
              <div className="sm:col-span-2">
                <Field
                  label="Autres téléphones"
                  multiline
                  value={form.otherPhones}
                  editable
                  onChange={(v) => set("otherPhones", v)}
                />
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="Adresse secondaire"
                  multiline
                  value={form.secondaryAddress}
                  editable
                  onChange={(v) => set("secondaryAddress", v)}
                />
              </div>
            </div>
          )}

          {tab === "medical" && (
            <div className="grid grid-cols-1 gap-3">
              <Field
                label="Particularités médicales"
                multiline
                value={form.medicalNotes}
                editable
                onChange={(v) => set("medicalNotes", v)}
              />
              <Field
                label="Certificat médical valable jusqu'au"
                type="date"
                value={form.medicalCertificateExpiresAt}
                editable
                onChange={(v) => set("medicalCertificateExpiresAt", v)}
              />
              <Field
                label="Autres informations utiles"
                multiline
                value={form.otherNotes}
                editable
                onChange={(v) => set("otherNotes", v)}
              />
              <Field
                label="Droit à l'image"
                value={form.imageRights}
                editable
                onChange={(v) => set("imageRights", v)}
                options={["Oui", "Non"]}
              />
              <p className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                Les chartes Joueur/Parent et l&apos;historique WhatsApp seront disponibles
                sur la fiche du membre une fois celle-ci créée.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-100 px-5 py-3">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-full border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex-1 rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
            >
              {saving ? "Création..." : "Créer le membre"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
