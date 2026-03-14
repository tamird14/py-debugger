import type { JSONContent } from '@tiptap/react';

export interface TextBox {
  id: string;
  row: number;
  col: number;
  widthCells: number;   // min 2
  heightCells: number;  // min 2
  content: JSONContent; // TipTap document node (replaces text/fontSize/color)
  bgColor?: string;     // hex background color (undefined = transparent); box-level only
}

/** Upgrades old save format (text/fontSize/color) to TipTap JSONContent. */
export function migrateTextBox(raw: Record<string, unknown>): TextBox {
  if ('content' in raw) {
    return raw as unknown as TextBox;
  }

  const text  = typeof raw.text === 'string' ? raw.text : '';
  const size  = typeof raw.fontSize === 'number' ? raw.fontSize : 14;
  const color = typeof raw.color === 'string' ? raw.color : undefined;

  const content: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: text
          ? [
              {
                type: 'text',
                text,
                marks: [
                  {
                    type: 'textStyle',
                    attrs: { fontSize: `${size}px`, color: color ?? null },
                  },
                ],
              },
            ]
          : [],
      },
    ],
  };

  return {
    id: raw.id as string,
    row: raw.row as number,
    col: raw.col as number,
    widthCells: raw.widthCells as number,
    heightCells: raw.heightCells as number,
    content,
    bgColor: typeof raw.bgColor === 'string' ? raw.bgColor : undefined,
  };
}
