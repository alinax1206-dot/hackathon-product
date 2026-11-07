import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createSoundAdvisorMiddleware, validateSuggestion } from '../server/ai-sound-advisor.js';

test('Tinker style recommendation keeps summary-only request and existing fields', async () => {
  let request;
  const middleware = createSoundAdvisorMiddleware({
    getProvider: () => 'tinker',
    getTinkerApiKey: () => 'test-key',
    getTinkerModelPath: () => 'tinker://test:train:0/sampler_weights/sample',
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"mapping":"contrast","style":"luminous","reason":"The lower values are clustered."}' } }] }) };
    },
  });
  const req = Readable.from(['{"values":[2,3,4,5,100]}']);
  req.method = 'POST';
  const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await middleware(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { mapping: 'contrast', style: 'luminous', reason: 'The lower values are clustered.' });
  assert.match(request.messages[0].content, /music style/);
  assert.doesNotMatch(request.messages[0].content, /\[2,3,4,5,100\]/);
});

test('style validation rejects unknown presets and supports old responses', () => {
  assert.throws(() => validateSuggestion({ mapping: 'linear', style: 'unknown', reason: 'x' }));
  assert.equal(validateSuggestion({ mapping: 'linear', reason: 'x' }).style, 'acoustic');
});
