import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import { useReducedMotion } from './city/motion.js';
import './city/cityFx.css';

const PARTICLES = [0, 1, 2];

// A lit connection on a player's map: glowing line with data particles flowing along it.
// The particle color comes from the city's --particle CSS variable (a cosmetic).
// data.fx (optional, see src/city/useCityFx.js): the connection was just made, so it draws itself
// from the new component outward after fx.delay ms, and only then starts carrying particles.
export default function FlowEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd, data,
}) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const still = useReducedMotion();
  const fx = data?.fx;
  const fxClass = fx ? ` edge-fx${fx.reverse ? ' rev' : ''}${fx.light ? ' light' : ''}` : '';

  return (
    <>
      <g className={`flow-edge${fxClass}`} style={fx ? { '--fx-delay': `${fx.delay}ms` } : undefined}>
        <path d={path} className="flow-glow" />
        <BaseEdge id={id} path={path} markerEnd={markerEnd} className="flow-line" />
        {!still && (
          <g className="flow-dots">
            {PARTICLES.map((i) => (
              <circle key={i} r={3 - i * 0.5} className="flow-dot">
                <animateMotion dur="2.4s" begin={`${-i * 0.8}s`} repeatCount="indefinite" path={path} />
              </circle>
            ))}
          </g>
        )}
        {fx && <path key={fx.key} d={path} pathLength="1" className="flow-draw" />}
      </g>
      {label && (
        <EdgeLabelRenderer>
          <div className="flow-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
