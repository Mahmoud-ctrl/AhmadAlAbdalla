const INTERNAL_AUTH_DOMAIN = 'alabdallah.internal'

export function authEmailForUsername(username: string) {
  return `${username.trim().toLowerCase()}@${INTERNAL_AUTH_DOMAIN}`
}
