-- Family magazine articles, engagement and protected media.

create table if not exists public.family_magazine_articles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  summary text,
  content text not null,
  category text not null default 'story'
    check (category in ('story', 'achievement', 'recipe', 'history', 'announcement', 'obituary', 'other')),
  tags text[] not null default '{}',
  visibility text not null default 'family'
    check (visibility in ('family', 'admins')),
  status text not null default 'pending'
    check (status in ('draft', 'pending', 'published', 'archived')),
  featured boolean not null default false,
  published_at timestamptz,
  author_user_id text not null,
  author_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_magazine_articles_family_idx
  on public.family_magazine_articles(family_id, status, featured desc, published_at desc nulls last, created_at desc);

create table if not exists public.magazine_article_comments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  article_id uuid not null references public.family_magazine_articles(id) on delete cascade,
  body text not null,
  author_user_id text not null,
  author_name text not null,
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists magazine_article_comments_article_idx
  on public.magazine_article_comments(family_id, article_id, status, created_at);

create table if not exists public.magazine_article_reactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  article_id uuid not null references public.family_magazine_articles(id) on delete cascade,
  user_id text not null,
  reaction_key text not null default 'like' check (reaction_key in ('like')),
  created_at timestamptz not null default now(),
  unique (article_id, user_id, reaction_key)
);

create index if not exists magazine_article_reactions_article_idx
  on public.magazine_article_reactions(family_id, article_id);

create table if not exists public.magazine_media (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  article_id uuid not null references public.family_magazine_articles(id) on delete cascade,
  media_type text not null default 'cover' check (media_type in ('cover', 'image', 'video', 'document')),
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  uploaded_by_user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists magazine_media_article_idx
  on public.magazine_media(family_id, article_id, media_type, created_at desc);

alter table public.family_magazine_articles enable row level security;
alter table public.magazine_article_comments enable row level security;
alter table public.magazine_article_reactions enable row level security;
alter table public.magazine_media enable row level security;
