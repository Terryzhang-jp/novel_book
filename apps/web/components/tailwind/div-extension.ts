/**
 * Div Extension for TipTap
 *
 * Allows div containers with inline styles for image grids
 *
 * NOTE: Currently commented out due to import issues with TipTap Node.
 * Will be re-enabled when needed.
 */

// Commented out temporarily - not currently used
/*
import { Node } from 'novel/extensions';

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
*/
