const appEnv = String(import.meta.env.VITE_APP_ENV || '').trim().toLowerCase()
const paymentsFlag = String(import.meta.env.VITE_PAYMENTS_ENABLED ?? '').trim().toLowerCase()

export const isStageEnvironment = appEnv === 'stage' || appEnv === 'staging'
export const paymentsDisabled = isStageEnvironment || ['0', 'false', 'no', 'off', 'disabled'].includes(paymentsFlag)
