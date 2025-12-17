/**
 * Table of Contents / Document Outline Component
 *
 * Left sidebar showing document structure based on headings
 * - Extracts H1, H2, H3 from editor content
 * - Hierarchical display with indentation
 * - Click to navigate to heading
 * - Active heading highlight based on scroll position
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, List, FileText } from 'lucide-react';
import type { EditorInstance, JSONContent } from 'novel';

interface HeadingItem {
    id: string;
    level: number;
    text: string;
    pos: number; // Position in document for navigation
}

interface TableOfContentsProps {
    editor: EditorInstance | null;
    isOpen?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
}

export function TableOfContents({ editor, isOpen = false, onOpenChange }: TableOfContentsProps) {
    const [headings, setHeadings] = useState<HeadingItem[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    /**
     * Extract headings from editor content
     */
    useEffect(() => {
        if (!editor) return;

        const extractHeadings = () => {
            const items: HeadingItem[] = [];
            let index = 0;

            editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'heading') {
                    const text = node.textContent;
                    if (text.trim()) {
                        items.push({
                            id: `heading-${index}`,
                            level: node.attrs.level || 1,
                            text: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
                            pos,
                        });
                        index++;
                    }
                }
            });

            setHeadings(items);
        };

        // Initial extraction
        extractHeadings();

        // Listen for content changes
        const updateHandler = () => {
            extractHeadings();
        };

        editor.on('update', updateHandler);

        return () => {
            editor.off('update', updateHandler);
        };
    }, [editor]);

    /**
     * Navigate to heading when clicked
     */
    const scrollToHeading = (item: HeadingItem) => {
        if (!editor) return;

        try {
            // Focus editor and set cursor to heading position
            editor.chain().focus().setTextSelection(item.pos + 1).run();

            // Scroll the heading into view
            const domNode = editor.view.nodeDOM(item.pos);
            if (domNode && domNode instanceof Element) {
                domNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setActiveId(item.id);
            }
        } catch (error) {
            console.error('Failed to scroll to heading:', error);
        }
    };

    /**
     * Get indentation based on heading level
     */
    const getIndentClass = (level: number) => {
        switch (level) {
            case 1:
                return 'pl-0 font-semibold';
            case 2:
                return 'pl-4 font-medium';
            case 3:
                return 'pl-8 text-sm';
            case 4:
                return 'pl-12 text-sm text-muted-foreground';
            default:
                return 'pl-16 text-xs text-muted-foreground';
        }
    };

    // This component is a pure content component
    // Position and animation are controlled by parent
    return (
        <div className="h-full w-[280px] bg-card border-r border-border flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-border flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <List className="w-5 h-5 text-primary" />
                        <h2 className="font-semibold text-foreground">Outline</h2>
                    </div>
                    <button
                        type="button"
                        onClick={() => onOpenChange?.(false)}
                        className="p-1 hover:bg-accent rounded transition-colors"
                        aria-label="Close outline"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Headings List */}
            <div className="flex-1 overflow-y-auto p-2">
                {headings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                        <FileText className="w-12 h-12 text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">
                            No headings yet
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Use /heading to add structure
                        </p>
                    </div>
                ) : (
                    <nav className="space-y-0.5">
                        {headings.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => scrollToHeading(item)}
                                className={`
                  w-full text-left py-1.5 px-2 rounded-md transition-colors
                  hover:bg-accent truncate
                  ${getIndentClass(item.level)}
                  ${activeId === item.id ? 'bg-accent text-accent-foreground' : 'text-foreground/80'}
                `}
                                title={item.text}
                            >
                                {item.text}
                            </button>
                        ))}
                    </nav>
                )}
            </div>

            {/* Footer with heading count */}
            <div className="p-3 border-t border-border bg-muted flex-shrink-0">
                <p className="text-xs text-muted-foreground text-center">
                    {headings.length} heading{headings.length !== 1 ? 's' : ''}
                </p>
            </div>
        </div>
    );
}
