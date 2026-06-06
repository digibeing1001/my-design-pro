import React from 'react';
import { Grid3x3, ImageIcon } from 'lucide-react';

const BOARD_LABELS = {
  color: '色彩',
  typography: '字体',
  composition: '构图',
  texture: '质感',
  photography: '摄影',
  tone: '情绪',
};

export default function MoodboardGrid({ data }) {
  if (!data) return null;
  const boards = data.boards || [];

  return (
    <div className="rounded-lg border border-gdpro-border bg-gdpro-bg-elevated overflow-hidden mt-3">
      <div className="px-3 py-2 border-b border-gdpro-border flex items-center gap-2">
        <Grid3x3 className="w-4 h-4 text-gdpro-accent" strokeWidth={2} />
        <span className="text-[13px] font-semibold text-gdpro-text">Moodboard</span>
        <span className="text-[10px] text-gdpro-text-muted ml-auto">{boards.length} 个维度</span>
      </div>

      <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {boards.map((board, i) => (
          <div key={i} className="rounded-md border border-gdpro-border overflow-hidden bg-gdpro-bg-hover/30">
            <div className="aspect-[4/3] bg-gdpro-bg-hover flex items-center justify-center relative">
              {board.imageUrl ? (
                <img src={board.imageUrl} alt={board.label} className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="w-6 h-6 text-gdpro-text-muted" strokeWidth={1.5} />
              )}
              <div className="absolute inset-x-1.5 bottom-1.5 rounded-md border border-white/70 bg-white/86 px-2 py-1 shadow-sm backdrop-blur-sm">
                <span className="text-[10px] font-medium text-gdpro-text-secondary">{BOARD_LABELS[board.type] || board.label}</span>
              </div>
            </div>
            {board.description && (
              <div className="px-2 py-1.5">
                <p className="text-[10px] text-gdpro-text-secondary leading-relaxed line-clamp-2">{board.description}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
