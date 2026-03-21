import { Square } from '../../shapes';
import { rgbToHex } from '../../../api/visualBuilder';
import type { InputElem } from './Input';
import { registerRenderer } from '../../views/rendererRegistry';
import { useAnimationEnabled, useAnimationDuration } from '../../../animation/animationContext';

export function InputView({ input }: { input: InputElem }) {
  const animate = useAnimationEnabled();
  const animationDuration = useAnimationDuration();
  const displayText = input.value || input.placeholder;
  const isPlaceholder = !input.value && !!input.placeholder;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Square color={rgbToHex(input.color, '#6366f1')} opacity={input.alpha} strokeWidth={1} animate={animate} animationDuration={animationDuration} />
      {displayText && (
        <div
          className="absolute inset-0 flex items-center px-2 font-mono text-sm pointer-events-none overflow-hidden"
          style={{ color: isPlaceholder ? 'rgba(255,255,255,0.5)' : 'white' }}
        >
          <span className="truncate">{displayText}</span>
        </div>
      )}
    </div>
  );
}

registerRenderer<InputElem>('input', (element) => <InputView input={element as InputElem} />);
