-- ============================================================
-- JustFormi — Supabase schema
-- Run this ONCE in Supabase Dashboard → SQL Editor.
-- If `create extension vector` fails, enable pgvector via
-- Database → Extensions → "vector", then re-run.
-- ============================================================

-- 1) pgvector for material embeddings -------------------------
create extension if not exists vector;

-- 2) Core tables ----------------------------------------------
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id) on delete set null,
  title text not null,
  subject text not null default 'General',
  source_type text not null default 'text' check (source_type in ('text', 'pdf')),
  char_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.material_chunks (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now(),
  unique (material_id, chunk_index)
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  question text not null,
  options jsonb not null,
  answer_index integer not null,
  expected_reasoning text not null default '',
  citation text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references auth.users(id) on delete set null,
  material_id uuid references public.materials(id) on delete set null,
  question text not null,
  student_answer text not null default '',
  student_reasoning text not null default '',
  correct boolean not null,
  confidence numeric(4, 3) not null default 0,
  feedback text not null default '',
  created_at timestamptz not null default now()
);

-- 3) Vector search RPC (cosine similarity over chunks) --------
create or replace function public.match_material_chunks(
  query_embedding vector(768),
  match_count integer default 6,
  p_material_id uuid default null
)
returns table (
  chunk_id uuid,
  material_id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    mc.id,
    mc.material_id,
    mc.content,
    1 - (mc.embedding <=> query_embedding) as similarity
  from public.material_chunks mc
  where
    mc.embedding is not null
    and (p_material_id is null or mc.material_id = p_material_id)
  order by mc.embedding <=> query_embedding
  limit match_count;
$$;

-- 4) Row Level Security ---------------------------------------
alter table public.materials enable row level security;
alter table public.material_chunks enable row level security;
alter table public.quizzes enable row level security;
alter table public.diagnoses enable row level security;

-- Demo-friendly policies: the service-role API handles writes;
-- browsers may read. Tighten for real production multi-tenancy:
--   e.g. `using (auth.uid() = teacher_id)` for teacher-only rows.
create policy "materials readable" on public.materials
  for select using (true);
create policy "chunks readable" on public.material_chunks
  for select using (true);
create policy "quizzes readable" on public.quizzes
  for select using (true);
create policy "diagnoses insert" on public.diagnoses
  for insert with check (true);
create policy "diagnoses readable own" on public.diagnoses
  for select using (true);

-- 5) Search index for fast similarity queries -----------------
create index if not exists material_chunks_embedding_idx
  on public.material_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
