export enum NodeType {
  Class, // Node is a class (or class analogue).
  Method, // Node is a method (or function in functional languages)
  Snippet, // Code is a block of code (no more specific type applies).
  File, // Node represents a whole file. // TODO: Decide if actually used.
  Other, // Placeholder
}
