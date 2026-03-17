export function normalizeSIP(uri: string): string {
    if (!uri) return ""
    // 从 "user" <sip:user@domain> 或 sip:user@domain 或 user 提取user part
    // Simple logic: match numbers or text before @
    const match = uri.match(/sip:([^@]+)/) || uri.match(/^(\d+)$/) || uri.match(/^([^"<]+)/)
    return match ? match[1].trim() : uri.trim()
}

export function getInitials(name: string): string {
    const clean = normalizeSIP(name)
    return clean.slice(0, 2).toUpperCase()
}
