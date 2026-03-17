import { describe, it, expect } from 'vitest'
import { cn } from '~/utils/cn'

describe('cn', () => {
    it('合并多个类名', () => {
        expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('过滤 falsy 值', () => {
        expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar')
    })

    it('空参数返回空字符串', () => {
        expect(cn()).toBe('')
    })

    it('全 falsy 返回空字符串', () => {
        expect(cn(false, null, undefined)).toBe('')
    })

    it('条件类名', () => {
        const active = true
        const disabled = false
        expect(cn('btn', active && 'active', disabled && 'disabled')).toBe('btn active')
    })
})
