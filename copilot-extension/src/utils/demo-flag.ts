// 编译时常量 — Plasmo/Parcel 在 build 时内联 env var
// production build 不设此变量 → false → tree-shaking 移除所有 demo 分支
declare const process: { env: Record<string, string | undefined> }
export const DEMO_ENABLED = process.env.PLASMO_PUBLIC_ENABLE_DEMO === 'true'
