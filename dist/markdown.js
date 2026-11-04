import { Marked as MarkdownParser } from './vendor/marked.esm.js';

const escapeMarkdownHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function descriptionLink(value) {
  try {
    const url=new URL(value);
    return ['http:','https:','mailto:'].includes(url.protocol)?url.href:null;
  } catch { return null; }
}
const descriptionMarkdown=new MarkdownParser({
  gfm:true,breaks:true,async:false,
  renderer:{
    html({text}) { return escapeMarkdownHTML(text); },
    link({href,title,tokens}) {
      const text=this.parser.parseInline(tokens),url=descriptionLink(href);
      return url?`<a href="${escapeMarkdownHTML(url)}"${title?` title="${escapeMarkdownHTML(title)}"`:''} target="_blank" rel="noopener noreferrer">${text}</a>`:text;
    },
    image({href,text}) {
      const url=descriptionLink(href),label=escapeMarkdownHTML(text||'Image');
      return url?`<a href="${escapeMarkdownHTML(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`:label;
    },
  },
});
/** Markdown is text-only: raw HTML is escaped and external media stays a link. */
export function renderDescription(markdown='') {
  const source=String(markdown).slice(0,10000);
  try { return descriptionMarkdown.parse(source); }
  catch { return `<p>${escapeMarkdownHTML(source).replace(/\n/g,'<br>')}</p>`; }
}
