// Probe the real matching semantics of #:~:text= against text as it appears in MDX-rendered HTML.
// Key question: can a build-time verifier reliably predict whether a fragment will match?
const src = `The engine drives AI agents through multi-step, LLM-powered workflows with
human-in-the-loop approval gates and real-time streaming.  It serves 2K+ daily users.

Multiple   spaces   collapse in HTML.  "Smart quotes" and em—dashes appear too.`;

// Simulate what the browser matches against: HTML text content, whitespace-collapsed
const rendered = src.replace(/\s+/g, ' ').trim();

const cases = [
  ['exact phrase',            'human-in-the-loop approval gates'],
  ['crosses a newline',       'workflows with human-in-the-loop'],
  ['multiple spaces in src',  'Multiple spaces collapse'],
  ['case differs',            'HUMAN-IN-THE-LOOP APPROVAL GATES'],
  ['smart quotes',            '"Smart quotes"'],
  ['em dash',                 'em—dashes'],
  ['not present',             'this text does not exist'],
];
console.log('rendered length:', rendered.length, '\n');
for (const [label, needle] of cases) {
  const raw   = src.includes(needle);
  const norm  = rendered.toLowerCase().includes(needle.replace(/\s+/g,' ').toLowerCase());
  const enc   = encodeURIComponent(needle.replace(/\s+/g,' ')).replace(/-/g,'%2D');
  console.log(`${label.padEnd(24)} raw=${raw?'Y':'n'} normalised=${norm?'Y':'n'}  len=${enc.length}`);
}
