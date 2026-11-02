-- Abuse, spam and free-work strikes per chat: the third closes it and blocks the visitor's address.
alter table conversations add column strikes integer not null default 0;
-- Blocked addresses, hashed. `times` counts repeat blocks: the second one lasts a month.
create table blocks (ip_hash text primary key, until integer not null, times integer not null default 1, created_at integer not null);
