import { describe, it, expect } from 'vitest'
import { normalizeSIP, getInitials } from '~/utils/sip'

describe('normalizeSIP', () => {
    it('从 sip:user@domain 提取 user', () => {
        expect(normalizeSIP('sip:1001@pbx.example.com')).toBe('1001')
    })

    it('从 "name" <sip:user@domain> 提取 user', () => {
        expect(normalizeSIP('"Agent" <sip:8001@pbx.example.com>')).toBe('8001')
    })

    it('纯数字直接返回', () => {
        expect(normalizeSIP('8001')).toBe('8001')
    })

    it('普通文本直接 trim', () => {
        expect(normalizeSIP(' Agent Smith ')).toBe('Agent Smith')
    })

    it('空字符串返回空', () => {
        expect(normalizeSIP('')).toBe('')
    })
})

describe('getInitials', () => {
    it('从 SIP URI 取前两位大写', () => {
        expect(getInitials('sip:8001@pbx.com')).toBe('80')
    })

    it('从名字取前两位大写', () => {
        expect(getInitials('Alice')).toBe('AL')
    })

    it('空字符串返回空', () => {
        expect(getInitials('')).toBe('')
    })
})
