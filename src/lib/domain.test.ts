import test from 'node:test'
import assert from 'node:assert/strict'
import { districtIsRequired, formatAnswers, getRecoveryCode, isExpired, selectEdition, validRecoveryCode } from './domain.ts'

test('expiry uses the exact 168 elapsed-hour boundary', () => {
  const lastActivity = 1_000_000
  assert.equal(isExpired(lastActivity, lastActivity + 168 * 60 * 60 * 1000 - 1), false)
  assert.equal(isExpired(lastActivity, lastActivity + 168 * 60 * 60 * 1000), true)
})

test('recovery code is URL-safe, exactly 256 random bits and accepted by validation', () => {
  const code = getRecoveryCode()
  assert.equal(code.length, 43)
  assert.match(code, /^[A-Za-z0-9_-]{43}$/u)
  assert.equal(validRecoveryCode(code), true)
  assert.equal(validRecoveryCode(`${code}x`), false)
  assert.notEqual(getRecoveryCode(), getRecoveryCode())
})

test('vacancy display renders English prior-holder context without changing canonical answers', () => {
  assert.deepEqual(formatAnswers({ answers: ['Vacant'], answer_display: 'Vacant (previously: Maria Elvira Salazar)' }), ['Vacant (previously: Maria Elvira Salazar)'])
  assert.deepEqual(formatAnswers({ answers: ['Washington'], answer_display: 'Washington' }), ['Washington'])
})

test('both filing cohorts remain distinct and only multi-district jurisdictions require a choice', () => {
  assert.equal(selectEdition('2008'), '2008')
  assert.equal(selectEdition('2025'), '2025')
  assert.equal(districtIsRequired(1), false)
  assert.equal(districtIsRequired(0), false)
  assert.equal(districtIsRequired(2), true)
})
