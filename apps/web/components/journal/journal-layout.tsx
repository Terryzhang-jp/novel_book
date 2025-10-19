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
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden">
      {/* Photo List Sidebar */}
      <aside className="w-full lg:w-96 border-r border-border bg-card overflow-hidden">
        {sidebar}
      </aside>

      {/* Caption Editor */}
      <main className="flex-1 bg-background overflow-hidden">
        {editor}
      </main>
    </div>
  );
}
