import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useContainerWidth } from '~/hooks/useContainerWidth'

describe('useContainerWidth', () => {
    it('初始宽度为 0', () => {
        const { result } = renderHook(() => useContainerWidth())
        expect(result.current.width).toBe(0)
    })

    it('ref 是可调用的 callback ref', () => {
        const { result } = renderHook(() => useContainerWidth())
        expect(typeof result.current.ref).toBe('function')
    })

    it('isWide = false when width < 580', () => {
        const { result } = renderHook(() => useContainerWidth())
        expect(result.current.isWide).toBe(false)
    })

    it('isExtraWide = false when width < 880', () => {
        const { result } = renderHook(() => useContainerWidth())
        expect(result.current.isExtraWide).toBe(false)
    })
})
