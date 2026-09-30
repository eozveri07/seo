let inFlightRefresh: Promise<boolean> | null = null

/**
 * Deduplicates concurrent refresh attempts: the first caller triggers `refresh`,
 * every other caller that arrives while it is pending awaits the same result.
 */
export async function refreshAccessToken(refresh: () => Promise<boolean>): Promise<boolean> {
  if (!inFlightRefresh) {
    inFlightRefresh = refresh().finally(() => {
      inFlightRefresh = null
    })
  }
  return inFlightRefresh
}
