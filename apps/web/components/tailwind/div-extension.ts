/**
 * Div Extension for TipTap
 *
 * Allows div containers with inline styles for image grids
 */

import { Node } from '@tiptap/core';

export const DivExtension = Node.create({
  name: 'div',
  group: 'block',
  content: 'block+',

  parseHTML() {
    return [
      { tag: 'div' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', HTMLAttributes, 0];
  },

  addAttributes() {
    return {
      style: {
        default: null,
        parseHTML: element => element.getAttribute('style'),
        renderHTML: attributes => {
          if (!attributes.style) {
            return {};
          }
          return { style: attributes.style };
        },
      },
      class: {
        default: null,
        parseHTML: element => element.getAttribute('class'),
        renderHTML: attributes => {
          if (!attributes.class) {
            return {};
          }
          return { class: attributes.class };
        },
      },
    };
  },
});
