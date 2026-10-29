import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cents,calculate,quoteNumber,normalizePhone} from '../js/quote-core.mjs';
test('centavos exatos para valores monetários',()=>{
 assert.equal(cents('0.29'),29);assert.equal(cents('2413.35'),241335);
 const q=calculate([{description:'Cinta',quantity:3,price:'0.10'}],'0.20','0.01');
 assert.equal(q.total_cents,49);
});
test('rejeita desconto excessivo em vez de esconder total negativo',()=>assert.throws(()=>calculate([{description:'Cinta',quantity:1,price:'10'}],'0','11')));
test('rejeita itens inválidos e limites',()=>{
 for(const value of ['NaN','Infinity','-1','1.001','',null]) assert.throws(()=>cents(value));
 for(const quantity of [0,-1,1.5,Infinity,1000001]) assert.throws(()=>calculate([{description:'Cinta',quantity,price:'1'}],'0','0'));
 assert.throws(()=>calculate([],'0','0'));assert.throws(()=>calculate([{description:' ',quantity:1,price:'1'}],'0','0'));
});
test('GL não trunca numeração acima de 9999',()=>{assert.equal(quoteNumber(1),'GL0001');assert.equal(quoteNumber(10000),'GL10000')});
test('WhatsApp preserva DDI e rejeita número incompleto',()=>{
 assert.equal(normalizePhone('(11) 99999-9999'),'5511999999999');
 assert.equal(normalizePhone('+55 11 99999-9999'),'5511999999999');
 assert.throws(()=>normalizePhone('123'));assert.equal(normalizePhone(''),'');
});
