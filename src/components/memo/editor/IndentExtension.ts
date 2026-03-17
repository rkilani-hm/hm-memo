import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

const Indent = Extension.create({
  name: 'indent',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
      minLevel: 0,
      maxLevel: 8,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const ml = element.style.marginLeft;
              if (!ml) return 0;
              return parseInt(ml) / 40 || 0;
            },
            renderHTML: (attributes) => {
              if (!attributes.indent || attributes.indent === 0) return {};
              return { style: `margin-left: ${attributes.indent * 40}px` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          const { from, to } = selection;
          let changed = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              const currentIndent = node.attrs.indent || 0;
              if (currentIndent < this.options.maxLevel) {
                if (dispatch) {
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    indent: currentIndent + 1,
                  });
                }
                changed = true;
              }
            }
          });
          return changed;
        },
      outdent:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          const { from, to } = selection;
          let changed = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              const currentIndent = node.attrs.indent || 0;
              if (currentIndent > this.options.minLevel) {
                if (dispatch) {
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    indent: currentIndent - 1,
                  });
                }
                changed = true;
              }
            }
          });
          return changed;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Tab': () => {
        if (this.editor.isActive('listItem') || this.editor.isActive('taskItem')) {
          return false;
        }
        return this.editor.commands.indent();
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('listItem') || this.editor.isActive('taskItem')) {
          return false;
        }
        return this.editor.commands.outdent();
      },
    };
  },
});

export default Indent;
