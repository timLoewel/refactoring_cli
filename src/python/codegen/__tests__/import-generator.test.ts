import {
  generateImportStatement,
  fromImport,
  moduleImport,
  typingImport,
  isBuiltin,
  isPep585Builtin,
  isTypingSymbol,
  importForAnnotation,
} from "../import-generator.js";

describe("generateImportStatement", () => {
  it("generates `import module`", () => {
    expect(generateImportStatement(moduleImport("os"))).toBe("import os");
  });

  it("generates `from module import name`", () => {
    expect(generateImportStatement(fromImport("os.path", "join"))).toBe("from os.path import join");
  });

  it("generates `from module import name as alias`", () => {
    expect(generateImportStatement(fromImport("utils", "foo", { alias: "f" }))).toBe(
      "from utils import foo as f",
    );
  });

  it("generates `import module as alias`", () => {
    expect(generateImportStatement(moduleImport("numpy", { alias: "np" }))).toBe(
      "import numpy as np",
    );
  });

  it("generates `from . import name` (relative)", () => {
    expect(generateImportStatement(fromImport(".", "name"))).toBe("from . import name");
  });

  it("generates `from .module import name` (relative)", () => {
    expect(generateImportStatement(fromImport(".utils", "helper"))).toBe(
      "from .utils import helper",
    );
  });
});

describe("import spec properties", () => {
  it("marks relative imports", () => {
    expect(fromImport(".utils", "foo").isRelative).toBe(true);
    expect(fromImport("utils", "foo").isRelative).toBe(false);
    expect(moduleImport(".utils").isRelative).toBe(true);
  });

  it("marks type-only imports", () => {
    expect(fromImport("utils", "MyType", { isTypeOnly: true }).isTypeOnly).toBe(true);
    expect(fromImport("utils", "foo").isTypeOnly).toBe(false);
    expect(typingImport("Optional", true).isTypeOnly).toBe(true);
  });
});

describe("isBuiltin", () => {
  it("recognizes Python builtins", () => {
    expect(isBuiltin("str")).toBe(true);
    expect(isBuiltin("int")).toBe(true);
    expect(isBuiltin("float")).toBe(true);
    expect(isBuiltin("bool")).toBe(true);
    expect(isBuiltin("None")).toBe(true);
    expect(isBuiltin("dict")).toBe(true);
    expect(isBuiltin("list")).toBe(true);
    expect(isBuiltin("tuple")).toBe(true);
    expect(isBuiltin("set")).toBe(true);
    expect(isBuiltin("bytes")).toBe(true);
    expect(isBuiltin("type")).toBe(true);
  });

  it("rejects non-builtins", () => {
    expect(isBuiltin("Optional")).toBe(false);
    expect(isBuiltin("MyClass")).toBe(false);
    expect(isBuiltin("datetime")).toBe(false);
  });
});

describe("isPep585Builtin", () => {
  it("recognizes PEP 585 builtins that don't need typing imports", () => {
    expect(isPep585Builtin("list")).toBe(true);
    expect(isPep585Builtin("dict")).toBe(true);
    expect(isPep585Builtin("tuple")).toBe(true);
    expect(isPep585Builtin("set")).toBe(true);
    expect(isPep585Builtin("frozenset")).toBe(true);
    expect(isPep585Builtin("type")).toBe(true);
  });

  it("rejects typing.* equivalents", () => {
    expect(isPep585Builtin("List")).toBe(false);
    expect(isPep585Builtin("Dict")).toBe(false);
    expect(isPep585Builtin("Optional")).toBe(false);
  });
});

describe("isTypingSymbol", () => {
  it("recognizes typing module symbols", () => {
    expect(isTypingSymbol("Optional")).toBe(true);
    expect(isTypingSymbol("Union")).toBe(true);
    expect(isTypingSymbol("List")).toBe(true);
    expect(isTypingSymbol("Dict")).toBe(true);
    expect(isTypingSymbol("Any")).toBe(true);
    expect(isTypingSymbol("TypeVar")).toBe(true);
    expect(isTypingSymbol("TypeAlias")).toBe(true);
    expect(isTypingSymbol("Protocol")).toBe(true);
    expect(isTypingSymbol("Final")).toBe(true);
    expect(isTypingSymbol("Literal")).toBe(true);
  });

  it("rejects non-typing symbols", () => {
    expect(isTypingSymbol("str")).toBe(false);
    expect(isTypingSymbol("MyClass")).toBe(false);
    expect(isTypingSymbol("datetime")).toBe(false);
  });
});

describe("importForAnnotation", () => {
  it("returns null for builtins (no import needed)", () => {
    expect(importForAnnotation("str")).toBeNull();
    expect(importForAnnotation("int")).toBeNull();
    expect(importForAnnotation("float")).toBeNull();
    expect(importForAnnotation("bool")).toBeNull();
    expect(importForAnnotation("None")).toBeNull();
    expect(importForAnnotation("dict")).toBeNull();
    expect(importForAnnotation("list")).toBeNull();
    expect(importForAnnotation("tuple")).toBeNull();
    expect(importForAnnotation("set")).toBeNull();
    expect(importForAnnotation("bytes")).toBeNull();
    expect(importForAnnotation("type")).toBeNull();
  });

  it("returns typing import for Optional[str]", () => {
    const spec = importForAnnotation("Optional");
    expect(spec).not.toBeNull();
    expect(
      generateImportStatement(spec ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from typing import Optional");
  });

  it("returns null for str | None (PEP 604, no import needed)", () => {
    // str | None uses builtins, no import needed
    expect(importForAnnotation("str")).toBeNull();
  });

  it("returns null for list[int] (PEP 585, no import needed)", () => {
    expect(importForAnnotation("list")).toBeNull();
  });

  it("returns typing import for List[int]", () => {
    const spec = importForAnnotation("List");
    expect(spec).not.toBeNull();
    expect(
      generateImportStatement(spec ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from typing import List");
  });

  it("returns typing import for Union[str, int]", () => {
    const spec = importForAnnotation("Union");
    expect(spec).not.toBeNull();
    expect(
      generateImportStatement(spec ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from typing import Union");
  });

  it("returns typing import for Any in dict[str, Any]", () => {
    // dict needs no import, but Any does
    expect(importForAnnotation("dict")).toBeNull();
    const spec = importForAnnotation("Any");
    expect(spec).not.toBeNull();
    expect(
      generateImportStatement(spec ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from typing import Any");
  });

  it("returns from-import for custom types with known definition module", () => {
    const spec = importForAnnotation("MyClass", "my_module");
    expect(spec).not.toBeNull();
    expect(
      generateImportStatement(spec ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from my_module import MyClass");
  });

  it("returns from-import for datetime.datetime", () => {
    const spec = importForAnnotation("datetime", "datetime");
    expect(spec).not.toBeNull();
    expect(
      generateImportStatement(spec ?? { module: "", isRelative: false, isTypeOnly: false }),
    ).toBe("from datetime import datetime");
  });

  it("returns null for unknown symbols without definition module", () => {
    expect(importForAnnotation("SomeUnknown")).toBeNull();
  });
});

describe("typingImport", () => {
  it("creates a from-typing import spec", () => {
    const spec = typingImport("Optional");
    expect(spec.module).toBe("typing");
    expect(spec.name).toBe("Optional");
    expect(spec.isRelative).toBe(false);
    expect(spec.isTypeOnly).toBe(false);
  });

  it("supports type-only flag", () => {
    const spec = typingImport("Optional", true);
    expect(spec.isTypeOnly).toBe(true);
  });
});
