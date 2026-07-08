-- ═══════════════════════════════════════════════════
-- ROOBET BRAND VOICE — SUPABASE SCHEMA
-- Run this in: Supabase → SQL Editor → New query
-- ═══════════════════════════════════════════════════

-- Comments table
create table if not exists comments (
  id            uuid primary key default gen_random_uuid(),
  block_id      text not null,
  block_label   text,
  author_name   text not null,
  content       text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now()
);

-- Replies table
create table if not exists comment_replies (
  id            uuid primary key default gen_random_uuid(),
  comment_id    uuid not null references comments(id) on delete cascade,
  content       text not null,
  created_at    timestamptz not null default now()
);

-- Enable Row Level Security
alter table comments       enable row level security;
alter table comment_replies enable row level security;

-- Open read/write policies (no login required)
create policy "anyone can read comments"
  on comments for select using (true);

create policy "anyone can insert comments"
  on comments for insert with check (true);

create policy "anyone can update comment status"
  on comments for update using (true);

create policy "anyone can read replies"
  on comment_replies for select using (true);

create policy "anyone can insert replies"
  on comment_replies for insert with check (true);
