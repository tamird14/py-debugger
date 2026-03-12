import type { VariableValue } from './codeTimelineState';

interface VariablePanelProps {
  variables: Record<string, VariableValue>;
}

function formatValue(value: unknown, type: string): string {
  if (type.startsWith('arr')) return JSON.stringify(value);
  if (type === 'none') return 'None';
  if (type === 'tuple') {
    return '(' + (value as unknown[]).map(v => JSON.stringify(v)).join(', ') + ')';
  }
  if (type === 'dict') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return '{}';
    return '{' + entries.map(([k, v]) => `'${k}': ${JSON.stringify(v)}`).join(', ') + '}';
  }
  if (type === 'set') {
    return '{' + (value as unknown[]).map(v => JSON.stringify(v)).join(', ') + '}';
  }
  // int, float, str, custom class names (repr string), and any future types
  return String(value);
}

export function VariablePanel({ variables }: VariablePanelProps) {
  const entries = Object.entries(variables);

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex-1 overflow-auto">
        {entries.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">
            No variables yet — click Analyze and step through the code.
          </div>
        ) : (
          <table className="w-full text-xs font-mono border-collapse">
            <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="text-left px-3 py-1 text-gray-500 dark:text-gray-400 font-medium w-1/3">
                  Name
                </th>
                <th className="text-left px-3 py-1 text-gray-500 dark:text-gray-400 font-medium w-1/5">
                  Type
                </th>
                <th className="text-left px-3 py-1 text-gray-500 dark:text-gray-400 font-medium">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([name, { type, value }]) => (
                <tr
                  key={name}
                  className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <td className="px-3 py-1 text-indigo-600 dark:text-indigo-400 font-semibold">
                    {name}
                  </td>
                  <td className="px-3 py-1 text-gray-500 dark:text-gray-400">{type}</td>
                  <td className="px-3 py-1 text-gray-800 dark:text-gray-200 break-all">
                    {formatValue(value, type)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
