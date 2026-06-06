import React, { useState, useRef, useEffect } from 'react';

export default function ProjectSwitcher({ projects, currentProject, onSwitch, onCreate }) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreate(newName.trim());
    setNewName('');
    setShowCreate(false);
    setOpen(false);
  };

  const project = projects.find((p) => p.id === currentProject);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gdpro-bg-surface border border-gdpro-border hover:border-gdpro-text-muted transition-all text-left min-w-[180px]"
      >
        <div className="w-7 h-7 rounded-md bg-gdpro-accent/15 flex items-center justify-center shrink-0">
          <span className="text-sm">{project?.name?.charAt(0) || '?'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gdpro-text truncate">{project?.name || '选择项目'}</div>
          <div className="text-2xs text-gdpro-text-muted">{project ? `第 ${project.currentPhase} 阶段` : '无项目'}</div>
        </div>
        <svg className={`w-4 h-4 text-gdpro-text-muted transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-72 gdpro-card z-50 shadow-xl animate-fade-in">
          <div className="px-3 py-2 border-b border-gdpro-border flex items-center justify-between">
            <span className="text-2xs font-medium text-gdpro-text-muted uppercase tracking-wider">我的项目</span>
            <button
              onClick={() => setShowCreate(true)}
              className="text-2xs text-gdpro-accent hover:text-gdpro-accent-hover font-medium"
            >
              + 新建
            </button>
          </div>

          {showCreate && (
            <div className="p-3 border-b border-gdpro-border bg-gdpro-accent-dim/20">
              <input
                autoFocus
                className="gdpro-input text-xs mb-2"
                placeholder="项目名称"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <div className="flex gap-2">
                <button onClick={handleCreate} className="gdpro-button text-2xs py-1 flex-1">创建</button>
                <button onClick={() => { setShowCreate(false); setNewName(''); }} className="gdpro-button-secondary text-2xs py-1">取消</button>
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1">
            {projects.length === 0 ? (
              <div className="px-3 py-4 text-center text-2xs text-gdpro-text-muted">暂无项目</div>
            ) : (
              projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onSwitch(p.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 transition-colors flex items-center gap-2.5 ${
                    currentProject === p.id ? 'bg-gdpro-accent-dim' : 'hover:bg-gdpro-bg-surface'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-sm ${
                    currentProject === p.id ? 'bg-gdpro-accent text-gdpro-bg' : 'bg-gdpro-bg-surface text-gdpro-text-secondary'
                  }`}>
                    {String(p.name || p.brandName || 'P').charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-medium truncate ${currentProject === p.id ? 'text-gdpro-accent' : 'text-gdpro-text'}`}>
                      {p.name || p.brandName || 'Untitled project'}
                    </div>
                    <div className="text-2xs text-gdpro-text-muted">
                      第 {p.currentPhase} 阶段 · {p.status === 'active' ? '进行中' : p.status === 'completed' ? '已完成' : '已归档'}
                    </div>
                  </div>
                  {currentProject === p.id && (
                    <svg className="w-4 h-4 text-gdpro-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
