import { Arrow as ArrowShape } from '../../shapes';
import { rgbToHex } from '../../../api/visualBuilder';
import type { Arrow } from './Arrow';
import { registerRenderer } from '../../views/rendererRegistry';

interface ArrowViewProps {
  arrow: Arrow;
}

export function ArrowView({ arrow }: ArrowViewProps) {
  return (
    <ArrowShape
      color={rgbToHex(arrow.color, '#10b981')}
      opacity={arrow.alpha}
      strokeWidth={1}
      orientation={arrow.orientation}
      rotation={arrow.rotation}
    />
  );
}

registerRenderer<Arrow>('arrow', (element) => <ArrowView arrow={element as Arrow} />);
