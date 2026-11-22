// The editorial subset used in guides/src. Raw HTML is always escaped.
export function escape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function inline(text, resolveLink) {
  const pattern = /\[([^\]]+)\]\(([^\s()]+)\)|\*\*(.+?)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let html = '', end = 0;
  for (const match of text.matchAll(pattern)) {
    html += escape(text.slice(end, match.index));
    const [, label, url, strong, emphasis, code] = match;
    if (url) {
      const target = resolveLink(url);
      html += target ? `<a href="${escape(target)}">${escape(label)}</a>` : escape(label);
    } else if (strong) html += `<strong>${inline(strong, resolveLink)}</strong>`;
    else if (emphasis) html += `<em>${escape(emphasis)}</em>`;
    else html += `<code>${escape(code)}</code>`;
    end = match.index + match[0].length;
  }
  return html + escape(text.slice(end));
}

export function markdown(body, title, resolveLink) {
  const format = text => inline(text, resolveLink);
  const lines = body.replace(/<!--[\s\S]*?(?:-->|$)/g, '').trim().split('\n').map(line => line.trim());
  if (lines[0] === '# ' + title) lines.shift();
  const html = [];
  const block = /^(?:#{1,6} |[-*] |\d+\. |> |\|)/;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i++];
    if (!line) continue;
    const heading = /^(#{1,6}) (.+)$/.exec(line);
    if (heading) {
      const level = Math.max(2, heading[1].length);
      html.push(`<h${level}>${format(heading[2])}</h${level}>`);
    } else if (line.startsWith('|') && /^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(lines[i])) {
      const row = (line, tag) => '<tr>' + line.replace(/^\||\|$/g, '').split('|').map(cell =>
        `<${tag}>${format(cell.trim())}</${tag}>`).join('') + '</tr>';
      i++;
      const rows = [];
      while (lines[i]?.startsWith('|')) rows.push(row(lines[i++], 'td'));
      html.push(`<div class="guide-table" tabindex="0"><table><thead>${row(line, 'th')}</thead><tbody>${rows.join('')}</tbody></table></div>`);
    } else if (/^(?:[-*]|\d+\.) /.test(line)) {
      const ordered = /^\d/.test(line);
      const marker = ordered ? /^\d+\. / : /^[-*] /;
      const tag = ordered ? 'ol' : 'ul';
      const items = [line];
      while (marker.test(lines[i])) items.push(lines[i++]);
      html.push(`<${tag}>${items.map(item => '<li>' + format(item.replace(marker, '')) + '</li>').join('')}</${tag}>`);
    } else if (line.startsWith('> ')) {
      html.push(`<blockquote>${format(line.slice(2))}</blockquote>`);
    } else {
      const paragraph = [line];
      while (lines[i] && !block.test(lines[i])) paragraph.push(lines[i++]);
      html.push(`<p>${format(paragraph.join(' '))}</p>`);
    }
  }
  return html.join('\n');
}
