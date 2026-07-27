-- Runs once when the Postgres data volume is first initialized.
-- Enables pgvector so the ExperienceBullet.embedding vector(1024) column
-- (build brief Section 4) can be created by Prisma migrations.
-- Prisma also declares this extension (postgresqlExtensions preview) so
-- `prisma migrate` keeps it in sync; creating it here makes a fresh DB usable
-- immediately even before the first migration.
CREATE EXTENSION IF NOT EXISTS vector;
