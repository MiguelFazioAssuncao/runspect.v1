# Runspect Frontend

Next.js 16 application for editing C++17 code, stepping through execution traces, and studying competitive programming techniques.

## Structure

- `src/app`: application shell (`page.tsx`), design tokens (`globals.css`), and layout metadata (`layout.tsx`).
- `src/components/editor`: Monaco editor wrapper, fallback textarea, editor settings modal, and integrated `stdin`/`stdout` console.
- `src/components/visualizer`:
  - `GraphCanvas.tsx`, `GraphAnalysisPanel.tsx`: D3 force/layered graph rendering and shortest-path/component inspection.
  - `VectorSortPanel.tsx`: 1D array and pointer views.
  - `StructureViews.tsx`, `StructsPanel.tsx`: 2D matrices, DP tables, recursion call trees, bitmasks, queues/stacks, and user-defined structs.
  - `TimelineControls.tsx`: playback scrubber, speed selector, and step counter.
  - `SvgExportDialog.tsx`: SVG and MP4 capture tools.
- `src/components/workspace`: resizable split panes (`WorkspaceSplit.tsx`, `ResizablePanel.tsx`).
- `src/lib`: deterministic trace reducers (`graphReducer.ts`, `vectorReducer.ts`, `structureViews.ts`), study catalog (`examples.ts`, `learning.ts`), and local project persistence (`studyProject.ts`).
- `scripts`:
  - `prepare-editor.mjs`: copies the C++ subset of `monaco-editor` into `public/monaco` before `dev` and `build`, skipping unused TypeScript, CSS, HTML, and JSON workers.
  - `*-browser.mjs`: end-to-end Chromium tests for panels, study mode, recording, and responsive layout.

## Scripts

```sh
npm run dev          # prepare Monaco assets and start Next.js on :3000
npm run build        # build production bundle (or static export when GITHUB_PAGES=true)
npm run lint         # run ESLint
npx tsc --noEmit     # check TypeScript types
npm test             # run unit tests with Vitest
npm run test:cpp     # compile and test all 35 C++ examples against the backend runner
npm run test:proxy   # verify the 120s dev proxy timeout
```

Browser integration scripts (`npm run test:study`, `npm run test:panels`, `npm run test:capabilities`, `npm run test:resources`) launch temporary backend and frontend instances and drive Chromium via Playwright. Set `PLAYWRIGHT_MODULE` to the path of `playwright/index.mjs` and `CHROMIUM` to your browser binary if it is not at `/usr/bin/chromium`.
