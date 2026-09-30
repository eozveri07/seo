# PostgreSQL 17 + pgvector (base image) + pg_partman
# pg_trgm ve unaccent contrib ile birlikte gelir.
# Extension'lar migration ile oluşturulur (CREATE EXTENSION), burada sadece kurulur.
FROM pgvector/pgvector:pg17

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-17-partman \
 && rm -rf /var/lib/apt/lists/*
