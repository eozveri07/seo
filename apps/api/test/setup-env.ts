const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  API_PREFIX: '/api/v1',
  PANEL_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgres://seo:seo@localhost:5432/seo_test',
  REDIS_URL: 'redis://localhost:6379',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
