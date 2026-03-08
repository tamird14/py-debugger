# def _ensure_jump_to_exists():
#     """Ensure that a jump_to(t: int) function is defined by the user."""
#     if "jump_to" not in globals() or not callable(globals()["jump_to"]):
#         # PopupException is defined in visualBuilder.py and loaded before this file
#         raise PopupException("Please implement a function jump_to(t: int) in your Visual Builder code.")


# def _create_typescript_timeline(T: int):
#     """
#     Run jump_to(t) for t in [0, T] and capture a serialized snapshot
#     of all visual objects after each step. Returns a JSON string with
#     the full timeline, suitable for consumption from TypeScript.
#     """
#     import json

#     _ensure_jump_to_exists()

#     timeline = []
#     max_t = int(T)
#     if max_t < 0:
#         max_t = 0

#     for t in range(max_t + 1):
#         jump_to(t)
#         snapshot_json = _serialize_visual_builder()
#         snapshot = json.loads(snapshot_json)
#         timeline.append(snapshot)

#     return json.dumps(timeline)

