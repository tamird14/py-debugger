# The visual programming panel

## Goal:

A web browser construct to display simple objects which can be controlled via python programs (and possibly later, other languages). Mainly used to visualize algorithms and programming ideas.

## Examples:

- View algorithms over arrays, by showing the array itself, and running indices can be viewed via arrows, highlighting array cells etc.
- Viewing algorithms on trees, by arranging the tree itself in the visual panel. For example, can be used to view self balancing operations.

# Code structure

The panel itself will be written in (add your favorite useful web browser programming language). The main visual objects and their possible interaction will be defined in this language.
Afterwards a python API will be constructed so we could use python to control them. For example, there could be a "rect" object defined for the panel, with properties like hight, width, color etc, and it will have a parallel python class rect with the same properties.
The user will control this python object, and every time it changes, it will update the visual object (first just automatic change, and hopefully later with some animation).

While this API should be general, the main (and first) application will be via a "Visual Builder" window where the user can write in python and use it to update the objects. Once the code is "analyzed", it is added into the visual panel.
- Every time the user initialize a visual object it is automatically registered
- There are going to be several modes of using the visual panel, and they can generate event which the user can handle inside the visual builder (discussed later). In these event the user can change the properties of some of the visual objects, and then either call to update the visual panel, or it is updated automatically once the event are handled (depending on the event).

# The modes:

These are few mode suggestions. Possibly we will add more later. These are not part of the visual panel module, but rather the visual builder and how (and more importantly when) it interacts with the visual panel.

## Simple Timeline  Mode
Aimed for a simple animation of the visual panel, which can be either in discrete steps or continuous (so these are basically two modes).
In the discrete case, there are three events:
- `Forward()`
And in the continuous mode there is the event:
- `jump_to(f: float)`
In both cases, the user should have an access to a function `visual.time()` (not to be confused with the standard `time()` function) which returns the current time of the animation (integer in the discrete and float in the continuous).

## Mouse Control Mode
The visual objects have possible mouse interface (e.g. drag and drop, change size, left\right click etc). These trigger events that the user can handle. In particular, it should be possible for describe in the visual builder that certain event trigger a menu opening, from which the user can choose what to do.
For example, when a circle visual object is clicked, in the visual builder the handling causes a menu to open. When a menu item is chosen a new event is triggered.

As this mouse event are triggered in the visual panel, we should be able to disable them if needed in other modes.

## Debugging mode
Here we have another python area where the user can write some code. Then we can run this code line by line, and after each line an update event is triggered with the values of all the current variables and the scope\stack of the line being executed. There the user can change the visual object.

# The visual objects

This is a list of the starting visual objects needed, and their properties.
As a starting point, the visual panel should have a grid layout so everything is measured in integers. Later we might add support for real numbers. Also, each of the shape has a 'z' property which depends the layer in which it is drawn. Object with larger z value are drawn over object with smaller z value.

# Panel
This is not a standard object but rather a container of objects. It should have an `add(visual_obj)` and `remove(visual_obj)` methods. 
The only properties of a panel are:
- position (x,y)
- alpha
- visible (boolean)
All of the object contained in a panel, their position are always relative to the position of the panel. Their alpha is always multiplied by the panel's alpha, and they are not visible if the panel is not visible.

## Simple shapes:
Each of the following shapes should have the following properties:
- position (x,y)
- width, height
- color (in rgb)
- alpha
- possibly separate between fill color and stroke color
- angle (in \[0,2pi\))
- visible (boolean)
The possible shapes:
- rectangle
- ellipse (though we can also name it 'circle')
- arrow

## Lines:
A line depends on its source and target positions. Its properties are
- source (x,y)
- target (x,y)
- line type (e.g. full, dotted, etc)
- line color
- alpha
- visible
- source type (simple line, arrow)
- target type (simple line arrow)

Possible later addition: curved lines\arrows.

# Label
Shows a label. Its properties are
- text
- font_size
- color
- alpha
- visible

## Array cell
Used to view array cells, so it should contain both the value of the cell and an index.
- position (x,y)
- value
- index
- color
- alpha
- visible

# Array
This is basically a panel for array cells, which can contain other useful method. It properties are like a panel. Can be binded to a standard python list, and then use it to update the cells (and in particular add or remove them)


# Milestones 

# 1. Only visual panel, with no modes

Have a standalone visual programming panel, next to the visual builder part. The visual builder should have examples each of the visual object. Once "Analyze" is pressed the code is executed and the visual components should appear.
If there is an error while running the code, it should be seen in below the code area, but the error should display relative to the code that the user wrote, and not to the whole program.

