# Roadmap and Open Questions

Project management file — not linked from dev-notes.md.

---

## Product Vision

**Name: AlgoPlay** — emphasizes interactive exploration of algorithms, not passive watching.

Most algorithm visualizers show pre-built demos you watch. AlgoPlay lets you:
- Write **your own Python algorithm** and visualize it
- **Step through** a recorded timeline with animated data structures
- **Interact** with the running visualization — click elements, trigger traced sub-runs, accumulate state across clicks
- Build structures like trees and graphs, then **manipulate them interactively** (insert, delete, rotate, search)

The **interactive mode** (`on_click`, `DebugCall`, `RunCall`) is the core differentiator. No other tool in this space has it.

---

## Branch Strategy

| Branch | Status | Purpose |
|--------|--------|---------|
| `main` | active | stable base |
| `tutorial-pages` | parked | tutorial pages (Getting Started, Features, Bubble Sort) — merge after combine-editors |
| `combine-editors` | in progress | single combined editor with collapsible viz blocks |

---

## Immediate: combine-editors

The two-editor model (separate Debugger Code + Builder Code tabs) is the main UX blocker. Replacing it with a single editor using collapsible `# @viz … # @end` blocks makes the tool more approachable and enables line-specific visualization.

**Status:** `combinedExecutor`, `vizBlockParser`, and `CombinedEditor` are implemented and wired into `App.tsx` behind `USE_COMBINED_EDITOR = true`.

**Remaining on this branch:**
- Polish CombinedEditor UX (folding UX, decoration colors, error line mapping)
- Migrate/update existing samples to combined format
- Fix any rough edges before merging to main

---

## After combine-editors

1. **Search tree hero sample** — BST/AVL with interactive search, insert, delete, rotations via `DebugCall`
2. **Fix/migrate existing samples** to combined editor format
3. **Merge tutorial-pages** and update tutorials for new editor
4. **More interactive examples** — heap insert, graph BFS click-to-start
5. **Rename** Math-Insight → AlgoPlay across codebase and tutorials
6. **Beta launch** (see Beta Launch section below)

---

## Future Features (interactive-first emphasis)

- **Input elements** — Button, TextInput, Slider as first-class visual elements (enables typed input without hacking Rect subclasses)
- **More emphasis on interactive mode UI** — larger "Finish & Interact" button, in-app discovery hint for new users

---

## Beta Launch

### Critical

- **API reference completeness:** Audit all classes and functions in `user_api.py`, `pythonTracer.py`, and builder imports (e.g. `graphs.py`). Every public symbol should appear in `ApiReferencePanel.tsx` (`visualBuilder.ts` / `functionsSchema.ts`) with accurate types, defaults, and descriptions.
- **Examples overhaul:** ~~Split existing samples into two categories~~ ✓ — samples are now grouped as *Algorithms* / *Features* in the dropdown (prefix-based: `feature-*.json`). Remaining: add missing feature examples so the full API surface has coverage.

- **About page redesign:** Rewrite `src/pages/PlanPage.tsx` to be user-facing (not dev notes). Add link to `https://prove-me-wrong.com`.
- **Feedback widget:** Floating button visible in the editor. Opens a modal with a text area for feedback and a checkbox to include the current code (debugger + builder JSON). Submits to a placeholder endpoint — backend wiring deferred; UI ships first.
- **Tutorial pages:** In-app React Router pages (like the current About page), one per major feature area (arrays, interactive mode, text boxes, libraries, etc.). Interactive walkthrough layer can be added later.
- **Error display:** Improve error viewing to show line numbers relative to user code (not the engine). instead of text like "  File "<exec>", line 122, in <module>" have either 'builder' or 'debugger' file and '_main_' as function. Auto-jump to the editor tab containing the error.
see for example this weird looking error:
>  File "<exec>", line 1, in <module>
>  File "<exec>", line 295, in _visual_code_trace
>  File "<exec>", line 5, in <module>
>  File "<exec>", line 276, in trace_fn
>  File "<exec>", line 215, in _record_step
>  File "<exec>", line 8, in _serialize_visual_builder
>  File "/home/pyodide/_vb_engine.py", line 336, in _serialize
>    return self._serialize_from_fields(self._schema)
>           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
>  File "/home/pyodide/_vb_engine.py", line 102, in _serialize_from_fields
>    out[key] = int(val)
>               ^^^^^^^^
>TypeError: int() argument must be a string, a bytes-like object or a real number, not >'NoneType'

