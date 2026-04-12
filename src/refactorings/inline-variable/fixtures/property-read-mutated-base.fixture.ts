// The variable captures a property (.length) from an object before a mutating
// method call on the same base object. Inlining would move the property read
// to after the mutation, producing a different value.
export const params = { file: "fixture.ts", target: "lengthBefore", expectRejection: true };

export function main(): number {
  const arr = [1, 2, 3];
  const lengthBefore = arr.length;
  arr.push(4);
  return lengthBefore;
}
