/**
 * Global type declarations for the application
 */

// CSS Module declarations
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

// Allow importing CSS files without content
declare module '@/styles/*.css';
