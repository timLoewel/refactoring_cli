import { extractTypeNames, resolveAnnotationImports } from "../annotation-resolver.js";
import { generateImportStatement } from "../import-generator.js";

describe("extractTypeNames", () => {
  it("extracts from Optional[str]", () => {
    expect(extractTypeNames("Optional[str]")).toEqual(expect.arrayContaining(["Optional", "str"]));
  });

  it("extracts from str | None (PEP 604)", () => {
    const names = extractTypeNames("str | None");
    expect(names).toContain("str");
    expect(names).toContain("None");
  });

  it("extracts from list[int] (PEP 585)", () => {
    const names = extractTypeNames("list[int]");
    expect(names).toContain("list");
    expect(names).toContain("int");
  });

  it("extracts from List[int] (typing)", () => {
    const names = extractTypeNames("List[int]");
    expect(names).toContain("List");
    expect(names).toContain("int");
  });

  it("extracts from Union[str, int]", () => {
    const names = extractTypeNames("Union[str, int]");
    expect(names).toContain("Union");
    expect(names).toContain("str");
    expect(names).toContain("int");
  });

  it("extracts from dict[str, Any]", () => {
    const names = extractTypeNames("dict[str, Any]");
    expect(names).toContain("dict");
    expect(names).toContain("str");
    expect(names).toContain("Any");
  });

  it("extracts from nested: Optional[List[datetime]]", () => {
    const names = extractTypeNames("Optional[List[datetime]]");
    expect(names).toContain("Optional");
    expect(names).toContain("List");
    expect(names).toContain("datetime");
  });

  it("extracts from string annotation (forward reference)", () => {
    const names = extractTypeNames('"MyClass"');
    expect(names).toContain("MyClass");
  });

  it("extracts plain identifier", () => {
    expect(extractTypeNames("MyClass")).toEqual(["MyClass"]);
  });

  it("extracts from Callable[[int, str], bool]", () => {
    const names = extractTypeNames("Callable[[int, str], bool]");
    expect(names).toContain("Callable");
    expect(names).toContain("int");
    expect(names).toContain("str");
    expect(names).toContain("bool");
  });

  it("deduplicates names", () => {
    const names = extractTypeNames("Union[str, str]");
    const strCount = names.filter((n) => n === "str").length;
    expect(strCount).toBe(1);
  });
});

describe("resolveAnnotationImports", () => {
  it("returns empty for builtins only", () => {
    const imports = resolveAnnotationImports(["str", "int", "float", "bool", "None"]);
    expect(imports).toHaveLength(0);
  });

  it("returns typing import for Optional", () => {
    const imports = resolveAnnotationImports(["Optional", "str"]);
    expect(imports).toHaveLength(1);
    expect(
      generateImportStatement(imports[0] ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from typing import Optional");
  });

  it("returns no import for PEP 604 str | None", () => {
    const imports = resolveAnnotationImports(["str", "None"]);
    expect(imports).toHaveLength(0);
  });

  it("returns no import for PEP 585 list[int]", () => {
    const imports = resolveAnnotationImports(["list", "int"]);
    expect(imports).toHaveLength(0);
  });

  it("returns typing import for List[int]", () => {
    const imports = resolveAnnotationImports(["List", "int"]);
    expect(imports).toHaveLength(1);
    expect(
      generateImportStatement(imports[0] ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from typing import List");
  });

  it("returns typing import for Union[str, int]", () => {
    const imports = resolveAnnotationImports(["Union", "str", "int"]);
    expect(imports).toHaveLength(1);
    expect(
      generateImportStatement(imports[0] ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from typing import Union");
  });

  it("returns typing import for Any in dict[str, Any]", () => {
    const imports = resolveAnnotationImports(["dict", "str", "Any"]);
    expect(imports).toHaveLength(1);
    expect(
      generateImportStatement(imports[0] ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from typing import Any");
  });

  it("resolves nested: Optional[List[datetime]] with definition modules", () => {
    const defModules = new Map([["datetime", "datetime"]]);
    const imports = resolveAnnotationImports(["Optional", "List", "datetime"], defModules);
    expect(imports).toHaveLength(3);
    const stmts = imports.map((i) => generateImportStatement(i));
    expect(stmts).toContain("from typing import Optional");
    expect(stmts).toContain("from typing import List");
    expect(stmts).toContain("from datetime import datetime");
  });

  it("resolves custom types with definition modules", () => {
    const defModules = new Map([["MyClass", "my_module"]]);
    const imports = resolveAnnotationImports(["MyClass"], defModules);
    expect(imports).toHaveLength(1);
    expect(
      generateImportStatement(imports[0] ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from my_module import MyClass");
  });

  it("returns no import for builtins even with definition module", () => {
    const defModules = new Map([["str", "builtins"]]);
    const imports = resolveAnnotationImports(["str"], defModules);
    expect(imports).toHaveLength(0);
  });

  it("handles string annotations (forward references)", () => {
    // The type name is already extracted from the string
    const defModules = new Map([["MyClass", "models"]]);
    const imports = resolveAnnotationImports(["MyClass"], defModules);
    expect(imports).toHaveLength(1);
    expect(
      generateImportStatement(imports[0] ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from models import MyClass");
  });

  it("handles TypeAlias", () => {
    const imports = resolveAnnotationImports(["TypeAlias"]);
    expect(imports).toHaveLength(1);
    expect(
      generateImportStatement(imports[0] ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from typing import TypeAlias");
  });

  it("handles TypeVar", () => {
    const imports = resolveAnnotationImports(["TypeVar"]);
    expect(imports).toHaveLength(1);
    expect(
      generateImportStatement(imports[0] ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from typing import TypeVar");
  });

  it("deduplicates imports for same symbol", () => {
    const imports = resolveAnnotationImports(["Optional", "Optional"]);
    expect(imports).toHaveLength(1);
  });
});