## 2. API
From the python file describing the visual object there should be an autogenerated API description in a third window which can be opened with this description of the objects, their properties and methods (and later on the possible events). Try to add some IDE clues, e.g. when writing `rect.` for a Rect object, it will show the possible methods and properties of a Rect object (and not all possible methods for all types of objects).

## 3. save and load

Add a save \ load buttons. Saving saves the code from the visual builder into a json file. Loading it will write it back and automatically call the "analyze" function. 

## 4. The simple continuous animation mode

Have a scrollbar to determine the time of the animation. Right clicking it, we can determine the end time in seconds, and next to the scrollbar there should have a play \ pause button. The scrollbar should move from 0 to 1 and when it is moved manually it triggers the `jump_to(time: float)` event. When the play button is used it advances according to the total time T (namely, if the jump between frames is t seconds, then it advances the internal time by t/T). It similarly triggers `jump_to(t)` and in both cases, after this function is done, the visual panel is updated.
When entering this mode, this function is added automatically with an empty implementation (namely `pass`) in the visual builder. If the user tries to analyze the code and this function is not implemented, it should throw an informative error about this.

Have a sample that shows a ball rotating around some center point with some nontrivial radius.

The 'save' option here should indicate that this is a "continuous animation mode", and also save the max time and current time. When loading it will jump to "continuous animation mode", then set the max time and current time, in addition to loading the code in the visual builder.

Similarly, the API should show that the user should implement the `jump_to(t: float)` function.
Both these update should be modular, since for each mode we change the save file \ API separately. This means, for example, that the API should be updated from a python file which belong to this mode, so it will be easy to update, or to generate new modes later.

## 5. The simple discrete animation mode

Now the control area should have button left, button right and in the middle we can choose an integer to jump directly to some point. Here too right clicking we can choose the maximal time T, an integer at most 1000. 
Calling "analyze" will initialize the visual objects (time 0) then call `forward()` T times and save a trace of the objects for each time. When moving forward\backward\or jump in the control area, pull the state from this trace, and use it to update the visual panel.

As a sample case, have T=10, and in the timeline start with an empty array, and visualize it using a visual array. In the first 6 forward add an element with value `time()*2`, and in the last 4 pop the first element of the array.

Here too, the json save file should contain the code, the mode, the max time and the current time (and not the whole trace). Once loaded, it should automatically analyze the code, set the max time and jump to the current time.

Similarly, the API should indicate that the user should implement `forward` (or maybe call this function `step`? should think about this...) and that he can use the `visual.time()` function.

## 6. The debugger mode

Here we add another python text area for the code that we want to debug. When calling analyze for this code, it run it all and saves a trace for the state for each execution line (similar to the animation mode). If there is an error, it should be displayed relatively to the user's code, and not the whole program.
In addition, we should be able to set breakpoints for the code. The control area should have a forward, backward, first, last buttons, and a scrollbar to run over all of them. Also buttons for next, previous break point. At each such execution line, the area code should emphasis the next line to execute and the previous line that was executed. Each time that we move an execution line, it should trigger an `update(scope, params)` event (and after which, update the visual panel).
The scope will hold the current scope stack of the execution line, and params will hold all the available parameter at that line.

In addition, in this mode we should be able to set the properties of visual objects as expressions of parameters. This is done via `V(..)` objects. For example, setting
`rect.width = V("i")`
means that when calling update, we also set `rect.width = params['i']`.  As a default value, for before the element is defined in the code, use it first value in the trace. For example the first time that `i` is assigned a value.

Here in the API both explain what is the `V(...)` notation and that the user can use the `update(scope, params)` function.

Here the save file should also save the code, the breakpoints position, and the current executed line, and use it when loading (in particular, analyze both the code and visual builder, and jump to the right execution line).

Note that the `V` notation should only work on this mode, and not on others.

## 7. The mouse mode

Add to the visual shapes mouse event: 
- left \ right click
- drag and drop
- resize
These are disabled by default, and can be enabled in the visual builder panel. Each should trigger an event that the user can handle in the visual builder (and as usual they should be described in the API).
In addition, there should be another 'Menu' object type that the user can open and interact with.
The user should be able to define it and what it does from the visual builder, and pressing it should trigger events. For now just assume that the menu contains only pressing buttons, and nothing else (though maybe it can have sub menus).

As a sample, add a tree building example. Each time a node is pressed, which can choose to add either a left or right child to this node (assuming it doesn't have them yet - only show the options for the possible children)