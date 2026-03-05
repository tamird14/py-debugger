import { Circle as CircleShape } from '../../shapes';
import { rgbToHex } from '../../../api/visualBuilder';
import type { Circle } from './Circle';
import { registerRenderer } from '../../views/rendererRegistry';

interface CircleViewProps {
  circle: Circle;
}

export function CircleView({ circle }: CircleViewProps) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <CircleShape
        color={rgbToHex(circle.color, '#3b82f6')}
        opacity={circle.alpha}
        strokeWidth={1}
      />
    </div>
  );
}

registerRenderer<Circle>('circle', (element) => <CircleView circle={element as Circle} />);
