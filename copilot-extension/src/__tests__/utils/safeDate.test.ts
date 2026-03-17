import { describe, it, expect } from 'vitest'
import { safeDate } from '~/utils/safeDate'

describe('safeDate', () => {
    it('null/undefined 返回 now', () => {
        const now = Date.now()
        const d = safeDate(null)
        expect(d.getTime()).toBeGreaterThanOrEqual(now - 100)
    })

    it('Date 实例直接返回', () => {
        const original = new Date('2026-01-15T12:00:00Z')
        expect(safeDate(original)).toBe(original)
    })

    it('ClickHouse 格式 "YYYY-MM-DD HH:MM:SS" → UTC', () => {
        const d = safeDate('2026-02-18 07:06:00')
        expect(d.toISOString()).toBe('2026-02-18T07:06:00.000Z')
    })

    it('ISO 格式无 Z → 补 Z', () => {
        const d = safeDate('2026-02-18T07:06:00')
        expect(d.toISOString()).toBe('2026-02-18T07:06:00.000Z')
    })

    it('ISO 格式带 Z 不变', () => {
        const d = safeDate('2026-02-18T07:06:00Z')
        expect(d.toISOString()).toBe('2026-02-18T07:06:00.000Z')
    })

    it('带时区偏移的不补 Z', () => {
        const d = safeDate('2026-02-18T07:06:00+08:00')
        // 08:00 +8 → UTC 前一天 23:06
        expect(d.getUTCHours()).toBe(23)
        expect(d.getUTCDate()).toBe(17)
    })

    it('无效字符串返回 now', () => {
        const now = Date.now()
        const d = safeDate('not-a-date')
        expect(d.getTime()).toBeGreaterThanOrEqual(now - 100)
    })

    it('空字符串行为等同 null', () => {
        const now = Date.now()
        const d = safeDate('')
        expect(d.getTime()).toBeGreaterThanOrEqual(now - 100)
    })
})
