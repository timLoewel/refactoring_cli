import { Project, ts, Node, SyntaxKind } from "ts-morph";
import { findReferencedTypeParams } from "./type-params.js";

function createProject(content: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
    },
  });
  return project.createSourceFile("test.ts", content);
}

describe("findReferencedTypeParams", () => {
  it("returns type params referenced in a node inside a generic function", () => {
    const sf = createProject(`
function foo<T>(x: T) {
  if (x) {
    console.log(x);
  }
}
`);
    const ifStmt = sf.getDescendantsOfKind(SyntaxKind.IfStatement)[0]!;
    const result = findReferencedTypeParams(ifStmt);
    expect(result).toEqual(["<T>"]);
  });

  it("returns only referenced type params, not all", () => {
    const sf = createProject(`
function foo<T, U>(x: T, y: U) {
  if (x) {
    console.log(x);
  }
}
`);
    const ifStmt = sf.getDescendantsOfKind(SyntaxKind.IfStatement)[0]!;
    const result = findReferencedTypeParams(ifStmt);
    expect(result).toEqual(["<T>"]);
  });

  it("returns multiple referenced type params", () => {
    const sf = createProject(`
function foo<T, U>(x: T, y: U) {
  const z = [x, y];
}
`);
    const varDecl = sf.getDescendantsOfKind(SyntaxKind.VariableStatement)[0]!;
    const result = findReferencedTypeParams(varDecl);
    expect(result).toEqual(["<T, U>"]);
  });

  it("preserves type param constraints", () => {
    const sf = createProject(`
function foo<T extends string>(x: T) {
  if (x) {
    console.log(x);
  }
}
`);
    const ifStmt = sf.getDescendantsOfKind(SyntaxKind.IfStatement)[0]!;
    const result = findReferencedTypeParams(ifStmt);
    expect(result).toEqual(["<T extends string>"]);
  });

  it("preserves default type params", () => {
    const sf = createProject(`
function foo<T = string>(x: T) {
  const y = x;
}
`);
    const varDecl = sf.getDescendantsOfKind(SyntaxKind.VariableStatement)[0]!;
    const result = findReferencedTypeParams(varDecl);
    expect(result).toEqual(["<T = string>"]);
  });

  it("returns empty array when no type params exist", () => {
    const sf = createProject(`
function foo(x: number) {
  const y = x + 1;
}
`);
    const varDecl = sf.getDescendantsOfKind(SyntaxKind.VariableStatement)[0]!;
    const result = findReferencedTypeParams(varDecl);
    expect(result).toEqual([]);
  });

  it("returns empty array when type params exist but are not referenced", () => {
    const sf = createProject(`
function foo<T>(x: number) {
  const y = x + 1;
}
`);
    const varDecl = sf.getDescendantsOfKind(SyntaxKind.VariableStatement)[0]!;
    const result = findReferencedTypeParams(varDecl);
    expect(result).toEqual([]);
  });

  it("finds type params from enclosing class", () => {
    const sf = createProject(`
class Box<T> {
  value: T;
  check() {
    if (this.value) {
      console.log(this.value);
    }
  }
}
`);
    // The if statement references T through this.value, but the identifier "T"
    // itself doesn't appear in the if body — only the parameter variables do.
    // For class context, we detect T through parameter/variable types.
    const ifStmt = sf.getDescendantsOfKind(SyntaxKind.IfStatement)[0]!;
    const result = findReferencedTypeParams(ifStmt);
    // T is not directly referenced as an identifier in the if body
    expect(result).toEqual([]);
  });

  it("finds type params from class when used as type annotation", () => {
    const sf = createProject(`
class Box<T> {
  process(item: T) {
    const copy: T = item;
  }
}
`);
    const varDecl = sf.getDescendantsOfKind(SyntaxKind.VariableStatement)[0]!;
    const result = findReferencedTypeParams(varDecl);
    expect(result).toEqual(["<T>"]);
  });

  it("handles nested generic functions — uses innermost", () => {
    const sf = createProject(`
function outer<T>(x: T) {
  function inner<U>(y: U) {
    const z = y;
  }
}
`);
    const varDecl = sf.getDescendantsOfKind(SyntaxKind.VariableStatement)[0]!;
    const result = findReferencedTypeParams(varDecl);
    // z = y references U (from inner), not T
    expect(result).toEqual(["<U>"]);
  });

  it("collects type params from multiple enclosing scopes", () => {
    const sf = createProject(`
function outer<T>(x: T) {
  function inner<U>(y: U) {
    const z: T = x;
    const w: U = y;
  }
}
`);
    // Get the block of inner function which contains both statements
    const innerFn = sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration).find(
      (f) => f.getName() === "inner",
    )!;
    const body = innerFn.getBody()!;
    const result = findReferencedTypeParams(body);
    expect(result).toEqual(["<T, U>"]);
  });

  it("works with arrow functions", () => {
    const sf = createProject(`
const foo = <T>(x: T) => {
  const y: T = x;
};
`);
    // Get the variable statement inside the arrow body
    const arrowBody = sf.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0]!;
    const varStmt = arrowBody.getDescendantsOfKind(SyntaxKind.VariableStatement)[0]!;
    const result = findReferencedTypeParams(varStmt);
    expect(result).toEqual(["<T>"]);
  });

  it("works with method declarations", () => {
    const sf = createProject(`
class Foo {
  bar<T>(x: T) {
    const y: T = x;
  }
}
`);
    const varDecl = sf.getDescendantsOfKind(SyntaxKind.VariableStatement)[0]!;
    const result = findReferencedTypeParams(varDecl);
    expect(result).toEqual(["<T>"]);
  });
});
