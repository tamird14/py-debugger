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
8. add z-value to object for rendering layer

## Open Assignments / Cleanup

1. App - Check if `setDebugCallSuffix` can be handled at `CodeEditorArea` level instead of `App.tsx` (see [sharp-edges.md → debugCallSuffix](./sharp-edges.md))
2. App - Evaluate whether both `'dirty'` and `'idle'` states are still needed for the Analyze button (`analyzeStatus`)
3. Flow - If debugger code is empty (only blank lines or comments), skip the initial trace step and jump directly to interactive mode
4. python - Improve error viewing to be relative to the code itself, and not to the python engine. Also, jump automatically to the editor tab with the error.
5. python - defend against infinite loops in the builder code. Don't let the program freeze.
6. Flow - Consider combining handleEnterInteractive and handleBackToInteractive. Either by giving it a parameter, or by setting the setDebugCallSuffix in another place (check why it is on the handleBackToInteractive at all, and not just in handleDebugCall and in handleEdit).
7. See if we can pass the goToStep, getStepLine and breakpoints from App.tsx directly to the TimelineControls component, and then implement goToNextBreakpoint and goToPrevBreakpoint there.
8. Consider unifying `userZ` and `zOrder` in `RenderableObjectData` into a single `depth: [number, number]` tuple — they always travel and sort together in Grid.tsx, so a tuple makes the total order explicit. (They stay separate in `GridObject` and `OccupantInfo` where `zOrder` travels alone.)

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
