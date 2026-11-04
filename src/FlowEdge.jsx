import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';

// A lit connection on a player's map: glowing line with data particles flowing along it.
// The particle color comes from the city's --particle CSS variable (a cosmetic).
export default function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd }) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const particles = [0, 1, 2];

  return (
    <>
      <path d={path} className="flow-glow" />
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className="flow-line" />
      {particles.map((i) => (
        <circle key={i} r="3" className="flow-dot">
          <animateMotion dur="2.4s" begin={`${i * 0.8}s`} repeatCount="indefinite" path={path} />
        </circle>
      ))}
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
