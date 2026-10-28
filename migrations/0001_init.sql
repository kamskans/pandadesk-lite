-- Settings the admin can change (name, colour, greeting, starter questions).
create table settings (key text primary key, value text not null);

-- A website to read, or a piece of text pasted in.
create table sources (
  id integer primary key autoincrement,
  kind text not null check (kind in ('website', 'text')),
  url text,
  title text not null,
  body text,
  status text not null default 'pending',
  error text,
  created_at integer not null,
  synced_at integer
);

-- Pages of a website, and whether each has been read yet.
create table pages (
  id integer primary key autoincrement,
  source_id integer not null references sources(id) on delete cascade,
  url text not null,
  title text,
  hash text,
  status text not null default 'pending',
  error text,
  updated_at integer not null,
  unique (source_id, url)
);

create table pinned (
  id integer primary key autoincrement,
  question text not null,
  answer text not null,
  created_at integer not null
);

-- What search looks through: passages of pages and texts, plus pinned answers.
create table chunks (
  id integer primary key autoincrement,
  source_id integer references sources(id) on delete cascade,
  page_id integer references pages(id) on delete cascade,
  pinned_id integer references pinned(id) on delete cascade,
  url text,
  title text not null,
  text text not null
);
create index chunks_source on chunks(source_id);
create index chunks_page on chunks(page_id);

create virtual table chunks_fts using fts5(title, text, content='chunks', content_rowid='id', tokenize='porter unicode61');
create trigger chunks_ai after insert on chunks begin
  insert into chunks_fts(rowid, title, text) values (new.id, new.title, new.text);
end;
create trigger chunks_ad after delete on chunks begin
  insert into chunks_fts(chunks_fts, rowid, title, text) values ('delete', old.id, old.title, old.text);
end;

create table conversations (
  id text primary key,
  token_hash text not null,
  email text,
  name text,
  -- bot: the AI answers; waiting: asked for a person; open: the team replied; closed.
  status text not null default 'bot',
  unread integer not null default 0,
  page_url text,
  created_at integer not null,
  updated_at integer not null
);
create index conversations_updated on conversations(updated_at);

create table messages (
  id integer primary key autoincrement,
  conversation_id text not null references conversations(id) on delete cascade,
  role text not null check (role in ('visitor', 'bot', 'admin', 'note')),
  body text not null,
  sources text,
  created_at integer not null
);
create index messages_conversation on messages(conversation_id, id);

create table rate (key text primary key, count integer not null, reset_at integer not null);
