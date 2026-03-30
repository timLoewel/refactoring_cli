import { mergeImports, parseImports, classifyModule } from "../import-merger.js";
import { fromImport, moduleImport } from "../import-generator.js";

describe("classifyModule", () => {
  it("classifies __future__ as future", () => {
    expect(classifyModule("__future__")).toBe("future");
  });

  it("classifies stdlib modules", () => {
    expect(classifyModule("os")).toBe("stdlib");
    expect(classifyModule("os.path")).toBe("stdlib");
    expect(classifyModule("typing")).toBe("stdlib");
    expect(classifyModule("datetime")).toBe("stdlib");
    expect(classifyModule("collections")).toBe("stdlib");
  });

  it("classifies third-party modules", () => {
    expect(classifyModule("numpy")).toBe("third-party");
    expect(classifyModule("pandas")).toBe("third-party");
    expect(classifyModule("requests")).toBe("third-party");
  });

  it("classifies relative imports as local", () => {
    expect(classifyModule(".utils")).toBe("local");
    expect(classifyModule("..models")).toBe("local");
    expect(classifyModule(".")).toBe("local");
  });
});

describe("parseImports", () => {
  it("parses from-imports", () => {
    const imports = parseImports("from os.path import join, exists\n");
    expect(imports).toHaveLength(1);
    expect(imports[0]?.module).toBe("os.path");
    expect(imports[0]?.names).toEqual([{ name: "join" }, { name: "exists" }]);
    expect(imports[0]?.isFromImport).toBe(true);
  });

  it("parses plain imports", () => {
    const imports = parseImports("import os\n");
    expect(imports).toHaveLength(1);
    expect(imports[0]?.module).toBe("os");
    expect(imports[0]?.isFromImport).toBe(false);
  });

  it("parses aliased imports", () => {
    const imports = parseImports("from utils import foo as f\n");
    expect(imports).toHaveLength(1);
    expect(imports[0]?.names).toEqual([{ name: "foo", alias: "f" }]);
  });

  it("parses module alias", () => {
    const imports = parseImports("import numpy as np\n");
    expect(imports).toHaveLength(1);
    expect(imports[0]?.module).toBe("numpy");
    expect(imports[0]?.names).toEqual([{ name: "numpy", alias: "np" }]);
  });

  it("identifies TYPE_CHECKING block imports", () => {
    const source = `from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models import User
    from services import Auth

x = 1
`;
    const imports = parseImports(source);
    const tcImports = imports.filter((i) => i.isTypeChecking);
    expect(tcImports).toHaveLength(2);
    expect(tcImports[0]?.module).toBe("models");
    expect(tcImports[1]?.module).toBe("services");
  });
});

describe("mergeImports", () => {
  it("adds to existing `from X import a` → `from X import a, b`", () => {
    const source = "from os.path import join\n\nx = 1\n";
    const result = mergeImports(source, [fromImport("os.path", "exists")]);
    expect(result).toContain("from os.path import join, exists");
  });

  it("does not duplicate when import already exists", () => {
    const source = "from os.path import join, exists\n\nx = 1\n";
    const result = mergeImports(source, [fromImport("os.path", "exists")]);
    // Should not add a second exists
    const matches = result.match(/exists/g);
    expect(matches).toHaveLength(1);
  });

  it("adds new from-import statement when module not yet imported", () => {
    const source = "from os.path import join\n\nx = 1\n";
    const result = mergeImports(source, [fromImport("datetime", "datetime")]);
    expect(result).toContain("from datetime import datetime");
  });

  it("adds plain import statement", () => {
    const source = "import os\n\nx = 1\n";
    const result = mergeImports(source, [moduleImport("sys")]);
    expect(result).toContain("import sys");
  });

  it("does not duplicate plain import", () => {
    const source = "import os\n\nx = 1\n";
    const result = mergeImports(source, [moduleImport("os")]);
    const matches = result.match(/import os/g);
    expect(matches).toHaveLength(1);
  });

  it("handles aliased imports alongside non-aliased", () => {
    const source = "from utils import foo\n\nx = 1\n";
    const result = mergeImports(source, [fromImport("utils", "bar", { alias: "b" })]);
    expect(result).toContain("from utils import foo, bar as b");
  });

  it("preserves `from __future__ import annotations` as first import", () => {
    const source = "from __future__ import annotations\nimport os\n\nx = 1\n";
    const result = mergeImports(source, [fromImport("datetime", "datetime")]);
    const lines = result.split("\n");
    const futureIdx = lines.findIndex((l) => l.includes("__future__"));
    const datetimeIdx = lines.findIndex((l) => l.includes("datetime"));
    expect(futureIdx).toBeLessThan(datetimeIdx);
  });

  it("merges type-only imports into existing `if TYPE_CHECKING:` block", () => {
    const source = `from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models import User

x = 1
`;
    const result = mergeImports(source, [fromImport("services", "Auth", { isTypeOnly: true })]);
    expect(result).toContain("    from services import Auth");
    // Should still be inside TYPE_CHECKING block
    const lines = result.split("\n");
    const tcLine = lines.findIndex((l) => l.includes("TYPE_CHECKING:"));
    const authLine = lines.findIndex((l) => l.includes("from services import Auth"));
    expect(authLine).toBeGreaterThan(tcLine);
  });

  it("creates new `if TYPE_CHECKING:` block when needed", () => {
    const source = "import os\n\nx = 1\n";
    const result = mergeImports(source, [fromImport("models", "User", { isTypeOnly: true })]);
    expect(result).toContain("from typing import TYPE_CHECKING");
    expect(result).toContain("if TYPE_CHECKING:");
    expect(result).toContain("    from models import User");
  });

  it("returns source unchanged when no imports to add", () => {
    const source = "import os\n\nx = 1\n";
    expect(mergeImports(source, [])).toBe(source);
  });

  it("inserts imports into a file with no existing imports", () => {
    const source = "x = 1\ny = 2\n";
    const result = mergeImports(source, [fromImport("os.path", "join")]);
    expect(result).toContain("from os.path import join");
  });
});
