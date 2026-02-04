import { Link } from 'react-router-dom';

export function PlanPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-indigo-600">Math-Insight</h1>
          <Link
            to="/"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            Open Visual Editor
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Hero Section */}
        <section className="mb-12 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Visual Python Debugger</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Creating a visual interface for simple Python programs for educational purposes,
            aiming at understanding data structures and algorithms.
          </p>
        </section>

        {/* Overview */}
        <section className="mb-10 bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-indigo-500">01</span> Overview
          </h3>
          <p className="text-gray-700 leading-relaxed mb-4">
            As a first step, assuming the programs are "simple": Just using basic variables
            (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">int</code>,
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">float</code>,
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">bool</code>,
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">str</code>)
            and simple lists of these types of variables, with no nested lists, classes etc.
          </p>
          <p className="text-gray-700 leading-relaxed">
            After this is done, start adding more advanced features, e.g. list of lists, classes, etc.
          </p>
        </section>

        {/* General Structure */}
        <section className="mb-10 bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-indigo-500">02</span> General Structure
          </h3>
          <p className="text-gray-700 leading-relaxed mb-6">
            A web-like interface with two main components:
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Code Editor */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-5 border border-blue-100">
              <h4 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <span className="w-8 h-8 bg-blue-500 text-white rounded-lg flex items-center justify-center text-sm">
                  {'</>'}
                </span>
                Code Editor
              </h4>
              <p className="text-gray-700 text-sm leading-relaxed">
                A Python code editor with the usual coloring schemes (e.g. Monaco editor).
                The user can input the (simple) code here, and the program analyzes it:
                Runs it, and saves the variables' values for each step in the process,
                which can be used to generate the visuals.
              </p>
            </div>

            {/* Visual Panel */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-5 border border-emerald-100">
              <h4 className="text-lg font-semibold text-emerald-900 mb-3 flex items-center gap-2">
                <span className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center text-sm">
                  <span className="text-xs">[]</span>
                </span>
                Visual Panel
              </h4>
              <p className="text-gray-700 text-sm leading-relaxed">
                A gridded panel where the user can add components to each cell (or group of cells).
                These can be shapes (rectangles, circles, arrows), labels (with LaTeX support),
                or variables. Properties can depend on program variables via expressions:
                arithmetic operations, abs(), floor(), ceil(), //, %, etc.
              </p>
            </div>
          </div>
        </section>

        {/* Typical Workflow */}
        <section className="mb-10 bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <span className="text-indigo-500">03</span> Typical Workflow
          </h3>

          {/* Code Component Workflow */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
              In the Code Component:
            </h4>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">1</span>
                <span className="text-gray-700">User inserts code into the code panel and clicks an <strong>"Analyse"</strong> button</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">2</span>
                <span className="text-gray-700">If there's an issue running the code, output the error message</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">3</span>
                <span className="text-gray-700">Otherwise, save all variables with their: <strong>name</strong>, <strong>type</strong>, <strong>scope</strong>, and <strong>value at each step</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">4</span>
                <span className="text-gray-700">Navigation buttons: next/previous step and first/last step</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">5</span>
                <span className="text-gray-700">At each step, mark both the last command executed and the next command to execute</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">6</span>
                <span className="text-gray-700">To edit code again, press "Edit Code" button, then re-analyze</span>
              </li>
            </ul>
          </div>

          {/* Visual Component Workflow */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
              In the Visual Component:
            </h4>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-semibold">1</span>
                <span className="text-gray-700"><strong>Right-click</strong> to add new components</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-semibold">2</span>
                <span className="text-gray-700">Right-clicking existing components shows "Clear Cell" and "Edit" options</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-semibold">3</span>
                <span className="text-gray-700">Edit via menu to control properties per component type</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Component Properties */}
        <section className="mb-10 bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <span className="text-indigo-500">04</span> Component Properties
          </h3>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Shapes */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="w-4 h-4 bg-orange-400 rounded-full"></span>
                Shapes
              </h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>Position (row, col)</li>
                <li>Width and height (in cells)</li>
                <li>Color (including alpha)</li>
                <li>Orientation (angles/radians/rotation 0-1)</li>
              </ul>
            </div>

            {/* Variables */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="w-4 h-4 bg-purple-400 rounded"></span>
                Variables
              </h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>Color and font size</li>
                <li>For arrays: orientation (right/left/down/up)</li>
                <li>All properties can be expressions</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h4 className="font-semibold text-amber-800 mb-2">Behavior Notes:</h4>
            <ul className="text-sm text-amber-900 space-y-2">
              <li>When stepping through the program, properties update with animation</li>
              <li>Changed variables are marked/highlighted</li>
              <li>Invalid computations (e.g., index out of bounds, variable out of scope) gray out the component with a tooltip explaining why</li>
              <li>Save/Load functionality for both code and visual components</li>
            </ul>
          </div>
        </section>

        {/* Examples */}
        <section className="mb-10 bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <span className="text-indigo-500">05</span> Example Visualizations
          </h3>

          <div className="space-y-6">
            {/* Prefix Sum */}
            <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-lg p-5 border border-violet-200">
              <h4 className="text-lg font-semibold text-violet-900 mb-3">Compute Prefix Sum Array</h4>
              <ul className="text-sm text-gray-700 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-violet-500 mt-1">-</span>
                  Show both a "nums" array and its prefix sums array below it
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-violet-500 mt-1">-</span>
                  As the program progresses, the prefix sums array fills up
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-violet-500 mt-1">-</span>
                  Semi-transparent rectangle over the subarray being summed
                </li>
              </ul>
            </div>

            {/* Binary Search */}
            <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-lg p-5 border border-cyan-200">
              <h4 className="text-lg font-semibold text-cyan-900 mb-3">Binary Search Algorithm</h4>
              <ul className="text-sm text-gray-700 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-500 mt-1">-</span>
                  Show the target number and the search array
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-500 mt-1">-</span>
                  Arrows above the array indicating start, end, and mid point
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-500 mt-1">-</span>
                  Arrows animate as pointers move through the algorithm
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-500 mt-1">-</span>
                  Semi-transparent rectangle highlighting the current search range
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Future */}
        <section className="mb-10 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 shadow-lg text-white">
          <h3 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <span className="text-indigo-400">06</span> Future Enhancements
          </h3>
          <p className="text-gray-300 leading-relaxed">
            <strong className="text-white">More Scripting:</strong> Be able to add a function which takes
            as input the dictionary of variables and values at a given step, and generate more variables
            and values to help the visual process. This enables more complex visualizations and
            custom computed properties.
          </p>
        </section>

        {/* CTA */}
        <section className="text-center py-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-lg font-semibold shadow-lg hover:shadow-xl"
          >
            Try the Visual Editor
            <span>-</span>
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 text-center text-sm text-gray-500">
        Math-Insight - Visual Python Debugger for Education
      </footer>
    </div>
  );
}
