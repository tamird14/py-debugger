import { motion } from 'framer-motion';
import { registerRenderer } from '../../views/rendererRegistry';
import type { Line } from './Line';
import { useAnimationEnabled, useAnimationDuration } from '../../../animation/animationContext';

const CELL = 40; // must match CELL_SIZE in Grid.tsx

function LineView({ line }: { line: Line }) {
  const animate = useAnimationEnabled();
  const animationDuration = useAnimationDuration();
  const sx = line.startOffset[0] * CELL;
  const sy = line.startOffset[1] * CELL;
  const ex = (line.end[1] - line.start[1] + line.endOffset[0]) * CELL;
  const ey = (line.end[0] - line.start[0] + line.endOffset[1]) * CELL;

  const arrowLen = Math.max(8, line.strokeWeight * 5);
  const arrowHalf = arrowLen / 2;
  const uid = `${line.start[0]}-${line.start[1]}-${line.end[0]}-${line.end[1]}`;
  const endMarkerId = `le-${uid}`;
  const startMarkerId = `ls-${uid}`;
  const transition = animate ? { duration: animationDuration / 1000, ease: 'easeOut' as const } : { duration: 0 };

  const endMarker = line.endCap === 'arrow' ? (
    <marker
      id={endMarkerId}
      markerWidth={arrowLen}
      markerHeight={arrowLen}
      refX={arrowLen}
      refY={arrowHalf}
      orient="auto"
      markerUnits="userSpaceOnUse"
    >
      <polygon
        points={`0 0, ${arrowLen} ${arrowHalf}, 0 ${arrowLen}`}
        fill={line.hexColor}
        opacity={line.alpha}
      />
    </marker>
  ) : null;

  const startMarker = line.startCap === 'arrow' ? (
    <marker
      id={startMarkerId}
      markerWidth={arrowLen}
      markerHeight={arrowLen}
      refX={arrowLen}
      refY={arrowHalf}
      orient="auto-start-reverse"
      markerUnits="userSpaceOnUse"
    >
      <polygon
        points={`0 0, ${arrowLen} ${arrowHalf}, 0 ${arrowLen}`}
        fill={line.hexColor}
        opacity={line.alpha}
      />
    </marker>
  ) : null;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${CELL} ${CELL}`}
      overflow="visible"
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      {(endMarker || startMarker) && (
        <defs>
          {endMarker}
          {startMarker}
        </defs>
      )}
      <motion.line
        animate={{ x1: sx, y1: sy, x2: ex, y2: ey, stroke: line.hexColor, opacity: line.alpha }}
        transition={transition}
        strokeWidth={line.strokeWeight}
        strokeLinecap="round"
        markerEnd={line.endCap === 'arrow' ? `url(#${endMarkerId})` : undefined}
        markerStart={line.startCap === 'arrow' ? `url(#${startMarkerId})` : undefined}
      />
    </svg>
  );
}

registerRenderer<Line>('line', (el) => <LineView line={el as Line} />);
