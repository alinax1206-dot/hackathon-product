import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { normalizedPitch } from '../src/soundMapping.js';
import { valueToFrequency, buildArrangement, MIN_FREQUENCY, MAX_FREQUENCY } from '../src/arrangement.js';
import { summarizeValues, validateSuggestion, createSoundAdvisorMiddleware } from '../server/ai-sound-advisor.js';
const dataset = {title:'test', xAxis:'Name', series:[{key:'value'}], data:[2,3,4,5,100].map((n,i)=>({label:`${i}`,values:{value:n}}))};
test('default mapping stays linear and accepts constant data',()=>{
  assert.equal(valueToFrequency(2,{min:2,max:100}),MIN_FREQUENCY);
  assert.equal(valueToFrequency(100,{min:2,max:100}),MAX_FREQUENCY);
  assert.equal(valueToFrequency(51,{min:2,max:100}),440);
  assert.equal(normalizedPitch(4,{min:4,max:4}),0.5);
});
test('contrast mapping increases low-end differences without changing data',()=>{
  const range={min:2,max:100};
  assert.ok(valueToFrequency(3,range,'contrast')>valueToFrequency(3,range));
  assert.equal(valueToFrequency(2,range,'contrast'),MIN_FREQUENCY);
  assert.equal(valueToFrequency(100,range,'contrast'),MAX_FREQUENCY);
  assert.throws(()=>normalizedPitch(3,range,'bad'),/Unknown/);
});
test('recorded musical notes receive mapping while background remains',()=>{
  const linear=buildArrangement(dataset,{playback:'points'});
  const contrast=buildArrangement(dataset,{playback:'points',mapping:'contrast'});
  assert.ok(contrast.steps[1].notes[0].frequency>linear.steps[1].notes[0].frequency);
  const music=buildArrangement(dataset,{playback:'music',mapping:'contrast'});
  assert.ok(music.steps.some(step=>step.notes.some(note=>note.accompaniment)));
  assert.equal(dataset.data[1].values.value,3);
});
test('summary request contains no labels and AI response is validated',()=>{
  const stats=summarizeValues([2,3,4,5,100]);
  assert.equal(stats.median,4);
  assert.equal(stats.min,2);
  assert.ok(!JSON.stringify(stats).includes('City'));
  assert.equal(validateSuggestion({mapping:'linear',reason:'works'}).mapping,'linear');
  assert.throws(()=>validateSuggestion({mapping:'unknown',reason:'x'}));
});
async function call(app,values=[2,3,4,5,100]){
  const req=Readable.from([JSON.stringify({values})]);req.method='POST';
  const res={statusCode:200,setHeader(){},end(str){this.result=JSON.parse(str)}};
  await app(req,res);return res;
}
test('mock Tinker receives statistics only, not complete raw values',async()=>{
  let request;
  const app=createSoundAdvisorMiddleware({getTinkerApiKey:()=> 'test-key',getTinkerModelPath:()=> 'tinker://test:train:0/sampler_weights/sample',fetchImpl:async(_url,opts)=>{request=opts;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({mapping:'contrast',reason:'Lower values cluster together.'})}}]})}}});
  const result=await call(app);
  assert.equal(result.result.mapping,'contrast');
  const body=JSON.parse(request.body);
  assert.ok(body.messages[0].content.includes('upperQuartileFraction'));
  assert.ok(!body.messages[0].content.includes('[2,3,4,5,100]'));
});
test('missing API key does not impact standard mapping',async()=>{
  const app=createSoundAdvisorMiddleware({getTinkerApiKey:()=>''});
  const result=await call(app);
  assert.equal(result.statusCode,503);
  assert.match(result.result.error,/TINKER_API_KEY/);
  assert.equal(valueToFrequency(3,{min:2,max:100}),MIN_FREQUENCY+(1/98)*(MAX_FREQUENCY-MIN_FREQUENCY));
});
