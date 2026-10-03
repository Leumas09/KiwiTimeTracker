declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
declare const __APP_BUILT_AT__: string

/** Build identity, injected by Vite (see vite.config.ts). */
export const APP_VERSION = __APP_VERSION__
export const APP_COMMIT = __APP_COMMIT__
export const APP_COMMIT_SHORT = __APP_COMMIT__.slice(0, 7)
export const APP_BUILT_AT = new Date(__APP_BUILT_AT__)
export const APP_COMMIT_URL = __APP_COMMIT__ ? `https://github.com/Leumas09/KiwiTimeTracker/commit/${__APP_COMMIT__}` : null

/** "v1.1.0 · 84fd3e3" */
export const APP_VERSION_LABEL = `v${APP_VERSION}${APP_COMMIT_SHORT ? ` · ${APP_COMMIT_SHORT}` : ''}`
