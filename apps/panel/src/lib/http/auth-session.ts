export type AuthTokens = {
  accessToken: string
}

let accessToken: string | null = null
let activeOrgId: string | null = null

export const authSession = {
  getAccessToken(): string | null {
    return accessToken
  },
  setAccessToken(token: string | null): void {
    accessToken = token
  },
  getActiveOrgId(): string | null {
    return activeOrgId
  },
  setActiveOrgId(orgId: string | null): void {
    activeOrgId = orgId
  },
  clear(): void {
    accessToken = null
    activeOrgId = null
  },
}
