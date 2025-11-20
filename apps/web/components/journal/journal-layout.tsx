/**
 * Journal Layout Component
 *
 * Responsive split layout for the travel journal:
 * - Desktop: Side-by-side (photo list left, editor right)
 * - Mobile: Stacked (photo list top, editor bottom)
 *
 * Props:
 * - sidebar: Photo list component
 * - editor: Caption editor component
 */

'use client';

interface JournalLayoutProps {
  sidebar: React.ReactNode;
  editor: React.ReactNode;
}

export function JournalLayout({ sidebar, editor }: JournalLayoutProps) {
  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-background">
      {/* Photo List Sidebar - Timeline */}
      <aside className="w-full lg:w-[400px] border-r border-border/30 bg-muted/5 overflow-hidden z-10 flex-shrink-0">
        {sidebar}
      </aside>

      {/* Caption Editor - Canvas */}
      <main className="flex-1 overflow-hidden relative bg-background">
        {editor}
      </main>
    </div>
  );
}
