import React from 'react';
import { Compass, Palette, Type, Layout, Waves } from 'lucide-react';

const DNA_ICONS = {
  color: Palette,
  typography: Type,
  composition: Layout,
  texture: Waves,
};

export default function DesignPhilosophyCard({ data }) {
  if (!data) return null;
  const { name, statement, dna = {}, principles = [] } = data;

  return (
    <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated overflow-hidden mt-3">
      <div className="px-3 py-2.5 border-b border-gdpro-border bg-gdpro-accent/5">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-gdpro-accent" strokeWidth={2} />
          <span className="text-[13px] font-semibold text-gdpro-text">设计哲学</span>
        </div>
        {name && <div className="text-[15px] font-bold text-gdpro-accent mt-1">{name}</div>}
        {statement && <p className="text-[11px] text-gdpro-text-secondary mt-1 leading-relaxed">{statement}</p>}
      </div>

      {Object.keys(dna).length > 0 && (
        <div className="px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(dna).map(([key, value]) => {
            const Icon = DNA_ICONS[key] || Waves;
            return (
              <div key={key} className="flex items-start gap-2 p-2 rounded-md bg-gdpro-bg-hover/40">
                <Icon className="w-3.5 h-3.5 text-gdpro-text-muted shrink-0 mt-0.5" strokeWidth={1.5} />
                <div>
                  <div className="text-[10px] font-semibold text-gdpro-text-muted uppercase">{key}</div>
                  <div className="text-[11px] text-gdpro-text-secondary mt-0.5">{value}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {principles.length > 0 && (
        <div className="px-3 pb-2.5 pt-0">
          <div className="h-px bg-gdpro-border/40 mb-2" />
          <div className="text-[10px] font-semibold text-gdpro-text-muted mb-1">核心原则</div>
          <ul className="space-y-1">
            {principles.map((p, i) => (
              <li key={i} className="text-[11px] text-gdpro-text-secondary flex items-start gap-1.5">
                <span className="text-gdpro-accent mt-[2px]">●</span> {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
