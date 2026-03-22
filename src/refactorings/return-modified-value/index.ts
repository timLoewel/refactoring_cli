import { Node, SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

export interface ReturnModifiedValueParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    {
      name: "file",
      type: "string",
      description: "Path to the TypeScript file",
      required: true,
    },
    {
      name: "target",
      type: "string",
      description: "Name of the function that mutates a parameter to be changed to return it",
      required: true,
    },
  ],
  validate(raw: unknown): ReturnModifiedValueParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
    };
  },
};

function preconditions(project: Project, p: ReturnModifiedValueParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const funcDecl = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((d) => d.getName() === p.target);

  if (!funcDecl) {
    errors.push(`Function '${p.target}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const paramList = funcDecl.getParameters();
  if (paramList.length === 0) {
    errors.push(`Function '${p.target}' has no parameters to return`);
  }

  const body = funcDecl.getBody();
  if (!body) {
    errors.push(`Function '${p.target}' has no body`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ReturnModifiedValueParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return {
      success: false,
      filesChanged: [],
      description: `File not found: ${p.file}`,
    };
  }

  const funcDecl = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((d) => d.getName() === p.target);

  if (!funcDecl) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' not found`,
    };
  }

  const parameters = funcDecl.getParameters();
  if (parameters.length === 0) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' has no parameters`,
    };
  }

  // Use the first parameter as the one being mutated and returned
  const firstParam = parameters[0];
  if (!firstParam) {
    return {
      success: false,
      filesChanged: [],
      description: `Could not access first parameter of '${p.target}'`,
    };
  }

  const paramName = firstParam.getName();

  const body = funcDecl.getBody();
  if (!body || !Node.isBlock(body)) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' has no block body`,
    };
  }

  // Add return statement at end of function body
  body.addStatements(`return ${paramName};`);

  // Update the function's return type annotation if it was void or absent
  const existingReturnType = funcDecl.getReturnTypeNode();
  if (!existingReturnType) {
    // Infer the param type text if available
    const paramTypeNode = firstParam.getTypeNode();
    const returnTypeText = paramTypeNode ? paramTypeNode.getText() : "unknown";
    funcDecl.setReturnType(returnTypeText);
  } else if (existingReturnType.getText() === "void") {
    const paramTypeNode = firstParam.getTypeNode();
    const returnTypeText = paramTypeNode ? paramTypeNode.getText() : "unknown";
    funcDecl.setReturnType(returnTypeText);
  }

  // Update call sites: wrap existing call expression with assignment
  // Find all call expressions to this function in the file
  const callExprs = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const expr = call.getExpression();
    return Node.isIdentifier(expr) && expr.getText() === p.target;
  });

  // For each call site that is a standalone ExpressionStatement, update the
  // first argument variable to capture the return value.
  for (const call of callExprs) {
    const callParent = call.getParent();
    if (!callParent || !Node.isExpressionStatement(callParent)) {
      continue;
    }

    const callArgs = call.getArguments();
    const firstArg = callArgs[0];
    if (!firstArg) {
      continue;
    }

    const argText = firstArg.getText();
    callParent.replaceWithText(
      `${argText} = ${p.target}(${callArgs.map((a) => a.getText()).join(", ")});`,
    );
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Changed '${p.target}' to return its mutated parameter '${paramName}' and updated call sites`,
  };
}

export const returnModifiedValue: RefactoringDefinition = {
  name: "Return Modified Value",
  kebabName: "return-modified-value",
  description:
    "Changes a function that mutates a parameter to instead return the modified value, and updates call sites to capture the return.",
  tier: 1,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReturnModifiedValueParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReturnModifiedValueParams),
};
