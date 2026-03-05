export interface PythonFileRegistration {
  id: string;
  order: number;
  source: string;
}

const pythonFileRegistry: PythonFileRegistration[] = [];

export function registerPythonFile(entry: PythonFileRegistration): void {
  const existingIndex = pythonFileRegistry.findIndex((f) => f.id === entry.id);
  if (existingIndex !== -1) {
    pythonFileRegistry[existingIndex] = entry;
  } else {
    pythonFileRegistry.push(entry);
  }
}

export function getPythonFilesInOrder(): PythonFileRegistration[] {
  return [...pythonFileRegistry].sort((a, b) => a.order - b.order);
}

