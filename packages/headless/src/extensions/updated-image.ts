import Image from "@tiptap/extension-image";

const UpdatedImage = Image.extend({
  name: "image",
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
      },
      height: {
        default: null,
      },
      align: {
        default: "left",
        parseHTML: (element) => element.getAttribute("data-align") || "left",
        renderHTML: (attributes) => {
          if (!attributes.align) return {};
          return {
            "data-align": attributes.align,
          };
        },
      },
    };
  },
});

export default UpdatedImage;
