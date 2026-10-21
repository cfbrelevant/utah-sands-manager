import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync('web/utahsands-home-quick-access.js','utf8');

function render(pathname = '/') {
  const additions: Array<{ where:string; node: any }> = [];
  const styles: any[] = [];
  const main = { insertAdjacentElement(where: string, node: any) { additions.push({ where, node }); } };
  const document = {
    getElementById() { return null; },
    createElement(tag:string) { return { tag, setAttribute(name:string,value:string) { (this as any)[name]=value; }, innerHTML:'', textContent:'', id:''}; },
    head: { appendChild(node:any) { styles.push(node); } },
    querySelector(name:string) { return name==='main'?main:null; },
    body: { prepend(node:any) { additions.push({where:'prepend',node}); } },
  };
  vm.runInNewContext(script, { window: { location: { pathname } }, document });
  return {additions,styles};
}
test('shows all three services immediately before homepage hero', () => {
  const r=render();
  assert.equal(r.additions.length, 1);
  assert.equal(r.additions[0].where, 'beforebegin');
  const html=r.additions[0].node.innerHTML as string;
  assert.match(html,/href="\/pay-rent\.html"/);
  assert.match(html,/href="\/maintenance\.html"/);
  assert.match(html,/href="\/#details"/);
  assert.match(html,/Pay rent/);
  assert.match(html,/Maintenance/);
  assert.match(html,/Apply for the home/);
  assert.match(html,/Applications are not open/);
  assert.match(html,/no payment is collected or request delivered/);
});
test('uses compact two-column mobile layout with full-width apply row', () => {
  const r=render();
  const css=r.styles[0].textContent as string;
  assert.match(css, /max-width: 740px/);
  assert.match(css, /grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.us-qa-apply \{ grid-column: 1 \/ -1/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});
test('does not add homepage navigation on payment pages', () => {
  assert.equal(render('/pay-rent.html').additions.length,0);
  assert.equal(render('/maintenance.html').additions.length,0);
});
