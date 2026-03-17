import { describe, it, expect, vi, beforeEach } from 'vitest'

// BoundedSet: P0-3 修复的核心数据结构
import { BoundedSet } from '~/utils/bounded-set'

describe('BoundedSet', () => {
    it('正常添加和查询', () => {
        const set = new BoundedSet<string>(5)
        set.add('a')
        set.add('b')
        expect(set.has('a')).toBe(true)
        expect(set.has('b')).toBe(true)
        expect(set.has('c')).toBe(false)
    })

    it('超过上限时淘汰最早条目', () => {
        const set = new BoundedSet<string>(3)
        set.add('a')
        set.add('b')
        set.add('c')
        // 满了
        expect(set.has('a')).toBe(true)
        set.add('d')
        // 'a' 被淘汰
        expect(set.has('a')).toBe(false)
        expect(set.has('b')).toBe(true)
        expect(set.has('d')).toBe(true)
        expect(set.size).toBe(3)
    })

    it('重复添加不增长 size', () => {
        const set = new BoundedSet<string>(5)
        set.add('a')
        set.add('a')
        set.add('a')
        expect(set.size).toBe(1)
    })

    it('clear 清空所有条目', () => {
        const set = new BoundedSet<string>(5)
        set.add('a')
        set.add('b')
        set.clear()
        expect(set.size).toBe(0)
        expect(set.has('a')).toBe(false)
    })

    it('边界情况: maxSize=1', () => {
        const set = new BoundedSet<string>(1)
        set.add('a')
        expect(set.has('a')).toBe(true)
        set.add('b')
        expect(set.has('a')).toBe(false)
        expect(set.has('b')).toBe(true)
    })

    it('大批量插入性能不崩溃', () => {
        const set = new BoundedSet<string>(500)
        for (let i = 0; i < 2000; i++) {
            set.add(`msg-${i}`)
        }
        expect(set.size).toBe(500)
        // 最早的 1500 条已淘汰
        expect(set.has('msg-0')).toBe(false)
        // 最近 500 条存在
        expect(set.has('msg-1999')).toBe(true)
        expect(set.has('msg-1500')).toBe(true)
    })
})