### Nice to Have

- **Shareable links:** Encode the current editor state (JSON) into a URL hash or query param. Lets users share their work and makes it easy to report bugs with a repro link.
- **Welcome / first-time experience:** A brief dismissible banner or modal for first-time visitors explaining what the app is and pointing to tutorials and samples.
- **Pyodide loading state:** Show a visible loading indicator while Pyodide initializes so the app doesn't appear broken on first load.
- **Tool libraries:** Add more library tools like the given `graphs.py` file. For example `charts.py` builder-import library with a `BarChart` component: takes an array of values and renders a labeled bar graph above a matching array element display. Each should come with a schema describing what it is in general, and what are its functions, and it should appear in the API reference.

- **Import library discoverability:** The importable utilities (`array_utils`, `graphs`, `list_helpers`) should not appear inline in the main Functions/Debugger tabs — that adds noise for users who don't need them. Consider a dedicated "Libraries" tab in the API reference, or show each library's schema only when the user opts in (e.g. hovering an `import` statement). Currently their schemas are defined in `.schema.ts` sidecar files but not yet surfaced in the UI.
- **Logo:** App logo/icon.

---

## Features

- **Curved lines:** Make lines between objects support curves. Curve shape determined by leaving/entry points relative to cell centers.
- **View-only mode:** Let a user see only the debugger editor and visual panel from premade code. User can trace and use mouse interaction, but not edit anything.
- **Record to GIF:** Add record button to capture a timeline as a GIF. Let user select a region of the grid. Do something similar for static screenshots.
- **Images in grid:** Similar to text boxes, add image elements to the grid that do not go through the Python engine.
- **LaTeX in text boxes:** Support LaTeX rendering in text box elements.
- ~~**setDebug(bool):** Add a `set_debug(bool)` to the debugger side. Lets the user mark when variables are initialized and debugging should begin.~~
- **input component:** a renderable object where the user can input a text, which is an event
available during interactive mode.
- **keyboard events:** for interactive mode
- **drag screen:** use mouse to drag the whole grid (only when not already dragging a visual element).

---

## Cleanup / Small Tasks


- **text boxes:** when pressing inside a text in a text box, update the styles in the bar above to match the current pressed text.

- **setDebugCallSuffix location:** Check if `setDebugCallSuffix` can be handled at `CodeEditorArea` level instead of `App.tsx` (see [sharp-edges.md → debugCallSuffix](./sharp-edges.md)).

- **Unify shape ObjDoc schemas:** All 8 shape schemas (`RECT_SCHEMA`, `CIRCLE_SCHEMA`, etc.) repeat the same `alpha`, `animate`, `visible`, `z`, and `delete()` entries verbatim. Extract a `BASE_SHAPE_PROPERTIES` array and `BASE_SHAPE_METHODS` array and spread them into each schema to eliminate duplication.

- **Python-defined import schemas:** Builder/debugger import files (`array_utils.py`, `graphs.py`, `list_helpers.py`) currently have their ObjDoc schemas hand-written in separate `.schema.ts` files. These should be defined in the Python files themselves (e.g. as a `SCHEMA` dict) and extracted/generated into TypeScript at build time, so the single source of truth for each library lives with its implementation.

- **Unify userZ + zOrder:** Consider merging `userZ` and `zOrder` in `RenderableObjectData` into a single `depth: [number, number]` tuple — they always travel and sort together in `Grid.tsx`.
- **Unify event-handler position relativity:** `on_click` position is relative to the shape's containing panel (or the grid if top-level), but `on_drag` position is the absolute grid cell. Decide whether to unify them (both panel-relative is the more consistent choice).
- **Clear editors button**

- ~~**R instance caching:** `R.__new__` now returns a cached instance per `orig_id` via `R._instance_cache`, so the same original object always maps to the same `R` Python object across steps. Builder code can use `R` objects as dict keys. Cache is cleared in `_reset_exec_state()`. Dev notes (`python-engine.md`) should be updated to document this guarantee.~~

- ~~**clear when loading:** Add a clear feature which clears the code from both editors, the variable panel, the output terminals, and the grid. Use this when loading a file.~~

