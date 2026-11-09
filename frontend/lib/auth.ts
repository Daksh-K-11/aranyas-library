// export const API_BASE_URL = 'http://192.168.68.116:8000'
export const API_BASE_URL = 'http://localhost:8000'
// export const API_BASE_URL = 'http://192.168.29.125:8000'
// export const API_BASE_URL = 'https://library-management-system-ehtg.onrender.com'

export async function storeToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("athenaeum_token", token)
  }
}

export function getToken() {
  if (typeof window !== "undefined") {
    return localStorage.getItem("athenaeum_token")
  }
  return null
}
