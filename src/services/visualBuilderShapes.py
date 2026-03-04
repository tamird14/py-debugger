# Basic shapes that extend VisualElem (must be loaded after visualBuilder.py)


class Rect(VisualElem):
    def __init__(self, pos=(0, 0)):
        super().__init__()
        self.position = pos
        self.width = 1
        self.height = 1
        self.color = (34, 197, 94)
        self.visible = True

    def _serialize(self):
        out = self._serialize_base()
        out["type"] = "rect"
        out["width"] = int(getattr(self, 'width', 1))
        out["height"] = int(getattr(self, 'height', 1))
        out["color"] = self._serialize_color(self.color, (34, 197, 94))
        return out


class Circle(VisualElem):
    def __init__(self, pos=(0, 0)):
        super().__init__()
        self.position = pos
        self.width = 1
        self.height = 1
        self.color = (59, 130, 246)
        self.visible = True

    def _serialize(self):
        out = self._serialize_base()
        out["type"] = "circle"
        out["width"] = int(getattr(self, 'width', 1))
        out["height"] = int(getattr(self, 'height', 1))
        out["color"] = self._serialize_color(self.color, (59, 130, 246))
        return out


class Arrow(VisualElem):
    def __init__(self, pos=(0, 0)):
        super().__init__()
        self.position = pos
        self.width = 1
        self.height = 1
        self.color = (16, 185, 129)
        self.orientation = "up"
        self.rotation = 0
        self.visible = True

    def _serialize(self):
        out = self._serialize_base()
        out["type"] = "arrow"
        out["width"] = int(getattr(self, 'width', 1))
        out["height"] = int(getattr(self, 'height', 1))
        out["color"] = self._serialize_color(self.color, (16, 185, 129))
        out["orientation"] = str(getattr(self, 'orientation', 'up'))
        out["rotation"] = int(getattr(self, 'rotation', 0))
        return out
