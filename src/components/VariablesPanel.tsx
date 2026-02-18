import type { VariableDictionary } from '../types/grid';

interface VariablesPanelProps {
  variables: VariableDictionary;
  previousVariables?: VariableDictionary;
}

export function VariablesPanel({ variables, previousVariables }: VariablesPanelProps) {
  const entries = Object.entries(variables);

  if (entries.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
        No variables yet
      </div>
    );
  }

  const hasChanged = (name: string, value: any): boolean => {
    if (!previousVariables) return false;
    const prev = previousVariables[name];
    if (!prev) return true; // New variable
    return JSON.stringify(prev.value) !== JSON.stringify(value);
  };

  return (
    <div className="h-full overflow-auto p-2">
      <div className="space-y-2">
        {entries.map(([name, variable]) => {
          const changed = hasChanged(name, variable.value);
          return (
            <div
              key={name}
              className={`p-2 rounded border ${
                changed
                  ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-600'
                  : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                    variable.type === 'int'
                      ? 'bg-emerald-100 text-emerald-700'
                      : variable.type === 'float'
                      ? 'bg-blue-100 text-blue-700'
                      : variable.type === 'str'
                      ? 'bg-teal-100 text-teal-700'
                      : variable.type === 'arr[str]'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {variable.type === 'int'
                    ? 'int'
                    : variable.type === 'float'
                    ? 'float'
                    : variable.type === 'str'
                    ? 'str'
                    : variable.type === 'arr[str]'
                    ? 'list[str]'
                    : 'list'}
                </span>
                <span className="font-mono text-sm font-medium text-gray-800 dark:text-gray-200">
                  {name}
                </span>
                {changed && (
                  <span className="text-xs text-amber-600 ml-auto">changed</span>
                )}
              </div>
              <div className="mt-1 font-mono text-sm text-gray-600 dark:text-gray-300">
                {variable.type === 'int' || variable.type === 'float' ? (
                  <span className="text-blue-600">{variable.value}</span>
                ) : variable.type === 'str' ? (
                  <span className="text-teal-600">"{variable.value}"</span>
                ) : (
                  <span className="text-purple-600">
                    [{variable.value.map((val) => (typeof val === 'string' ? `"${val}"` : val)).join(', ')}]
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
