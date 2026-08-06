import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isValidEmail } from '../lib/email.js';

test('emails válidos', () => {
  for (const e of [
    'a@b.co',
    'admin@techstore.local',
    'user.name+tag@example.org',
    'x@y.io',
  ]) {
    assert.equal(isValidEmail(e), true, `debería ser válido: ${e}`);
  }
});

test('emails inválidos', () => {
  for (const e of [
    '',
    'plainstring',
    '@nodomain.com',
    'noat.com',
    'two@@ats.com',
    'has space@x.com',
    'noend@',
  ]) {
    assert.equal(isValidEmail(e), false, `debería ser inválido: ${JSON.stringify(e)}`);
  }
});

test('no-string → false', () => {
  for (const v of [null, undefined, 0, 1, true, false, [], {}, { toString: () => 'a@b.co' }]) {
    assert.equal(isValidEmail(v), false, `debería ser inválido: ${JSON.stringify(v)}`);
  }
});
