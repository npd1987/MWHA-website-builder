import { useRef, useState } from 'react';
import { createSection, renderPageHtml, sampleSite, validateSite } from '@mwha/site-model';
import type { BlockType, Site } from '@mwha/site-model';
import { addBlock, currentPage, mapPage, mapSection, newId, useEditor } from './store.ts';

const BLOCKS: { type: BlockType; label: string; icon: string }[] = [
  { type: 'heading', label: 'Heading', icon: 'H' },
  { type: 'text', label: 'Text', icon: '¶' },
  { type: 'image', label: 'Image', icon: '▣' },
  { type: 'button', label: 'Button', icon: '⬭' },
  { type: 'shape', label: 'Shape', icon: '■' },
];

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Toolbar() {
  const { state, dispatch } = useEditor();
  const site = state.present;
  const page = currentPage(state);
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = (type: BlockType) => {
    setMenu(false);
    const id = newId();
    let sectionId = state.selection.sectionId ?? page.sections[0]?.id ?? null;
    if (!sectionId) {
      const section = createSection();
      sectionId = section.id;
      dispatch({ type: 'change', recipe: (s) => mapPage(s, page.id, (p) => ({ ...p, sections: [section] })) });
    }
    const target = sectionId;
    dispatch({ type: 'change', recipe: (s) => mapSection(s, page.id, target, (sec) => addBlock(sec, type, id)) });
    dispatch({ type: 'select', selection: { sectionId: target, blockId: id } });
  };

  const preview = () => {
    const html = renderPageHtml(site, page, { inlineCss: true });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Site;
      const problems = validateSite(data);
      if (problems.length) {
        alert(`This file can't be opened:\n\n${problems.join('\n')}`);
        return;
      }
      dispatch({ type: 'load', site: data });
    } catch {
      alert('That file is not a saved site (.json).');
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <strong className="brand">MWHA Builder</strong>
        <select
          aria-label="Page"
          value={page.id}
          onChange={(e) => dispatch({ type: 'page', pageId: e.target.value })}
        >
          {site.pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <div className="menu-wrap">
          <button className="btn primary" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            + Add block
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              {BLOCKS.map((b) => (
                <button key={b.type} onClick={() => add(b.type)} data-add={b.type}>
                  <span className="menu-icon">{b.icon}</span>
                  {b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-group">
        <div className="segmented" role="group" aria-label="Device">
          <button className={state.viewport === 'desktop' ? 'on' : ''} onClick={() => dispatch({ type: 'viewport', viewport: 'desktop' })}>
            Desktop
          </button>
          <button className={state.viewport === 'mobile' ? 'on' : ''} onClick={() => dispatch({ type: 'viewport', viewport: 'mobile' })}>
            Mobile
          </button>
        </div>
        <button className="btn" disabled={state.past.length === 0} onClick={() => dispatch({ type: 'undo' })} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button className="btn" disabled={state.future.length === 0} onClick={() => dispatch({ type: 'redo' })} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Open…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
        <button className="btn" onClick={() => download('site.json', JSON.stringify(site, null, 2), 'application/json')}>
          Save file
        </button>
        <button
          className="btn"
          onClick={() => {
            if (confirm('Start over from the sample template? Your current design will be replaced.')) dispatch({ type: 'load', site: sampleSite() });
          }}
        >
          New
        </button>
        <button className="btn primary" onClick={preview}>
          Preview
        </button>
      </div>
    </header>
  );
}
