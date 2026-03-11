# More features

1. add on_start_drag, on_end_drag
2. Improve API reference
3. Add manual text objects that do not go through python. Should be simple to edit the text + some minimal styles (e.g. fontsize, colors etc). A simple word like interface would be great
    - hopefully support latex
    - and even more hopefully support hebrew
4. add curve objects from cell to cell:
    - can be either lines or curve lines, possibly control
      start and end direction
    - possibly add line types
    - and line ending (e.g. arrows)
5. support 2d arrays
6. support imports

# assignment

1. check if setDebugCallSuffix can be handled in the level of CodeEditorArea instead of the full app.
2. Do we still need both 'dirty' and 'idle' for the analyze button?
3. if the debugger code is empty (only blank lines or comments) jump over the initial trace step, directly to the interactive step.
4. add python logger