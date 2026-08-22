// Measure using the REAL resolver, not a reimplementation of it. The previous script did its own
// exact-match lookup against the allowlist JSON, so it never exercised resolveToken() and reported
// the pre-fix behaviour after the fix was deployed.
import {readFileSync} from 'node:fs';
import {resolveToken} from '../../src/lib/citation-token.ts';
const allow = JSON.parse(readFileSync('src/generated/citation-allowlist.json','utf8'));
const Qs = ["How does the code retrieval pipeline rank results?",
  "What happens when two compactions run at once?",
  "How does the agent orchestration handle reconnection?",
  "What are the weaknesses of the coding plugin?",
  "How is the design system tested?"];
let a=0,r=0;
for (const q of Qs) {
  const res = await fetch('https://trigsight.vercel.app/api/chat',{method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:q}]})});
  const t = await res.text(); let c='';
  for (const l of t.split('\n')) { if(!l.startsWith('data: '))continue; const p=l.slice(6).trim();
    if(p==='[DONE]')break; try{c+=JSON.parse(p).choices?.[0]?.delta?.content??''}catch{} }
  const toks=[...c.matchAll(/\[\[cite:([^|\]]+)\|([^\]]+)\]\]/g)];
  const ok=toks.filter(m=>resolveToken(allow,m[1],m[2])!==null);
  a+=toks.length; r+=ok.length;
  console.log(`  ${ok.length}/${toks.length}  ${q.slice(0,46)}`);
}
console.log(`\n  resolve rate: ${r}/${a}` + (a?` = ${(100*r/a).toFixed(0)}%`:''));
