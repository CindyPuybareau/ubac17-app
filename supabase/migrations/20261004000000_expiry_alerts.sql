-- Alertes d'expiration (licence FFBB, certificat médical) : la fiche
-- membre n'avait jusqu'ici aucune date d'échéance structurée (juste un
-- statut texte comme "Licence générée"), impossible à surveiller
-- automatiquement. license_expiry_alert_sent_at / medical_expiry_alert_sent_at
-- évitent qu'un même document relance indéfiniment une fois le mail
-- envoyé une première fois — remis à NULL côté appli dès que la date
-- elle-même est modifiée (renouvellement), pour qu'un nouveau cycle
-- d'alerte reparte du bon pied.
alter table public.players
  add column if not exists license_expires_at date,
  add column if not exists license_expiry_alert_sent_at timestamptz,
  add column if not exists medical_certificate_expires_at date,
  add column if not exists medical_expiry_alert_sent_at timestamptz;
