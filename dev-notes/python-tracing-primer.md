# Python Tracing Primer

[← dev-notes](./dev-notes.md)

A quick reference for how `sys.settrace` works — the mechanism behind `pythonTracer.py`.

---

## The Three-Line Pattern

```python
sys.settrace(trace_fn)   # install the hook
exec(compiled, context)  # run user code — every event calls trace_fn
sys.settrace(None)       # remove the hook (always in a finally block)
```

`exec(compiled, context)` runs the user's code in an isolated namespace (`context` dict). The tracer only sees events for this execution — stdlib and other C-extension code fire no events.

---

## The Trace Function

```python
def trace_fn(frame, event, arg):
    ...
    return trace_fn   # must return itself to keep tracing
```

Python calls `trace_fn(frame, event, arg)` on every code event. Returning `None` stops tracing for that frame; returning `trace_fn` continues it.

| Parameter | What it is |
|-----------|-----------|
| `frame` | The current execution frame (locals, globals, code object, line number) |
| `event` | `'call'`, `'line'`, `'return'`, or `'exception'` |
| `arg` | Event-specific value (see table below) |

### Useful frame attributes

| Attribute | Value |
|-----------|-------|
| `frame.f_locals` | Dict of local variables at this moment |
| `frame.f_globals` | Dict of global variables |
| `frame.f_lineno` | Current line number |
| `frame.f_code.co_name` | Function name (`'<module>'` for top-level) |
| `frame.f_code.co_filename` | Source filename (e.g. `'<user_code>'`) |
| `frame.f_back` | Enclosing frame (or `None`) |

### Events and their `arg`

| `event` | When it fires | `arg` |
|---------|--------------|-------|
| `'call'` | Just entered a function (or the top-level module) | `None` |
| `'line'` | About to execute a line | `None` |
| `'return'` | About to return from a function | The return value |
| `'exception'` | An exception was raised | `(exc_type, exc_value, traceback)` |

---

## Worked Example

```python
import sys

def tracefunc(frame, event, arg):
    code = frame.f_code
    print(f"\"{event}\" EVENT: Inside function {code.co_name} at line {frame.f_lineno}:")

    print("  locals:", frame.f_locals)
    print("  globals:", list(frame.f_globals.keys())[:5], "...")

    print("  arg:", arg)
    print()

    return tracefunc

code = """n = 3
m = 2

def inc(n):
    n = n * m
    return n + 1

def f(n):
    print(n)

f(inc(n+10) + n)
"""

compiled = compile(code, "<user_code>", "exec")
user_globals = {'__builtins__': __builtins__}
sys.settrace(tracefunc)
exec(compiled, user_globals)
sys.settrace(None)
```

### Output

```
"call" EVENT: Inside function <module> at line 0:
  locals: {'__builtins__': <module 'builtins' (built-in)>}
  globals: ['__builtins__'] ...
  arg: None

"line" EVENT: Inside function <module> at line 1:
  locals: {'__builtins__': <module 'builtins' (built-in)>}
  globals: ['__builtins__'] ...
  arg: None

"line" EVENT: Inside function <module> at line 2:
  locals: {'__builtins__': <module 'builtins' (built-in)>, 'n': 3}
  globals: ['__builtins__', 'n'] ...
  arg: None

"line" EVENT: Inside function <module> at line 4:
  locals: {'__builtins__': <module 'builtins' (built-in)>, 'n': 3, 'm': 2}
  globals: ['__builtins__', 'n', 'm'] ...
  arg: None

"line" EVENT: Inside function <module> at line 8:
  locals: {'__builtins__': <module 'builtins' (built-in)>, 'n': 3, 'm': 2, 'inc': <function inc at 0x...>}
  globals: ['__builtins__', 'n', 'm', 'inc'] ...
  arg: None

"line" EVENT: Inside function <module> at line 11:
  locals: {'__builtins__': <module 'builtins' (built-in)>, 'n': 3, 'm': 2, 'inc': <function inc at 0x...>, 'f': <function f at 0x...>}
  globals: ['__builtins__', 'n', 'm', 'inc', 'f'] ...
  arg: None

"call" EVENT: Inside function inc at line 4:
  locals: {'n': 13}
  globals: ['__builtins__', 'n', 'm', 'inc', 'f'] ...
  arg: None

"line" EVENT: Inside function inc at line 5:
  locals: {'n': 13}
  globals: ['__builtins__', 'n', 'm', 'inc', 'f'] ...
  arg: None

"line" EVENT: Inside function inc at line 6:
  locals: {'n': 26}
  globals: ['__builtins__', 'n', 'm', 'inc', 'f'] ...
  arg: None

"return" EVENT: Inside function inc at line 6:
  locals: {'n': 26}
  globals: ['__builtins__', 'n', 'm', 'inc', 'f'] ...
  arg: 27

"call" EVENT: Inside function f at line 8:
  locals: {'n': 30}
  globals: ['__builtins__', 'n', 'm', 'inc', 'f'] ...
  arg: None

"line" EVENT: Inside function f at line 9:
  locals: {'n': 30}
  globals: ['__builtins__', 'n', 'm', 'inc', 'f'] ...
  arg: None

30
"return" EVENT: Inside function f at line 9:
  locals: {'n': 30}
  globals: ['__builtins__', 'n', 'm', 'inc', 'f'] ...
  arg: None

"return" EVENT: Inside function <module> at line 11:
  locals: {'__builtins__': <module 'builtins' (built-in)>, 'n': 3, 'm': 2, 'inc': <function inc at 0x...>, 'f': <function f at 0x...>}
  globals: ['__builtins__', 'n', 'm', 'inc', 'f'] ...
  arg: None
```

### Things to notice

- **`'call'` fires at line 0** for `<module>` — the module entry is treated as a function call. Locals start empty (only `__builtins__`).
- **`'line'` fires *before* the line executes** — at line 1 (`n = 3`), `n` is not in locals yet. At line 2 (`m = 2`), `n` is already there.
- **`def` statements are just lines** — lines 4 and 8 are `def inc` and `def f`. No `'call'` fires; the function objects just appear in locals.
- **`inc` is called with `n=13`** — the argument is `n+10 = 3+10`. But the outer `n=3` is visible in globals; inside `inc`, `n` shadows it as a local.
- **`'line'` at line 5 shows `n=13`**, then line 6 shows `n=26` after `n = n * m`.
- **`'return'` arg is `27`** — the value of `n + 1 = 26 + 1`.
- **`f` is called with `n=30`** — `inc(13) + n = 27 + 3`.
- **`print(n)` outputs `30`** between the `'line'` and `'return'` events for `f`.
- **`f` returns `None`** — `print()` returns `None`, so the `'return'` arg for `f` is `None`.

---

## How `pythonTracer.py` uses this

The engine filters the raw event stream to build its two timelines:

| Engine decision | Implementation |
|----------------|---------------|
| Ignore stdlib / built-ins | Check `frame.f_code.co_filename in ('<exec>', '<string>')` |
| Skip private helpers | Skip frames where `co_name` starts with `_` (but keep dunders like `__init__`) |
| Record a step | On every `'line'` event that passes the filters: snapshot `frame.f_locals` + enclosing scopes |
| Notify builder of calls | On `'call'`: forward args to `function_call()` hook |
| Notify builder of returns | On `'return'`: forward return value to `function_exit()` hook |
| Stop tracing inside a builder hook | `sys.settrace(None)` before calling the hook, restore after |

See [python-engine.md](./python-engine.md) for the full architecture.
