// ──────────── Shared helpers ────────────

export function mosGradeClass(mos: number): string {
    if (mos >= 4.0) return 'mos-excellent';
    if (mos >= 3.0) return 'mos-good';
    if (mos >= 2.0) return 'mos-fair';
    return 'mos-poor';
}

export function mosGradeLetter(mos: number): string {
    if (mos >= 4.0) return 'A';
    if (mos >= 3.5) return 'B';
    if (mos >= 3.0) return 'C';
    if (mos >= 2.0) return 'D';
    return 'F';
}

export function fmtDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ISO 3166 country name → ISO numeric for react-simple-maps matching
export const COUNTRY_NAME_TO_ISO: Record<string, string> = {
    'US': '840', 'USA': '840', 'United States': '840',
    'GB': '826', 'UK': '826', 'United Kingdom': '826',
    'CN': '156', 'China': '156',
    'JP': '392', 'Japan': '392',
    'DE': '276', 'Germany': '276',
    'FR': '250', 'France': '250',
    'IN': '356', 'India': '356',
    'BR': '076', 'Brazil': '076',
    'AU': '036', 'Australia': '036',
    'CA': '124', 'Canada': '124',
    'RU': '643', 'Russia': '643',
    'KR': '410', 'South Korea': '410',
    'SG': '702', 'Singapore': '702',
    'HK': '344', 'Hong Kong': '344',
    'NL': '528', 'Netherlands': '528',
    'SE': '752', 'Sweden': '752',
    'ES': '724', 'Spain': '724',
    'IT': '380', 'Italy': '380',
    'MX': '484', 'Mexico': '484',
    'PH': '608', 'Philippines': '608',
};

export const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

export const TIME_OPTIONS = [
    { label: '1H', value: 1 },
    { label: '6H', value: 6 },
    { label: '24H', value: 24 },
    { label: '7D', value: 168 },
];
