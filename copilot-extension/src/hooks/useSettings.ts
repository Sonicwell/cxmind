
import { useStorage } from "@plasmohq/storage/hook"

export interface Settings {
    enableClickToCall: boolean
    enablePIP: boolean
    summaryAutoSaveDelay: number // 秒, Summary 自动保存倒计时
}

export const INITIAL_SETTINGS: Settings = {
    enableClickToCall: true,
    enablePIP: true,
    summaryAutoSaveDelay: 30,
}

export function useSettings() {
    const [settings, setSettings] = useStorage<Settings>("user-settings", INITIAL_SETTINGS)

    const toggleSetting = (key: keyof Settings) => {
        setSettings((prev) => {
            const current = prev || INITIAL_SETTINGS
            return {
                ...current,
                [key]: !current[key]
            }
        })
    }

    return {
        settings: settings || INITIAL_SETTINGS,
        setSettings,
        toggleSetting
    }
}
