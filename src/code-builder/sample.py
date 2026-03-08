panel = Panel('main')
panel.position = (1,1)

arr = Array(arr=V('arr'))
panel.add(arr)
arr.position=(1,0)

rect = Rect()
rect.position = V('(0,n-i)')
rect.color = (255,100,100)
rect.alpha = 0.8
rect.height = 2
rect.width = V('i')
panel.add(rect)

ar1 = Arrow()
ar1.orientation = 'down'
ar1.position = V('(0, j)')
ar1.color = (0,0,255)
panel.add(ar1)

ar2 = Arrow()
ar2.orientation = 'down'
ar2.position = V('(0, j+1)')
ar2.color = (0,150,255)
panel.add(ar2)
