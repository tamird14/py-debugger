# Roadmap and Open Questions

Project management file — not linked from dev-notes.md.

---

## Features

- **Curved lines:** Make lines between objects support curves. Curve shape determined by leaving/entry points relative to cell centers.
- **View-only mode:** Let a user see only the debugger editor and visual panel from premade code. User can trace and use mouse interaction, but not edit anything.
- **Record to GIF:** Add record button to capture a timeline as a GIF. Let user select a region of the grid. Do something similar for static screenshots.
- **Images in grid:** Similar to text boxes, add image elements to the grid that do not go through the Python engine.
- **LaTeX in text boxes:** Support LaTeX rendering in text box elements.
- ~~**setDebug(bool):** Add a `set_debug(bool)` to the debugger side. Lets the user mark when variables are initialized and debugging should begin.~~
- **Tutorial section:** Add descriptions to sample files and link to them from a tutorial page.
- **Redo about page:** Redesign the about page and add links to the homepage.

---

## Cleanup / Small Tasks

- **setDebugCallSuffix location:** Check if `setDebugCallSuffix` can be handled at `CodeEditorArea` level instead of `App.tsx` (see [sharp-edges.md → debugCallSuffix](./sharp-edges.md)).
- **Error display:** Improve error viewing to show line numbers relative to user code (not the engine). Auto-jump to the editor tab containing the error.
- **Unify userZ + zOrder:** Consider merging `userZ` and `zOrder` in `RenderableObjectData` into a single `depth: [number, number]` tuple — they always travel and sort together in `Grid.tsx`.
- **Keyboard shortcut — advance mode:** Use Ctrl+Enter (or Shift+Enter) to advance to the next mode (edit→analyze, trace→interactive).
- **Keyboard shortcut — save:** Use Ctrl+S to auto-save.
- **Trace mode scroll:** When the debugger code editor is open in trace mode and the current line is off-screen, auto-scroll to it when stepping through the timeline.
- **Last line not traced:** The trace does not show the last line execution.
- **Rect animation width jump:** When animating rects (e.g. bubble sort), the `width` property jumps while other properties animate smoothly.
- **Font size button broken:** Can't change font size — button doesn't work.
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
