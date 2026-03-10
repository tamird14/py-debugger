export interface TextBox {
  id: string;
  row: number;
  col: number;
  widthCells: number;   // min 2
  heightCells: number;  // min 2
  text: string;
  fontSize: number;     // px, default 14
  color: string;        // hex text color
  bgColor?: string;     // hex background color (undefined = transparent)
}
