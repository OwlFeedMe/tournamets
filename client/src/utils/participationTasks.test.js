import { test } from 'node:test'
import assert from 'node:assert/strict'
import { participationTasks } from './participationTasks.js'

const event = { id: 8, nombre: 'Aethernum League', open_status: 'qualified', avatar_photo_required: true }

test('qualification shows both tasks even with registration closed', () => {
  const [task] = participationTasks([{ ...event, enrollment_open: 0 }])
  assert.equal(task.needsPayment, true)
  assert.equal(task.needsPhoto, true)
  assert.equal(task.href, '/competitions/8/participation')
})

test('uploading a photo preserves payment and paying preserves the photo task', () => {
  assert.equal(participationTasks([{ ...event, avatar_photo_uploaded: true }])[0].needsPayment, true)
  const [paid] = participationTasks([{ ...event, open_status: 'confirmed', enrollment_estado: 'confirmado' }])
  assert.equal(paid.needsPayment, false)
  assert.equal(paid.needsPhoto, true)
  assert.deepEqual(participationTasks([{ ...event, open_status: 'confirmed', avatar_photo_uploaded: true }]), [])
})

test('unqualified athletes and events without a photo request get no photo prompt', () => {
  assert.deepEqual(participationTasks(['submitted', 'paid', 'rejected', 'preregistered'].map((open_status, id) => ({ ...event, id, open_status }))), [])
  assert.equal(participationTasks([{ ...event, avatar_photo_required: false }])[0].needsPhoto, false)
  assert.deepEqual(participationTasks([]), [])
})
