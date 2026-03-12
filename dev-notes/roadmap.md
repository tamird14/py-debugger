# Roadmap and Open Questions

Project management file — not linked from dev-notes.md.

---

## Features To Build

1. Add `on_start_drag`, `on_end_drag`, and maybe `on_drag` drag handlers
2. Add curve objects between cells:
   - Lines or bezier curves, with optional control of start/end direction
   - Optional line types (dashed, dotted, etc.)
   - Optional line endings (arrows, etc.)
3. Support 2D arrays
4. Support `import` statements in user code
5. View only modes: Let a user only see the debugger editor and visual panel from a premade code. User can only trace and use the mouse interaction, but not change anything else.
6. Redo the about page (and add there links to homepage)
7. Add animation between snapshots. Each element should have an id, and when moving between snapshots, it will animate the changes (e.g. move, change size, color, etc). Have a fix time per animation, and have a toggle button somewhere to have also simple non animation steps.

## Open Assignments / Cleanup

1. App - Check if `setDebugCallSuffix` can be handled at `CodeEditorArea` level instead of `App.tsx` (see [sharp-edges.md → debugCallSuffix](./sharp-edges.md))
2. python - Improve error viewing to be relative to the code itself, and not to the python engine. Also, jump automatically to the editor tab with the error.
3. Consider unifying `userZ` and `zOrder` in `RenderableObjectData` into a single `depth: [number, number]` tuple — they always travel and sort together in Grid.tsx, so a tuple makes the total order explicit. (They stay separate in `GridObject` and `OccupantInfo` where `zOrder` travels alone.)

---

## Documentation

- Find a better diagramming format for the mode state machine and other diagrams in dev-notes. Requirements: text-based (version-controllable, AI-readable), renders nicely in VSCode without extra setup. Mermaid was tried but the output was inferior to the ASCII art. Options to explore: D2, PlantUML, or improving the ASCII diagrams with a dedicated tool.

---

## Completed

<!-- Move items here when done, with a one-line note on how they were resolved -->

- UI - Move save/load to top row — moved Save, Load, Samples buttons from CodeEditorArea header into App.tsx header
- UI - Make variables panel collapsible — added collapse/expand toggle button to VariablePanel header
- UI - Remove footer — removed instructional text; kept an empty footer as a visual bottom margin
- UI - Keep top row height constant — wrapped TimelineControls in an always-rendered div, using `invisible` in interactive mode instead of conditional render
- Cleanup 2 — Simplified analyzeStatus by removing 'dirty' state, consolidated to idle/success/error
- Cleanup 3 — Skip trace for empty debugger code, jump directly to interactive mode
- Cleanup 5 — Added infinite loop protection for builder code via sys.settrace step counter
- Cleanup 6 — Combined handleEnterInteractive and handleBackToInteractive into enterInteractive(from)
- Cleanup 7 — Moved breakpoint navigation logic from App.tsx to TimelineControls component
