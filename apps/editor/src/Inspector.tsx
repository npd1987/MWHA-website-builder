import type { ReactNode } from 'react';
import { FONTS } from '@mwha/site-model';
import type { Align, Block, FontId, Section } from '@mwha/site-model';
import { currentPage, duplicateBlock, mapPage, mapSection, newId, newPage, setProp, slugify, useEditor } from './store.ts';
import { readImageFile } from './images.ts';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ColorInput({ value, fallback, onChange }: { value: string; fallback: string; onChange: (v: string) => void }) {
  return (
    <div className="color-input">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : fallback} onChange={(e) => onChange(e.target.value)} />
      <input type="text" value={value} placeholder="theme" onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function AlignInput({ value, onChange }: { value: Align; onChange: (v: Align) => void }) {
  return (
    <div className="segmented">
      {(['left', 'center', 'right'] as const).map((a) => (
        <button key={a} className={value === a ? 'on' : ''} onClick={() => onChange(a)}>
          {a}
        </button>
      ))}
    </div>
  );
}

export function Inspector() {
  const { state } = useEditor();
  const page = currentPage(state);
  const section = page.sections.find((s) => s.id === state.selection.sectionId);
  const block = section?.blocks.find((b) => b.id === state.selection.blockId);
  return (
    <aside className="inspector">
      {block && section ? (
        <BlockPanel block={block} section={section} />
      ) : section ? (
        <SectionPanel section={section} />
      ) : (
        <SitePanel />
      )}
    </aside>
  );
}

const TYPE_NAMES: Record<Block['type'], string> = {
  heading: 'Heading',
  text: 'Text',
  image: 'Image',
  button: 'Button',
  shape: 'Shape',
};

function BlockPanel({ block, section }: { block: Block; section: Section }) {
  const { state, dispatch } = useEditor();
  const page = currentPage(state);
  const update = (key: string, value: unknown) =>
    dispatch({
      type: 'change',
      recipe: (s) => mapSection(s, page.id, section.id, (sec) => ({ ...sec, blocks: sec.blocks.map(setProp(block.id, key, value)) })),
    });
  const changeSection = (fn: (s: Section) => Section) =>
    dispatch({ type: 'change', recipe: (s) => mapSection(s, page.id, section.id, fn) });

  const zs = section.blocks.map((b) => b.z);
  const layer = (dir: 1 | -1) =>
    changeSection((sec) => ({
      ...sec,
      blocks: sec.blocks.map((b) => (b.id === block.id ? { ...b, z: dir === 1 ? Math.max(...zs) + 1 : Math.min(...zs) - 1 } : b)),
    }));

  return (
    <div className="panel">
      <h2>{TYPE_NAMES[block.type]}</h2>
      {block.type === 'heading' && (
        <>
          <Field label="Text">
            <textarea rows={3} value={block.props.text} onChange={(e) => update('text', e.target.value)} />
          </Field>
          <Field label="Level">
            <div className="segmented">
              {([1, 2, 3] as const).map((l) => (
                <button key={l} className={block.props.level === l ? 'on' : ''} onClick={() => update('level', l)}>
                  H{l}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Size: ${block.props.size}px`}>
            <input type="range" min={16} max={120} value={block.props.size} onChange={(e) => update('size', Number(e.target.value))} />
          </Field>
          <Field label="Align">
            <AlignInput value={block.props.align} onChange={(v) => update('align', v)} />
          </Field>
          <Field label="Colour">
            <ColorInput value={block.props.color} fallback={state.present.theme.text} onChange={(v) => update('color', v)} />
          </Field>
        </>
      )}
      {block.type === 'text' && (
        <>
          <Field label="Text">
            <textarea rows={6} value={block.props.text} onChange={(e) => update('text', e.target.value)} />
          </Field>
          <Field label={`Size: ${block.props.size}px`}>
            <input type="range" min={12} max={40} value={block.props.size} onChange={(e) => update('size', Number(e.target.value))} />
          </Field>
          <Field label="Align">
            <AlignInput value={block.props.align} onChange={(v) => update('align', v)} />
          </Field>
          <Field label="Colour">
            <ColorInput value={block.props.color} fallback={state.present.theme.text} onChange={(v) => update('color', v)} />
          </Field>
        </>
      )}
      {block.type === 'image' && (
        <>
          <Field label="Upload image">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  update('src', await readImageFile(file));
                } catch (err) {
                  alert((err as Error).message);
                }
                e.target.value = '';
              }}
            />
          </Field>
          <Field label="Or image address (URL)">
            <input
              type="text"
              value={block.props.src.startsWith('data:') ? '' : block.props.src}
              placeholder={block.props.src.startsWith('data:') ? 'Uploaded image' : 'https://…'}
              onChange={(e) => update('src', e.target.value)}
            />
          </Field>
          <Field label="Description (for screen readers and Google)">
            <input type="text" value={block.props.alt} onChange={(e) => update('alt', e.target.value)} />
          </Field>
          <Field label="Fit">
            <div className="segmented">
              {(['cover', 'contain'] as const).map((f) => (
                <button key={f} className={block.props.fit === f ? 'on' : ''} onClick={() => update('fit', f)}>
                  {f === 'cover' ? 'Fill' : 'Fit'}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Corner radius: ${block.props.radius}px`}>
            <input type="range" min={0} max={80} value={block.props.radius} onChange={(e) => update('radius', Number(e.target.value))} />
          </Field>
        </>
      )}
      {block.type === 'button' && (
        <>
          <Field label="Label">
            <input type="text" value={block.props.label} onChange={(e) => update('label', e.target.value)} />
          </Field>
          <Field label="Link">
            <input type="text" value={block.props.href} placeholder="https://… or contact.html" onChange={(e) => update('href', e.target.value)} />
          </Field>
          <Field label="Style">
            <div className="segmented">
              {(['solid', 'outline'] as const).map((v) => (
                <button key={v} className={block.props.variant === v ? 'on' : ''} onClick={() => update('variant', v)}>
                  {v}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Align">
            <AlignInput value={block.props.align} onChange={(v) => update('align', v)} />
          </Field>
        </>
      )}
      {block.type === 'shape' && (
        <>
          <Field label="Colour">
            <ColorInput value={block.props.color} fallback="#e8ecf7" onChange={(v) => update('color', v)} />
          </Field>
          <Field label={`Corner radius: ${block.props.radius}px`}>
            <input type="range" min={0} max={200} value={block.props.radius} onChange={(e) => update('radius', Number(e.target.value))} />
          </Field>
        </>
      )}

      <h3>Arrange</h3>
      <div className="button-row">
        <button className="btn" onClick={() => layer(1)}>
          Bring to front
        </button>
        <button className="btn" onClick={() => layer(-1)}>
          Send to back
        </button>
      </div>
      <div className="button-row">
        <button
          className="btn"
          onClick={() => {
            const id = newId();
            dispatch({ type: 'change', recipe: (s) => mapSection(s, page.id, section.id, (sec) => duplicateBlock(sec, block.id, id)) });
            dispatch({ type: 'select', selection: { sectionId: section.id, blockId: id } });
          }}
        >
          Duplicate
        </button>
        <button
          className="btn danger"
          onClick={() => changeSection((sec) => ({ ...sec, blocks: sec.blocks.filter((b) => b.id !== block.id) }))}
        >
          Delete
        </button>
      </div>
      {state.viewport === 'mobile' && block.layout.mobile && (
        <button
          className="btn link"
          onClick={() =>
            changeSection((sec) => ({
              ...sec,
              rows: { desktop: sec.rows.desktop },
              blocks: sec.blocks.map((b) => ({ ...b, layout: { desktop: b.layout.desktop } }) as Block),
            }))
          }
        >
          Reset this section's mobile layout to automatic
        </button>
      )}
      <p className="hint">
        Drag to move, drag the handles to resize. {block.type === 'heading' || block.type === 'text' ? 'Double-click to edit text. ' : ''}
        Arrow keys nudge, Delete removes, Ctrl+D duplicates.
      </p>
    </div>
  );
}

function SectionPanel({ section }: { section: Section }) {
  const { state, dispatch } = useEditor();
  const page = currentPage(state);
  const index = page.sections.findIndex((s) => s.id === section.id);
  const change = (fn: (s: Section) => Section) => dispatch({ type: 'change', recipe: (s) => mapSection(s, page.id, section.id, fn) });
  const move = (dir: -1 | 1) =>
    dispatch({
      type: 'change',
      recipe: (s) =>
        mapPage(s, page.id, (p) => {
          const sections = [...p.sections];
          const j = index + dir;
          if (j < 0 || j >= sections.length) return p;
          [sections[index], sections[j]] = [sections[j], sections[index]];
          return { ...p, sections };
        }),
    });
  return (
    <div className="panel">
      <h2>Section</h2>
      <Field label="Background">
        <ColorInput value={section.background} fallback="#ffffff" onChange={(v) => change((s) => ({ ...s, background: v }))} />
      </Field>
      <div className="button-row">
        <button className="btn" disabled={index === 0} onClick={() => move(-1)}>
          Move up
        </button>
        <button className="btn" disabled={index === page.sections.length - 1} onClick={() => move(1)}>
          Move down
        </button>
      </div>
      <button
        className="btn danger"
        onClick={() =>
          dispatch({
            type: 'change',
            recipe: (s) => mapPage(s, page.id, (p) => ({ ...p, sections: p.sections.filter((x) => x.id !== section.id) })),
          })
        }
      >
        Delete section
      </button>
      <p className="hint">Use “Add block” in the toolbar to add content to this section. Drag the bar under the section to change its height.</p>
    </div>
  );
}

function SitePanel() {
  const { state, dispatch } = useEditor();
  const site = state.present;
  const change = (fn: (s: typeof site) => typeof site) => dispatch({ type: 'change', recipe: fn });
  const setTheme = (key: keyof typeof site.theme, value: string) =>
    change((s) => ({ ...s, theme: { ...s.theme, [key]: value } }));
  return (
    <div className="panel">
      <h2>Site</h2>
      <Field label="Site name">
        <input type="text" value={site.name} onChange={(e) => change((s) => ({ ...s, name: e.target.value }))} />
      </Field>
      <h3>Design</h3>
      <Field label="Heading font">
        <select value={site.theme.headingFont} onChange={(e) => setTheme('headingFont', e.target.value as FontId)}>
          {Object.entries(FONTS).map(([id, f]) => (
            <option key={id} value={id}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Body font">
        <select value={site.theme.bodyFont} onChange={(e) => setTheme('bodyFont', e.target.value as FontId)}>
          {Object.entries(FONTS).map(([id, f]) => (
            <option key={id} value={id}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Background">
        <ColorInput value={site.theme.background} fallback="#ffffff" onChange={(v) => setTheme('background', v)} />
      </Field>
      <Field label="Text">
        <ColorInput value={site.theme.text} fallback="#1d1d1f" onChange={(v) => setTheme('text', v)} />
      </Field>
      <Field label="Accent (buttons)">
        <ColorInput value={site.theme.accent} fallback="#1f5eff" onChange={(v) => setTheme('accent', v)} />
      </Field>

      <h3>Pages</h3>
      {site.pages.map((p) => (
        <div key={p.id} className="page-row">
          <input
            type="text"
            value={p.title}
            aria-label="Page title"
            onChange={(e) => change((s) => mapPage(s, p.id, (x) => ({ ...x, title: e.target.value })))}
          />
          <input
            type="text"
            value={p.slug === '' ? 'home' : p.slug}
            disabled={p.slug === ''}
            aria-label="Page address"
            title={p.slug === '' ? 'The home page is always index.html' : 'Page address (file name)'}
            onChange={(e) => change((s) => mapPage(s, p.id, (x) => ({ ...x, slug: slugify(e.target.value) })))}
          />
          <button
            className="btn icon"
            title="Delete page"
            disabled={p.slug === ''}
            onClick={() => {
              if (confirm(`Delete the page “${p.title}”?`)) change((s) => ({ ...s, pages: s.pages.filter((x) => x.id !== p.id) }));
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="btn"
        onClick={() => {
          const taken = new Set(site.pages.map((p) => p.slug));
          let slug = 'new-page';
          for (let i = 2; taken.has(slug); i++) slug = `new-page-${i}`;
          const page = newPage('New page', slug);
          change((s) => ({ ...s, pages: [...s.pages, page] }));
          dispatch({ type: 'page', pageId: page.id });
        }}
      >
        Add page
      </button>
    </div>
  );
}
