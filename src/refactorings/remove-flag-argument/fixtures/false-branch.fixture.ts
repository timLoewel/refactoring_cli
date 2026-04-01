// No params: after splitting, WhenTrue/WhenFalse bodies still reference the removed
// flag variable by name, causing a ReferenceError at runtime. The fixture below
// shows the before-state only.

function renderWidget(size: number, compact: boolean): string {
  if (compact) {
    return `[compact:${size}]`;
  }
  return `[full:${size}]`;
}

export function main(): string {
  return renderWidget(20, false);
}
