// 有上限的 Set — 超出 maxSize 时自动淘汰最早条目
// 用于消息去重等场景，防止 Set 无限增长导致内存泄漏

export class BoundedSet<T> {
    private _set = new Set<T>()
    private _queue: T[] = []
    private _maxSize: number

    constructor(maxSize: number) {
        this._maxSize = maxSize
    }

    has(value: T): boolean {
        return this._set.has(value)
    }

    add(value: T): void {
        if (this._set.has(value)) return
        this._set.add(value)
        this._queue.push(value)
        // 超限淘汰
        while (this._queue.length > this._maxSize) {
            const oldest = this._queue.shift()!
            this._set.delete(oldest)
        }
    }

    clear(): void {
        this._set.clear()
        this._queue = []
    }

    get size(): number {
        return this._set.size
    }
}
