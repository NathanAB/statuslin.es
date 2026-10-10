// The one header we trust for the client IP. Fly's proxy sets Fly-Client-IP from the real edge
// connection and overwrites any value a client sends, so it can't be forged (unlike
// X-Forwarded-For, which keeps a client-supplied leftmost entry).
export const CLIENT_IP_HEADER = 'fly-client-ip'
