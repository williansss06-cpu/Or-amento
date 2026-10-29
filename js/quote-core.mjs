export function cents(value) {
  const s=String(value).trim();
  if(!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Informe valores positivos com até duas casas decimais.');
  const [whole,fraction='']=s.split('.');
  const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(n)||n>100000000000) throw new Error('Valor acima do limite permitido.');
  return n;
}
export function calculate(items,shipping,discount) {
  if(!Array.isArray(items)||!items.length||items.length>100) throw new Error('Informe entre 1 e 100 produtos.');
  const lines=items.map(item=>{
    const description=String(item.description||'').trim();
    const quantity=Number(item.quantity),unit_price_cents=cents(item.price);
    if(!description||description.length>500) throw new Error('Preencha a descrição de cada produto (até 500 caracteres).');
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000) throw new Error('Quantidade deve ser inteira, de 1 a 1.000.000.');
    const line_total_cents=quantity*unit_price_cents;
    if(!Number.isSafeInteger(line_total_cents)||line_total_cents>100000000000) throw new Error('Subtotal acima do limite permitido.');
    return {description,quantity,unit_price_cents,line_total_cents};
  });
  const subtotal_cents=lines.reduce((n,x)=>n+x.line_total_cents,0);
  const shipping_cents=cents(shipping),discount_cents=cents(discount);
  const total_cents=subtotal_cents+shipping_cents-discount_cents;
  if(total_cents<0) throw new Error('Desconto não pode superar produtos e frete.');
  if(!Number.isSafeInteger(total_cents)||total_cents>100000000000) throw new Error('Total acima do limite permitido.');
  return {items:lines,subtotal_cents,shipping_cents,discount_cents,total_cents};
}
export function quoteNumber(n) {return 'GL'+String(n).padStart(4,'0');}
export function normalizePhone(value) {
  let n=String(value).replace(/\D/g,'');
  if(!n) return '';
  if(n.length===10||n.length===11) n='55'+n;
  if(!/^55\d{10,11}$/.test(n)) throw new Error('Informe um WhatsApp brasileiro com DDD.');
  return n;
}
