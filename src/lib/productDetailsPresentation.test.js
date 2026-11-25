import test from 'node:test';
import assert from 'node:assert/strict';
import { splitProductComposition } from './productDetailsPresentation.js';

test('shows every botanical row while separating wrapping from flowers', () => {
  const input = [{name:'Упаковка дизайнерская',quantity:'6'},{name:'Лента органза',quantity:'2'},...Array.from({length:7},(_,i)=>({name:`Цветок ${i}`,quantity:String(i+1)}))];
  const {botanical,packaging}=splitProductComposition(input);
  assert.equal(botanical.length,7);assert.equal(packaging.length,2);
  assert.equal(botanical[6].quantity,'7');
});

test('understands cached UI composition without inventing missing quantities', () => {
  assert.deepEqual(splitProductComposition(['Роза импортная · 5','Эвкалипт','Лента атласная · 1']),{botanical:[{name:'Роза импортная',quantity:'5'},{name:'Эвкалипт',quantity:''}],packaging:[{name:'Лента атласная',quantity:'1'}]});
});
