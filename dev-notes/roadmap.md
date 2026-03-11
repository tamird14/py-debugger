# Roadmap and Open Questions

Project management file — not linked from dev-notes.md.

---

## Features To Build

1. Add `on_start_drag`, `on_end_drag` drag handlers
2. Improve API reference panel
3. Add curve objects between cells:
   - Lines or bezier curves, with optional control of start/end direction
   - Optional line types (dashed, dotted, etc.)
   - Optional line endings (arrows, etc.)
4. Support 2D arrays
5. Support `import` statements in user code

---

## Documentation

- Find a better diagramming format for the mode state machine and other diagrams in dev-notes. Requirements: text-based (version-controllable, AI-readable), renders nicely in VSCode without extra setup. Mermaid was tried but the output was inferior to the ASCII art. Options to explore: D2, PlantUML, or improving the ASCII diagrams with a dedicated tool.

## Open Assignments / Cleanup

1. Check if `setDebugCallSuffix` can be handled at `CodeEditorArea` level instead of `App.tsx` (see [sharp-edges.md → debugCallSuffix](./sharp-edges.md))
2. Evaluate whether both `'dirty'` and `'idle'` states are still needed for the Analyze button (`analyzeStatus`)
3. If debugger code is empty (only blank lines or comments), skip the initial trace step and jump directly to interactive mode
4. Add Python logger utility

---

## Completed

<!-- Move items here when done, with a one-line note on how they were resolved -->
