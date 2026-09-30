import { defineConfig } from 'orval'

export default defineConfig({
  api: {
    input: '../api/openapi.json',
    output: {
      target: 'src/api/endpoints.ts',
      client: 'react-query',
      httpClient: 'fetch',
      mode: 'tags-split',
      clean: true,
      override: {
        mutator: {
          path: 'src/lib/http/custom-fetch.ts',
          name: 'customFetch',
        },
      },
    },
  },
})
