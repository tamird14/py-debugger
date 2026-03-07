# Discrete animation sample — array growing then shrinking.
# Steps 0-5: add one element per step (value = step * 2).
# Steps 6-9: pop the first element once per step.
# Press Analyze to build the timeline, then step through it.

arr = Array()
arr.position = (2, 2)
arr.direction = "right"
arr.show_index = True

def jump_to(t: int):
    n_added  = min(t + 1, 6)          # how many elements have been added
    n_popped = max(0, t - 5)          # how many have been popped from the front

    elements = [i * 2 for i in range(n_added)][n_popped:]

    arr.length = len(elements)
    for i, val in enumerate(elements):
        arr[i] = val
