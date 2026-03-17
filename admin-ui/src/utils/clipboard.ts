/**
 * 安全的剪贴板写入，兼容 HTTP 局域网环境
 * navigator.clipboard 仅在 Secure Context (HTTPS/localhost) 可用，
 * HTTP + 局域网 IP 访问时 fallback 到 execCommand
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    // Secure Context → 直接用 Clipboard API
    if (window.isSecureContext && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // 权限被拒等极端情况，走 fallback
        }
    }

    // Fallback: 临时 textarea + execCommand
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        // 隐藏但保持可选中（不能 display:none，否则 execCommand 不生效）
        textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        return ok;
    } catch {
        return false;
    }
}
