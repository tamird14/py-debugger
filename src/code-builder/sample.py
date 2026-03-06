# Click "Analyze" to add them to the visual panel.

panel = Panel("Main")
panel.position = (2, 2)
panel.width = 18
panel.height = 10

# Shapes
r = Rect((1, 1))
r.width = 6
r.height = 2
r.color = (34, 197, 94)
panel.add(r)

c = Circle((1, 8))
c.width = 2
c.height = 2
c.color = (59, 130, 246)
panel.add(c)

a = Arrow((1, 12))
a.orientation = "right"
a.color = (239, 68, 68)
panel.add(a)

# Labels
title = Label("Hello Visual Panel")
title.position = (0, 1)
title.width = 16
title.height = 1
title.font_size = 14
panel.add(title)

# Value arrays (static)
nums = Array()
nums.position = (4, 1)
nums.direction = "right"
nums.length = 7
nums.show_index = True
nums[0] = 3
nums[1] = 1
nums[2] = 4
nums[3] = 1
nums[4] = 5
nums[5] = 9
nums[6] = 2
panel.add(nums)

# 2D array (static)
mat = Array2D()
mat.position = (6, 1)
mat.set_dims(3, 4)
panel.add(mat)

def jump_to(t: int):
  a.position = (1 + t, 12)