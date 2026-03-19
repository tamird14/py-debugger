arr = [5, 3, 8, 1, 9, 2]
n = len(arr)

# @viz
panel = Panel()
panel.position = (1, 1)
panel.width = 14
panel.height = 4
arr_view = Array(var_name="arr")
arr_view.position = (0, 0)
arr_view.length = 6
panel.add(arr_view)
# @end

for i in range(n):
    for j in range(n - i - 1):
        if arr[j] > arr[j + 1]:
            arr[j], arr[j + 1] = arr[j + 1], arr[j]
    # @viz
    # arr_view auto-updates because var_name="arr"
    # @end