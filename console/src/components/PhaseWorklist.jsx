import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Circle, ClipboardList } from 'lucide-react';
import { getPhaseWorklist, mergePhaseTasks, PHASE_WORKLIST } from '../lib/phaseStateMachine';

export { PHASE_WORKLIST };

export default function PhaseWorklist({ currentPhase, skillTasks }) {
  const [expanded, setExpanded] = useState(true);
  const phase = currentPhase || 1;
  const defaultInfo = getPhaseWorklist(phase);
  const tasks = skillTasks ? mergePhaseTasks(skillTasks, defaultInfo.tasks) : defaultInfo.tasks;
  const info = {
    ...defaultInfo,
    title: defaultInfo.title,
    tasks,
  };

  if (!info) return null;

  const doneCount = info.tasks.filter((task) => task.done).length;
  const totalCount = info.tasks.length;

  return (
    <div
      className="shrink-0 mx-3 mb-2 rounded-[14px] overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <button
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <ClipboardList className="w-3.5 h-3.5 text-gdpro-accent shrink-0" strokeWidth={2} />
        <span className="text-[11px] font-semibold text-gdpro-text truncate">
          {info.title}
        </span>
        <span className="text-[10px] text-gdpro-text-muted ml-auto">
          {doneCount}/{totalCount}
        </span>
        <span className="text-[10px] text-gdpro-text-muted ml-1 hidden sm:inline truncate max-w-[220px]">
          {info.description}
        </span>
        {expanded ? (
          <ChevronUp className="w-3 h-3 text-gdpro-text-muted ml-1 shrink-0" strokeWidth={2} />
        ) : (
          <ChevronDown className="w-3 h-3 text-gdpro-text-muted ml-1 shrink-0" strokeWidth={2} />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2">
          <ul className="space-y-0.5">
            {info.tasks.map((task) => (
              <li key={task.id || task.text} className="text-[11px] text-gdpro-text-secondary flex items-start gap-1.5">
                {task.done ? (
                  <CheckCircle2 className="w-3 h-3 text-gdpro-success mt-[2px] shrink-0" strokeWidth={2.3} />
                ) : (
                  <Circle className="w-3 h-3 text-gdpro-text-muted mt-[2px] shrink-0" strokeWidth={2} />
                )}
                <span className="leading-snug">{task.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
