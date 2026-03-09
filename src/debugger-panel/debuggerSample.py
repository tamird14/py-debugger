# Bubble sort - step through this code in the debugger
arr = [5, 3, 8, 1, 9, 2, 7, 4]
n = len(arr)

for i in range(n):
    for j in range(n - i - 1):
        if arr[j] > arr[j + 1]:
            arr[j], arr[j + 1] = arr[j + 1], arr[j]

def temp():    
    for k in range(10):
        print(k)
        arr[0] = k
