import { BubbleMenu, useCurrentEditor } from "@tiptap/react";
import type { BubbleMenuProps } from "@tiptap/react";
import { forwardRef, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import type { Instance, Props } from "tippy.js";

export interface EditorBubbleProps extends Omit<BubbleMenuProps, "editor"> {
  readonly children: ReactNode;
}

export const EditorBubble = forwardRef<HTMLDivElement, EditorBubbleProps>(
  ({ children, tippyOptions, ...rest }, ref) => {
    const { editor: currentEditor } = useCurrentEditor();
    const instanceRef = useRef<Instance<Props> | null>(null);

    useEffect(() => {
      if (!instanceRef.current || !tippyOptions?.placement) return;

      instanceRef.current.setProps({ placement: tippyOptions.placement });
      instanceRef.current.popperInstance?.update();
    }, [tippyOptions?.placement]);

    const bubbleMenuProps: Omit<BubbleMenuProps, "children"> = useMemo(() => {
      const shouldShow: BubbleMenuProps["shouldShow"] = ({ editor, state }) => {
        const { selection } = state;
        const { empty } = selection;

        // Show bubble menu when:
        // - the editor is editable
        // - the selection is not empty (includes text selections and node selections like images)
        // Note: Removed image and node selection checks to allow ImageAlignSelector to show for images
        if (!editor.isEditable || empty) {
          return false;
        }
        return true;
      };

      return {
        shouldShow,
        tippyOptions: {
          onCreate: (val) => {
            instanceRef.current = val;

            instanceRef.current.popper.firstChild?.addEventListener("blur", (event) => {
              event.preventDefault();
              event.stopImmediatePropagation();
            });
          },
          moveTransition: "transform 0.15s ease-out",
          ...tippyOptions,
        },
        editor: currentEditor,
        ...rest,
      };
    }, [rest, tippyOptions]);

    if (!currentEditor) return null;

    return (
      // We need to add this because of https://github.com/ueberdosis/tiptap/issues/2658
      <div ref={ref}>
        <BubbleMenu {...bubbleMenuProps}>{children}</BubbleMenu>
      </div>
    );
  },
);

EditorBubble.displayName = "EditorBubble";

export default EditorBubble;
