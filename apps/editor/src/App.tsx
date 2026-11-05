import { useEffect, useReducer } from 'react';
import { moveRect, sampleSite, sectionLayout, columnsFor, validateSite } from '@mwha/site-model';
import type { Site } from '@mwha/site-model';
import { Canvas } from './Canvas.tsx';
import { Inspector } from './Inspector.tsx';
import { Toolbar } from './Toolbar.tsx';
import {
  EditorContext,
  currentPage,
  duplicateBlock,
  initState,
  mapSection,
  newId,
  placeBlock,
  prepareForViewport,
  reducer,
} from './store.ts';

const STORAGE_KEY = 'mwha-builder-site-v1';

function loadSaved(): Site {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const site = JSON.parse(raw) as Site;
      if (validateSite(site).length === 0) return site;
    }
  } catch {
    // Private windows or blocked storage: start fresh.
  }
  return sampleSite();
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initState(loadSaved()));

  // Autosave in this browser. The real product saves to the builder server instead.
  useEffect(() => {
    if (state.txn) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.present));
      } catch {
        // Storage full or blocked; the Save file button still works.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [state.present, state.txn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }
      const { sectionId, blockId } = state.selection;
      if (!sectionId || !blockId) {
        if (e.key === 'Escape') dispatch({ type: 'select', selection: { sectionId: null, blockId: null } });
        return;
      }
      const page = currentPage(state);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        dispatch({
          type: 'change',
          recipe: (s) => mapSection(s, page.id, sectionId, (sec) => ({ ...sec, blocks: sec.blocks.filter((b) => b.id !== blockId) })),
        });
      } else if (e.key === 'Escape') {
        dispatch({ type: 'select', selection: { sectionId, blockId: null } });
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const id = newId();
        dispatch({ type: 'change', recipe: (s) => mapSection(s, page.id, sectionId, (sec) => duplicateBlock(sec, blockId, id)) });
        dispatch({ type: 'select', selection: { sectionId, blockId: id } });
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 4 : 1;
        const dCol = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dRow = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const viewport = state.viewport;
        dispatch({
          type: 'change',
          recipe: (s) =>
            mapSection(s, page.id, sectionId, (sec) => {
              const prepared = prepareForViewport(sec, viewport);
              const rect = sectionLayout(prepared, viewport).rects.get(blockId);
              if (!rect) return sec;
              return placeBlock(prepared, blockId, viewport, moveRect(rect, dCol, dRow, columnsFor(viewport)));
            }),
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      <div className="app">
        <Toolbar />
        <div className="workspace">
          <Canvas />
          <Inspector />
        </div>
      </div>
    </EditorContext.Provider>
  );
}
