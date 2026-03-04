import { Square } from '../shapes';
import { rgbToHex } from '../../types/visualBuilder';
import type { Rect } from '../../types/shapes';
import { registerRenderer } from './rendererRegistry';

export function RectView({ rect }: { rect: Rect }) {
  return (
    <div style={{ transform: `rotate(${0}deg)`, width: '100%', height: '100%' }}>
      <Square color={rgbToHex(rect.color, '#ef0bef')} opacity={rect.alpha} strokeWidth={1} />
    </div>
  );
}

registerRenderer<Rect>('rect', (element) => <RectView rect={element as Rect} />);