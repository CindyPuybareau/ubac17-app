"use client";

import { useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Shield, User, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { MemberDetail } from "./page";

const TABS = [
  { key: "identity", label: "Identité & Contacts", icon: User },
  { key: "family", label: "Contacts Parents & Urgence", icon: Users },
  { key: "license", label: "Licence & Équipe", icon: Shield },
  { key: "medical", label: "Infos Médicales & Autorisations", icon: AlertTriangle },
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
}: {
  member: MemberDetail;
  readOnly: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("identity");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
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

        <div className="flex gap-1 overflow-x-auto border-b border-zinc-100 px-3 py-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active ? "bg-navy text-white" : "text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
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
