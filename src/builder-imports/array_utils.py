"""Utility helpers for array-based builder visualizations."""


def highlight_range(arr_elem, lo, hi, color='orange'):
    """Set fill color on indices lo..hi (inclusive) of an Array element."""
    for i in range(lo, hi + 1):
        arr_elem[i].fill = color
