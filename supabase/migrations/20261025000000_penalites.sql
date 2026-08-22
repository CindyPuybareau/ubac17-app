-- Pénalités individuelles (retour de Cindy du 2026-08-22) : une faute
-- technique sifflée par un arbitre coûte au club, qui la répercute ensuite
-- sur le joueur responsable. Montant variable, saisi par le Bureau au cas
-- par cas — pas de barème fixe comme category_tariffs.
create table if not exists public.penalites (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  amount numeric not null,
  notes text,
  -- Date de la faute elle-même (souvent saisie après coup) — distincte de
  -- created_at qui reste la date de saisie en base.
  penalite_date date not null default current_date,
  statut text not null default 'EN_ATTENTE' check (statut in ('EN_ATTENTE', 'PAYE')),
  paid_at timestamptz,
  -- Même mécanisme de cooldown que cotisations.last_auto_relance_sent_at
  -- (voir /api/cron/bureau-alerts) : le toggle "Relance pénalités" couvre
  -- désormais les deux.
  last_auto_relance_sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.penalites enable row level security;

-- Bureau : gestion complète (créer/modifier/supprimer), même périmètre que
-- cotisations/collectes.
create policy "admin manage penalites"
  on public.penalites
  for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

-- Le joueur concerné et son/ses parent(s) : lecture seule de SES propres
-- pénalités (même pattern que "select own linked cotisations").
create policy "select own linked penalites"
  on public.penalites for select
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = penalites.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(penalites.player_id)
  );

-- Le coach : lecture seule des pénalités des joueurs de SES équipes
-- (visibilité demandée par Cindy, mais pas de droit de saisie — seul le
-- Bureau crée/modifie/supprime une pénalité).
create policy "coach select penalites for own teams"
  on public.penalites for select
  using (
    exists (
      select 1 from public.team_players tp
      where tp.player_id = penalites.player_id
        and public.is_team_coach(tp.team_id)
    )
  );

grant select, insert, update, delete on public.penalites to authenticated;