- ~~**Arrow orientation and rotation:** Should only have one of those. At most have a single property `rotation` and allow setting `up`,`down`,`left`,`right` there which automatically transform to the angle.~~
- ~~**break points:** main bugs fixed (stale state, doubling, jumps-back). Minor: Monaco's default stickiness doesn't move a decoration when Enter is pressed at col 1 — worked around via manual edit-event tracking, but could revisit if Monaco exposes a cleaner stickiness option.~~
- ~~**Keyboard shortcut — advance mode:** Use Ctrl+Enter (or Shift+Enter) to advance to the next mode (edit→analyze, trace→interactive).~~
- ~~**Keyboard shortcut — save:** Use Ctrl+S to auto-save.~~
- ~~**Trace mode scroll:** When the debugger code editor is open in trace mode and the current line is off-screen, auto-scroll to it when stepping through the timeline.~~
- ~~**Last line not traced:** The trace does not show the last line execution.~~
- ~~**Rect animation width jump:** When animating rects (e.g. bubble sort), the `width` property jumps while other properties animate smoothly.~~
- ~~**Font size button broken:** Can't change font size — button doesn't work.~~

---

## In Progress

- **Schema-driven Python shape serialization:**

    *Done:*
    - `_vb_engine.py`: `make_shape_class(schema)` factory generates `__init__` + `_serialize()` from a schema dict; `_serialize_from_fields(schema)` used by classes with extra methods (e.g. Panel). Mutable defaults are deep-copied. `'param'` key supports constructor arg ≠ attr name.
    - `user_api.py`: Rect, Circle, Arrow, Label, Panel, Array, Array2D all converted to schema-driven. `Array.length` field dropped — TS `Array1D.draw()` now derives cell count from `values.length` directly.
    - `ser` types implemented: `int`, `str`, `bool`, `float`, `color`, `color?`, `list_r`, `list2d_r` (R-unwrap each row of a 2D list).
    - `_post_init` hook: called at end of generated `__init__` if set as a class attribute. Used by `Array` and `Array2D` for input validation.
    - ~~`_ShapeBase` class replaces `make_shape_class` factory. Subclasses declare their schema via `class Rect(_ShapeBase, schema=RECT_SCHEMA): pass` — Python's `__init_subclass__` stores it as a class variable. `__init__(*args, **kwargs)` rejects positional arguments with a named, actionable error message suggesting the correct keyword syntax.~~

    *Remaining:*
    - **Line schema:** `Line` has non-trivial serialization (tuple→list conversions for offsets, cap enum validation). Add `'list_float'` and `'cap'` ser types to `_ShapeBase`, or keep hand-written `_serialize` with a schema for documentation only.
    - **Transfer TS schemas to Python:** TS `RECT_SCHEMA`, `CIRCLE_SCHEMA`, etc. are `ObjDoc` objects for the API Reference panel. Consider generating TS `ObjDoc` from Python schema dicts, or writing a validation step that asserts they match.

---

## Open Architectural Questions

- **No-copy variable passing:** Instead of `deepcopy` + `R` wrappers, pass raw live Python objects directly to `update(params)`. Builder is responsible for not mutating params. Drop-in swap: remove deepcopy from `_capture_variables`, remove `TrackedDict` wrapper from `trace_fn`. Tradeoff: simpler for read-only builder code; risk of silent state corruption if builder mutates params.

- **Namespace isolation:** The engine files (`visualBuilder.py`, `event_handling.py`, `pythonTracer.py`) are `exec()`-d into Pyodide globals. User builder code runs in `_user_code_ns` (a sandbox seeded from `user_api`), so it can't reach engine internals. But the engine globals themselves are still shared, meaning if engine names (e.g. `update`, `_serialize_visual_builder`) are ever called from user code they could be shadowed. This is partially mitigated; further investigation may still be warranted.

---

## Documentation

- Find a better diagramming format for the mode state machine and other dev-notes diagrams. Requirements: text-based (version-controllable, AI-readable), renders in VSCode without extra setup. Mermaid was tried but output was inferior to ASCII art. Options: D2, PlantUML, or improved ASCII diagrams.



- current executed line
- move samples to new format
- check that viz blocks are actually blocks