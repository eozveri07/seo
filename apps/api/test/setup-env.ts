const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  API_PREFIX: '/api/v1',
  PANEL_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgres://seo:seo@localhost:5432/seo_test',
  DATABASE_SKIP_INITIALIZATION: 'true',
  REDIS_URL: 'redis://localhost:6379',
  ENCRYPTION_KEY: 'uwdVDa7iNK3qgjIKPO4eBy3UcXmr8/t5zLh8MTJI82g=',
  JWT_ACCESS_SECRET: 'placeholder-jwt-access-secret-32-chars-min',
  JWT_ACCESS_TTL: '900',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
