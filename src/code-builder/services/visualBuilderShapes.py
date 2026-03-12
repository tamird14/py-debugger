# Basic shapes that extend VisualElem (must be loaded after visualBuilder.py)


class Rect(VisualElem):
    def __init__(self, position=(0, 0), width=1, height=1, color=(34, 197, 94), visible=True):
        super().__init__()
        self.position = position
        self.width = width
        self.height = height
        self.color = color
        self.visible = visible

    def _serialize(self):
        out = self._serialize_base()
        out["type"] = "rect"
        out["width"] = int(getattr(self, 'width', 1))
        out["height"] = int(getattr(self, 'height', 1))
        out["color"] = self._serialize_color(self.color, (34, 197, 94))
        return out


class Circle(VisualElem):
    def __init__(self, position=(0, 0), width=1, height=1, color=(59, 130, 246), visible=True):
        super().__init__()
        self.position = position
        self.width = width
        self.height = height
        self.color = color
        self.visible = visible

    def _serialize(self):
        out = self._serialize_base()
        out["type"] = "circle"
        out["width"] = int(getattr(self, 'width', 1))
        out["height"] = int(getattr(self, 'height', 1))
        out["color"] = self._serialize_color(self.color, (59, 130, 246))
        return out


class Arrow(VisualElem):
    def __init__(self, position=(0, 0), width=1, height=1, color=(16, 185, 129), orientation="up", rotation=0, visible=True):
        super().__init__()
        self.position = position
        self.width = width
        self.height = height
        self.color = color
        self.orientation = orientation
        self.rotation = rotation
        self.visible = visible

    def _serialize(self):
        out = self._serialize_base()
        out["type"] = "arrow"
        out["width"] = int(getattr(self, 'width', 1))
        out["height"] = int(getattr(self, 'height', 1))
        out["color"] = self._serialize_color(self.color, (16, 185, 129))
        out["orientation"] = str(getattr(self, 'orientation', 'up'))
        out["rotation"] = int(getattr(self, 'rotation', 0))
        return out


class Line(VisualElem):
    def __init__(self, start=(0, 0), end=(1, 1), color=(239, 68, 68),
                 stroke_weight=2, start_offset=(0.5, 0.5), end_offset=(0.5, 0.5),
                 start_cap='none', end_cap='arrow'):
        super().__init__()
        self.start = start
        self.end = end
        self.color = color
        self.stroke_weight = stroke_weight
        self.start_offset = start_offset
        self.end_offset = end_offset
        self.start_cap = start_cap
        self.end_cap = end_cap

    @property
    def position(self):
        return self.start

    @position.setter
    def position(self, value):
        self.start = value

    def _serialize(self):
        out = self._serialize_base()
        out["type"] = "line"
        out["start"] = list(self.start)
        out["end"] = list(self.end)
        out["color"] = self._serialize_color(self.color, (239, 68, 68))
        out["strokeWeight"] = max(0.5, float(self.stroke_weight))
        out["startOffset"] = [float(x) for x in self.start_offset]
        out["endOffset"] = [float(x) for x in self.end_offset]
        out["startCap"] = self.start_cap if self.start_cap in ('none', 'arrow') else 'none'
        out["endCap"] = self.end_cap if self.end_cap in ('none', 'arrow') else 'arrow'
        return out
