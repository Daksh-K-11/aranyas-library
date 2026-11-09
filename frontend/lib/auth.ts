const TOKEN_KEY = "athenaeum_token"

export function storeToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {}
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return null
    if (isExpired(token)) {
      localStorage.removeItem(TOKEN_KEY)
      return null
    }
    return token
  } catch {
    return null
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

/** Reads the exp claim without verifying it (the server verifies). */
function isExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    return typeof payload.exp === "number" && payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}
