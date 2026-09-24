import React from 'react';

// Lichte markdown-renderer voor AI-teksten: **vet**, *cursief*, koppen (##),
// opsommingen (- / • ) en alinea's. Geen externe dependency; genoeg om de
// AI-response netjes op te maken i.p.v. rauwe sterretjes te tonen.

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/;
  let rest = text;
  let k = 0;
  while (rest.length) {
    const m = rest.match(re);
    if (!m || m.index === undefined) { nodes.push(rest); break; }
    if (m.index > 0) nodes.push(rest.slice(0, m.index));
    const bold = m[1] ?? m[2];
    const ital = m[3] ?? m[4];
    if (bold != null) {
      nodes.push(<strong key={`${keyBase}-b${k++}`} className="font-bold text-slate-900">{bold}</strong>);
    } else {
      nodes.push(<em key={`${keyBase}-i${k++}`}>{ital}</em>);
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return nodes;
}

export function RichText({ text, className }: { text?: string | null; className?: string }) {
  const blocks = (text || '').trim().split(/\n{2,}/).filter(Boolean);
  return (
    <div className={className}>
      {blocks.map((raw, i) => {
        const block = raw.trim();
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

        // Kop: ## / ### ...
        const heading = block.match(/^#{1,4}\s+(.*)$/);
        if (heading && lines.length === 1) {
          return (
            <p key={i} className="font-bold text-slate-900 mt-3 mb-1 first:mt-0">
              {renderInline(heading[1], `h${i}`)}
            </p>
          );
        }

        // Opsomming: elke regel begint met - , * of •
        if (lines.length > 0 && lines.every((l) => /^[-*•]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1 my-2">
              {lines.map((l, j) => (
                <li key={j}>{renderInline(l.replace(/^[-*•]\s+/, ''), `l${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }

        // Gewone alinea (enkele newlines worden een <br/>)
        return (
          <p key={i} className="mb-2 last:mb-0">
            {lines.map((l, j) => (
              <React.Fragment key={j}>
                {renderInline(l, `p${i}-${j}`)}
                {j < lines.length - 1 ? <br /> : null}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
