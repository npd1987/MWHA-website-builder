import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  baseCss,
  blockInnerHtml,
  columnsFor,
  createSection,
  googleFontsHref,
  headerHtml,
  moveRect,
  resizeRect,
  rowHeightFor,
  sectionLayout,
} from '@mwha/site-model';
import type { Block, GridRect, ResizeHandle, Section } from '@mwha/site-model';
import { currentPage, mapBlock, mapPage, mapSection, placeBlock, prepareForViewport, useEditor } from './store.ts';

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function Canvas() {
  const { state, dispatch } = useEditor();
  const site = state.present;
  const page = currentPage(state);
  const mobile = state.viewport === 'mobile';
  const css = useMemo(() => baseCss(site.theme), [site.theme]);
  const fontsHref = googleFontsHref(site.theme);

  const addSection = (index: number) => {
    const section = createSection();
    dispatch({
      type: 'change',
      recipe: (s) =>
        mapPage(s, page.id, (p) => ({ ...p, sections: [...p.sections.slice(0, index), section, ...p.sections.slice(index)] })),
    });
    dispatch({ type: 'select', selection: { sectionId: section.id, blockId: null } });
  };

  return (
    <div
      className="canvas-scroll"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) dispatch({ type: 'select', selection: { sectionId: null, blockId: null } });
      }}
    >
      <div className={`canvas-frame ${state.viewport}`}>
        {fontsHref && <link rel="stylesheet" href={fontsHref} />}
        <style>{css}</style>
        <div className={`mw-site ${mobile ? 'mw-mobile' : ''}`}>
          <div
            className="ed-header"
            title="The header is generated from your site name and pages"
            dangerouslySetInnerHTML={{ __html: headerHtml(site, page) }}
          />
          {page.sections.map((section, i) => (
            <SectionView key={section.id} section={section} index={i} count={page.sections.length} onAddBelow={() => addSection(i + 1)} />
          ))}
          {page.sections.length === 0 && (
            <div className="ed-empty">
              <button className="btn primary" onClick={() => addSection(0)}>
                Add a section
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionView({
  section,
  index,
  count,
  onAddBelow,
}: {
  section: Section;
  index: number;
  count: number;
  onAddBelow: () => void;
}) {
  const { state, dispatch } = useEditor();
  const page = currentPage(state);
  const viewport = state.viewport;
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { rects, rows } = sectionLayout(section, viewport);
  const columns = columnsFor(viewport);
  const rowHeight = rowHeightFor(viewport);
  const selectedSection = state.selection.sectionId === section.id;
  const selectedBlock = selectedSection ? section.blocks.find((b) => b.id === state.selection.blockId) : undefined;

  useEffect(() => {
    if (!selectedBlock) setEditingId(null);
  }, [selectedBlock]);

  /** Size of one grid cell in screen pixels, measured live so it works at any window width. */
  const cellSize = () => {
    const el = gridRef.current!;
    const style = getComputedStyle(el);
    const inner = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return { w: inner / columns, h: rowHeight };
  };

  /** Shared drag loop for moving a block, resizing it, or changing the section height. */
  const drag = (e: ReactPointerEvent, onMove: (dCol: number, dRow: number) => void) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const { w, h } = cellSize();
    const x0 = e.clientX;
    const y0 = e.clientY;
    dispatch({ type: 'begin' });
    setActive(true);
    const move = (ev: PointerEvent) => onMove(Math.round((ev.clientX - x0) / w), Math.round((ev.clientY - y0) / h));
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      setActive(false);
      dispatch({ type: 'end' });
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const startBlockDrag = (e: ReactPointerEvent, block: Block, handle: ResizeHandle | null) => {
    if (e.button !== 0) return;
    dispatch({ type: 'select', selection: { sectionId: section.id, blockId: block.id } });
    const start: GridRect = rects.get(block.id)!;
    drag(e, (dCol, dRow) => {
      const rect = handle ? resizeRect(start, handle, dCol, dRow, columns) : moveRect(start, dCol, dRow, columns);
      dispatch({
        type: 'preview',
        recipe: (s) =>
          mapSection(s, page.id, section.id, (sec) => placeBlock(prepareForViewport(sec, viewport), block.id, viewport, rect)),
      });
    });
  };

  const startHeightDrag = (e: ReactPointerEvent) => {
    const lowest = Math.max(1, ...[...rects.values()].map((r) => r.row + r.rowSpan - 1));
    const startRows = rows;
    drag(e, (_dCol, dRow) => {
      const next = Math.max(lowest, 4, startRows + dRow);
      dispatch({
        type: 'preview',
        recipe: (s) =>
          mapSection(s, page.id, section.id, (sec) => {
            const prepared = prepareForViewport(sec, viewport);
            return { ...prepared, rows: { ...prepared.rows, [viewport]: next } };
          }),
      });
    });
  };

  return (
    <section
      className={`mw-section ed-section ${selectedSection ? 'selected' : ''}`}
      style={{ background: section.background || 'transparent' }}
      onPointerDown={(e) => {
        if (e.button === 0) dispatch({ type: 'select', selection: { sectionId: section.id, blockId: null } });
      }}
    >
      <div
        ref={gridRef}
        className="mw-grid ed-grid"
        style={{ gridTemplateRows: `repeat(${rows}, ${rowHeight}px)` }}
      >
        {(active || selectedSection) && <GridOverlay columns={columns} rows={rows} rowHeight={rowHeight} strong={active} />}
        {section.blocks.map((block) => (
          <BlockView
            key={block.id}
            block={block}
            sectionId={section.id}
            rect={rects.get(block.id)!}
            selected={state.selection.blockId === block.id}
            editing={editingId === block.id}
            setEditing={(on) => setEditingId(on ? block.id : null)}
            onDragStart={(e) => startBlockDrag(e, block, null)}
          />
        ))}
        {selectedBlock && editingId !== selectedBlock.id && (
          <SelectionFrame rect={rects.get(selectedBlock.id)!} onHandle={(e, h) => startBlockDrag(e, selectedBlock, h)} />
        )}
      </div>
      {selectedSection && (
        <>
          <div className="ed-section-label">
            Section {index + 1} of {count}
            {viewport === 'mobile' && !section.blocks.every((b) => b.layout.mobile) && section.blocks.length > 0 && (
              <span className="ed-auto"> · mobile layout is automatic until you move something</span>
            )}
          </div>
          <div className="ed-height-handle" title="Drag to change the section height" onPointerDown={startHeightDrag}>
            <span />
          </div>
        </>
      )}
      <button
        className="ed-add-section"
        title="Add a section below"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onAddBelow}
      >
        + Add section
      </button>
    </section>
  );
}

function GridOverlay({ columns, rows, rowHeight, strong }: { columns: number; rows: number; rowHeight: number; strong: boolean }) {
  return (
    <>
      {Array.from({ length: columns }, (_, i) => (
        <div
          key={i}
          className={`ed-col ${strong ? 'strong' : ''}`}
          style={{
            gridColumn: `${i + 1} / span 1`,
            gridRow: `1 / span ${rows}`,
            backgroundSize: `100% ${rowHeight}px`,
          }}
        />
      ))}
    </>
  );
}

function BlockView({
  block,
  sectionId,
  rect,
  selected,
  editing,
  setEditing,
  onDragStart,
}: {
  block: Block;
  sectionId: string;
  rect: GridRect;
  selected: boolean;
  editing: boolean;
  setEditing: (on: boolean) => void;
  onDragStart: (e: ReactPointerEvent) => void;
}) {
  const { state, dispatch } = useEditor();
  const page = currentPage(state);
  const editableRef = useRef<HTMLElement>(null);
  const textual = block.type === 'heading' || block.type === 'text';

  useEffect(() => {
    if (editing && editableRef.current) {
      const el = editableRef.current;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing]);

  const commitText = () => {
    const text = (editableRef.current?.innerText ?? '').replace(/\n$/, '');
    setEditing(false);
    if (block.type !== 'heading' && block.type !== 'text') return;
    if (text === block.props.text) return;
    dispatch({
      type: 'change',
      recipe: (s) => mapBlock(s, page.id, sectionId, block.id, (b) => ({ ...b, props: { ...b.props, text } }) as Block),
    });
  };

  let content;
  if (editing && textual) {
    const p = block.props;
    const style = {
      '--fs': `${p.size}px`,
      textAlign: p.align,
      color: p.color || undefined,
    } as React.CSSProperties;
    const Tag = block.type === 'heading' ? (`h${block.props.level}` as 'h1') : 'p';
    content = (
      <Tag
        ref={editableRef as React.RefObject<HTMLHeadingElement>}
        className={`${block.type === 'heading' ? 'mw-heading' : 'mw-text'} ed-editing`}
        style={style}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        onBlur={commitText}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && block.type === 'heading')) {
            e.preventDefault();
            (e.currentTarget as HTMLElement).blur();
          }
        }}
      >
        {block.props.text}
      </Tag>
    );
  } else {
    content = <div className="ed-content" dangerouslySetInnerHTML={{ __html: blockInnerHtml(block) }} />;
  }

  return (
    <div
      className={`mw-block ed-block ${selected ? 'selected' : ''} ${editing ? 'editing' : ''}`}
      data-block-id={block.id}
      data-block-type={block.type}
      style={{
        gridColumn: `${rect.col} / span ${rect.colSpan}`,
        gridRow: `${rect.row} / span ${rect.rowSpan}`,
        zIndex: block.z + 1,
      }}
      onPointerDown={(e) => {
        if (!editing) onDragStart(e);
      }}
      onDoubleClick={() => textual && setEditing(true)}
    >
      {content}
    </div>
  );
}

/** Handles live in their own top layer so they stay grabbable even when other blocks overlap the selected one. */
function SelectionFrame({ rect, onHandle }: { rect: GridRect; onHandle: (e: ReactPointerEvent, h: ResizeHandle) => void }) {
  return (
    <div
      className="ed-selection"
      style={{ gridColumn: `${rect.col} / span ${rect.colSpan}`, gridRow: `${rect.row} / span ${rect.rowSpan}` }}
    >
      {HANDLES.map((h) => (
        <div key={h} className={`ed-handle h-${h}`} data-handle={h} onPointerDown={(e) => onHandle(e, h)} />
      ))}
      <div className="ed-size-tag">
        {rect.colSpan} × {rect.rowSpan}
      </div>
    </div>
  );
}
