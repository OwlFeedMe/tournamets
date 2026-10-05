import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openLandingAction, openRegistrationState, openSubmissionState, openFieldLabel } from './openQualifier.js'

test('RM label follows the selected workout and falls back before selection', () => {
  const field = { label: '1RM según versión (lb)', label_source: 'workout_version', label_options: { 'Rookie/Scaled': '1RM de back squat (lb)', 'Intermediate/Advanced': '1RM de clean (lb)' } }
  assert.equal(openFieldLabel(field), field.label)
  assert.equal(openFieldLabel(field, { workout_version: 'Rookie/Scaled' }), '1RM de back squat (lb)')
  assert.equal(openFieldLabel(field, { workout_version: 'Intermediate/Advanced' }), '1RM de clean (lb)')
  assert.equal(openFieldLabel({ label: 'AMRAP 1' }), 'AMRAP 1')
})

test('visitor or administrator without an entry never sees ownership language', () => {
  assert.deepEqual(openLandingAction({ available: false }, null), { mode: 'notify', label: 'Notificarme cuando abra el Open' })
  assert.equal(openLandingAction({ available: true }, null).label, 'Participar en el Open')
})
test('paid entry remains accessible after registration closes', () => {
  assert.equal(openLandingAction({ available: false, closed: true }, { status: 'submitted' }).label, 'Ver mi Open')
  assert.equal(openLandingAction({ closed: true }, { status: 'qualified' }).label, 'Confirmar mi cupo')
})
test('an expired Open does not promise an opening notification', () => {
  const registration = openRegistrationState({ activa: 1 }, { deadline: '2026-09-01T00:00:00Z' }, [], Date.parse('2026-09-10T00:00:00Z'))
  assert.equal(openLandingAction(registration, null).mode, 'closed')
})
test('registration needs an enabled category and an open window', () => {
  const comp = { activa: 1, enrollment_open: 1 }
  const cfg = { deadline: '2026-10-01T00:00:00Z' }
  const now = Date.parse('2026-09-10T00:00:00Z')
  assert.equal(openRegistrationState(comp, cfg, [], now).available, false)
  assert.equal(openRegistrationState(comp, cfg, [{ modality: 'individual', registration_enabled: 1 }], now).available, true)
})

test('submission window opens at the configured instant and closes at the deadline', () => {
  const config = { submissions_open_at: '2026-10-01T05:00:00Z', deadline: '2026-10-10T05:00:00Z' }
  assert.equal(openSubmissionState(config, Date.parse('2026-10-01T04:59:59Z')), 'upcoming')
  assert.equal(openSubmissionState(config, Date.parse(config.submissions_open_at)), 'open')
  assert.equal(openSubmissionState(config, Date.parse(config.deadline)), 'closed')
  assert.equal(openSubmissionState({ deadline: config.deadline }, Date.parse(config.submissions_open_at)), 'open')
})

test('unpaid preregistration stays accessible after new registrations close', () => {
  assert.equal(openLandingAction({ available: false, closed: true }, { status: 'preregistered' }).mode, 'entry')
})
