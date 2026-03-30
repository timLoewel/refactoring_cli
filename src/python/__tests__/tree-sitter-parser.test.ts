import { parsePython, createPythonParser } from "../tree-sitter-parser.js";

describe("tree-sitter Python parser", () => {
  it("parses a simple Python file into an AST", async () => {
    const source = `
def greet(name: str) -> str:
    return f"Hello, {name}!"

x = greet("World")
print(x)
`.trim();

    const tree = await parsePython(source);
    const root = tree.rootNode;

    expect(root.type).toBe("module");
    expect(root.childCount).toBeGreaterThanOrEqual(3);

    const funcDef = root.children[0];
    expect(funcDef).toBeDefined();
    expect(funcDef?.type).toBe("function_definition");
    expect(funcDef?.childForFieldName("name")?.text).toBe("greet");

    const params = funcDef?.childForFieldName("parameters");
    expect(params).toBeTruthy();
    expect(params?.text).toContain("name: str");

    const returnType = funcDef?.childForFieldName("return_type");
    expect(returnType).toBeTruthy();
    expect(returnType?.text).toBe("str");

    tree.delete();
  });

  it("creates a reusable parser instance", async () => {
    const parser = await createPythonParser();

    const tree1 = parser.parse("x = 1");
    expect(tree1.rootNode.type).toBe("module");

    const tree2 = parser.parse("y = 2\nz = 3");
    expect(tree2.rootNode.type).toBe("module");
    expect(tree2.rootNode.childCount).toBe(2);

    tree1.delete();
    tree2.delete();
    parser.delete();
  });

  it("identifies Python-specific syntax nodes", async () => {
    const source = `
class Greeter:
    def __init__(self, name: str):
        self.name = name

    @property
    def greeting(self) -> str:
        return f"Hello, {self.name}"

items = [x * 2 for x in range(10) if x > 3]
`.trim();

    const tree = await parsePython(source);
    const root = tree.rootNode;

    const classDef = root.children[0];
    expect(classDef).toBeDefined();
    expect(classDef?.type).toBe("class_definition");
    expect(classDef?.childForFieldName("name")?.text).toBe("Greeter");

    const listComp = root.descendantsOfType("list_comprehension");
    expect(listComp.length).toBe(1);

    tree.delete();
  });
});
