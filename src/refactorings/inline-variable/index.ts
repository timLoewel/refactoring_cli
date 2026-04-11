import { Node, SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  EnumerateCandidate,
  PreconditionResult,
  RefactoringResult,
  SourceFileContext,
} from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";

export const inlineVariable = defineRefactoring<SourceFileContext>({
  name: "Inline Variable",
  kebabName: "inline-variable",
  tier: 1,
  description:
    "Replaces all references to a variable with its initializer expression and removes the declaration.",
  params: [param.file(), param.identifier("target", "Name of the variable to inline")],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;

    const decl = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);

    if (!decl) {
      errors.push(`Variable '${target}' not found in file`);
      return { ok: false, errors };
    }

    const varStmt = decl.getParent()?.getParent();
    if (varStmt && Node.isVariableStatement(varStmt) && varStmt.isExported()) {
      errors.push(
        `Variable '${target}' is exported and may be imported by other files. Inlining would remove this export.`,
      );
      return { ok: false, errors };
    }

    const initializer = decl.getInitializer();
    if (!initializer) {
      errors.push(`Variable '${target}' has no initializer and cannot be inlined`);
      return { ok: false, errors };
    }

    // Refuse to inline a variable that is reassigned after initialization.
    const nameNode = decl.getNameNode();
    if (Node.isIdentifier(nameNode)) {
      const refs = nameNode
        .findReferencesAsNodes()
        .filter((ref) => ref.getSourceFile() === sf && ref.getStart() !== nameNode.getStart());
      for (const ref of refs) {
        const parent = ref.getParent();
        if (
          parent &&
          Node.isBinaryExpression(parent) &&
          parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
          parent.getLeft() === ref
        ) {
          errors.push(
            `Variable '${target}' is reassigned after initialization and cannot be safely inlined`,
          );
          return { ok: false, errors };
        }
        // Also check compound assignments (+=, -=, etc.) and prefix/postfix update expressions
        if (
          parent &&
          Node.isBinaryExpression(parent) &&
          parent.getLeft() === ref
        ) {
          const opKind = parent.getOperatorToken().getKind();
          if (
            opKind === SyntaxKind.PlusEqualsToken ||
            opKind === SyntaxKind.MinusEqualsToken ||
            opKind === SyntaxKind.AsteriskEqualsToken ||
            opKind === SyntaxKind.SlashEqualsToken ||
            opKind === SyntaxKind.PercentEqualsToken ||
            opKind === SyntaxKind.AmpersandEqualsToken ||
            opKind === SyntaxKind.BarEqualsToken ||
            opKind === SyntaxKind.CaretEqualsToken ||
            opKind === SyntaxKind.LessThanLessThanEqualsToken ||
            opKind === SyntaxKind.GreaterThanGreaterThanEqualsToken ||
            opKind === SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken ||
            opKind === SyntaxKind.BarBarEqualsToken ||
            opKind === SyntaxKind.AmpersandAmpersandEqualsToken ||
            opKind === SyntaxKind.QuestionQuestionEqualsToken
          ) {
            errors.push(
              `Variable '${target}' is reassigned after initialization and cannot be safely inlined`,
            );
            return { ok: false, errors };
          }
        }
        if (
          parent &&
          (Node.isPrefixUnaryExpression(parent) || Node.isPostfixUnaryExpression(parent))
        ) {
          const opKind = parent.getOperatorToken();
          if (
            opKind === SyntaxKind.PlusPlusToken ||
            opKind === SyntaxKind.MinusMinusToken
          ) {
            errors.push(
              `Variable '${target}' is reassigned after initialization and cannot be safely inlined`,
            );
            return { ok: false, errors };
          }
        }
        // Check for mutation via method calls (e.g. arr.push(...), set.add(...)).
        // Inlining would replace each reference with a fresh literal, so mutations
        // would go to throwaway copies and later reads would see empty values.
        if (
          parent &&
          Node.isPropertyAccessExpression(parent) &&
          parent.getExpression() === ref
        ) {
          const methodName = parent.getName();
          const MUTATING_METHODS = new Set([
            "push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin",
            "add", "set", "delete", "clear",
          ]);
          if (MUTATING_METHODS.has(methodName)) {
            const grandparent = parent.getParent();
            if (grandparent && Node.isCallExpression(grandparent) && grandparent.getExpression() === parent) {
              errors.push(
                `Variable '${target}' is mutated via .${methodName}() and cannot be safely inlined`,
              );
              return { ok: false, errors };
            }
          }
        }
        // Check for element access mutation (e.g. arr[0] = ..., obj["key"] = ...)
        if (
          parent &&
          Node.isElementAccessExpression(parent) &&
          parent.getExpression() === ref
        ) {
          const grandparent = parent.getParent();
          if (
            grandparent &&
            Node.isBinaryExpression(grandparent) &&
            grandparent.getLeft() === parent &&
            grandparent.getOperatorToken().getKind() === SyntaxKind.EqualsToken
          ) {
            errors.push(
              `Variable '${target}' is mutated via element access assignment and cannot be safely inlined`,
            );
            return { ok: false, errors };
          }
        }
      }
    }

    // Refuse to inline when the declaration has a @ts-expect-error or @ts-ignore directive.
    // These directives suppress type errors on the initializer expression. Inlining would
    // move the expression to usage sites without the directive, surfacing the suppressed error.
    const varStmt2 = decl.getParent()?.getParent();
    if (varStmt2 && Node.isVariableStatement(varStmt2)) {
      const tsDirectiveRe = /^\s*\/\/\s*@ts-(expect-error|ignore)\b/;
      for (const comment of varStmt2.getLeadingCommentRanges()) {
        if (tsDirectiveRe.test(comment.getText())) {
          errors.push(
            `Variable '${target}' declaration has a @ts-expect-error or @ts-ignore directive. ` +
              `Inlining would remove the directive and expose the suppressed type error at usage sites.`,
          );
          return { ok: false, errors };
        }
      }
    }

    // Refuse to inline when the initializer references `this` and any usage site is
    // inside a function expression/declaration (non-arrow), where `this` would differ.
    const usesThis =
      initializer.getDescendantsOfKind(SyntaxKind.ThisKeyword).length > 0 ||
      initializer.getKind() === SyntaxKind.ThisKeyword;
    if (usesThis) {
      const nameNode = decl.getNameNode();
      const REBINDING_KINDS = new Set([
        SyntaxKind.FunctionExpression,
        SyntaxKind.FunctionDeclaration,
        SyntaxKind.MethodDeclaration,
        SyntaxKind.GetAccessor,
        SyntaxKind.SetAccessor,
        SyntaxKind.Constructor,
      ]);
      const refs = Node.isIdentifier(nameNode)
        ? nameNode
            .findReferencesAsNodes()
            .filter((ref) => ref.getSourceFile() === sf && ref.getStart() !== nameNode.getStart())
        : [];
      const declStart = decl.getStart();
      for (const ref of refs) {
        let ancestor = ref.getParent();
        while (ancestor) {
          if (ancestor.getStart() <= declStart) break;
          if (REBINDING_KINDS.has(ancestor.getKind())) {
            errors.push(
              `Variable '${target}' uses \`this\` but is referenced inside a function expression where \`this\` differs`,
            );
            return { ok: false, errors };
          }
          ancestor = ancestor.getParent();
        }
      }
    }

    // Refuse to inline when the initializer contains function expressions (non-arrow) that
    // use `this`. TypeScript infers the `this` type for object literal methods from the
    // variable's structural type. Inlining removes that context, causing `this` to become
    // `{}` and producing type errors (e.g. `Property 'x' does not exist on type '{}'`).
    const THIS_REBINDING_KINDS = new Set([
      SyntaxKind.FunctionExpression,
      SyntaxKind.FunctionDeclaration,
      SyntaxKind.MethodDeclaration,
      SyntaxKind.GetAccessor,
      SyntaxKind.SetAccessor,
    ]);
    for (const thisKw of initializer.getDescendantsOfKind(SyntaxKind.ThisKeyword)) {
      let ancestor: Node | undefined = thisKw.getParent();
      while (ancestor && ancestor !== initializer) {
        if (THIS_REBINDING_KINDS.has(ancestor.getKind())) {
          errors.push(
            `Variable '${target}' contains a function expression that uses \`this\`. ` +
              `Inlining would change TypeScript's type inference for the \`this\` binding.`,
          );
          return { ok: false, errors };
        }
        ancestor = ancestor.getParent();
      }
    }

    // Refuse to inline when the variable has a union type and is used for
    // discriminated-union narrowing (e.g. `if (x.kind === "foo") { x.fooOnly; }`).
    // TypeScript narrows the local variable inside the branch, but after inlining
    // the raw expression, the narrowing is lost and previously-valid property
    // accesses become type errors.
    const varType = decl.getType();
    if (varType.isUnion() && Node.isIdentifier(nameNode)) {
      const narrowRefs = nameNode
        .findReferencesAsNodes()
        .filter((ref) => ref.getSourceFile() === sf && ref.getStart() !== nameNode.getStart());

      for (const ref of narrowRefs) {
        const parent = ref.getParent();
        // Is this reference the object of a property access? (e.g. `effect.type`)
        if (
          !parent ||
          !Node.isPropertyAccessExpression(parent) ||
          parent.getExpression() !== ref
        )
          continue;

        // Walk up to find an if-statement or switch-statement whose condition contains this ref
        let ancestor: Node | undefined = parent;
        while (ancestor) {
          if (Node.isIfStatement(ancestor)) {
            const cond = ancestor.getExpression();
            if (ref.getStart() >= cond.getStart() && ref.getEnd() <= cond.getEnd()) {
              // Reference is in the if-condition — check if any other ref is in the body
              const bodyStart = ancestor.getThenStatement().getStart();
              const bodyEnd = ancestor.getEnd();
              if (
                narrowRefs.some(
                  (r) => r !== ref && r.getStart() >= bodyStart && r.getStart() < bodyEnd,
                )
              ) {
                errors.push(
                  `Variable '${target}' is used for discriminated-union narrowing in a ` +
                    `condition and cannot be safely inlined without breaking TypeScript's type narrowing.`,
                );
                return { ok: false, errors };
              }
            }
            break;
          }
          if (Node.isSwitchStatement(ancestor)) {
            const discrim = ancestor.getExpression();
            if (parent.getStart() >= discrim.getStart() && parent.getEnd() <= discrim.getEnd()) {
              const caseBlock = ancestor.getCaseBlock();
              if (
                narrowRefs.some(
                  (r) =>
                    r !== ref &&
                    r.getStart() >= caseBlock.getStart() &&
                    r.getStart() < caseBlock.getEnd(),
                )
              ) {
                errors.push(
                  `Variable '${target}' is used for discriminated-union narrowing in a ` +
                    `switch and cannot be safely inlined without breaking TypeScript's type narrowing.`,
                );
                return { ok: false, errors };
              }
            }
            break;
          }
          // Don't cross function boundaries
          if (
            Node.isFunctionDeclaration(ancestor) ||
            Node.isArrowFunction(ancestor) ||
            Node.isFunctionExpression(ancestor) ||
            Node.isMethodDeclaration(ancestor)
          )
            break;
          ancestor = ancestor.getParent();
        }
      }
    }

    // Reject when multiple declarations share the same name in the file.
    // The params {file, target} cannot disambiguate which one to inline,
    // so the result would be non-deterministic.
    const sameNameCount = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .filter((d) => d.getName() === target).length;
    if (sameNameCount > 1) {
      errors.push(
        `Multiple declarations of '${target}' found in file. Inline is ambiguous without positional context to disambiguate.`,
      );
      return { ok: false, errors };
    }

    // Refuse to inline a side-effect initializer (call/new expression) used more than once,
    // as that would change how many times the function is called.
    // Check both the initializer itself AND its descendants — getDescendantsOfKind
    // does not include the node itself.
    const initKind = initializer.getKind();
    const hasSideEffect =
      initKind === SyntaxKind.CallExpression ||
      initKind === SyntaxKind.NewExpression ||
      initKind === SyntaxKind.TaggedTemplateExpression ||
      initializer.getDescendantsOfKind(SyntaxKind.CallExpression).length > 0 ||
      initializer.getDescendantsOfKind(SyntaxKind.NewExpression).length > 0 ||
      initializer.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression).length > 0;
    if (hasSideEffect) {
      const nameNode = decl.getNameNode();
      const refCount = Node.isIdentifier(nameNode)
        ? nameNode
            .findReferencesAsNodes()
            .filter((ref) => ref.getSourceFile() === sf && ref.getStart() !== nameNode.getStart())
            .length
        : 0;
      if (refCount > 1) {
        errors.push(
          `Variable '${target}' has a side-effect initializer and is used ${refCount} times. ` +
            `Inlining would change how many times the function is called. ` +
            `Inline manually or ensure the initializer is pure.`,
        );
      }
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;

    const decl = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);

    if (!decl) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' not found`,
      };
    }

    const initializer = decl.getInitializer();
    if (!initializer) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' has no initializer`,
      };
    }

    const initText = initializer.getText();
    // Wrap in parens if initializer is a complex expression that could change
    // semantics when inlined into a surrounding expression (e.g. `a + b` inlined
    // into `sum * 2` would give `a + b * 2` without parens, or `await foo()` inlined
    // into `x.bar` would give `await foo().bar` instead of `(await foo()).bar`).
    const needsParens =
      Node.isBinaryExpression(initializer) ||
      Node.isConditionalExpression(initializer) ||
      Node.isAwaitExpression(initializer) ||
      Node.isYieldExpression(initializer) ||
      Node.isAsExpression(initializer) ||
      Node.isSpreadElement(initializer) ||
      initializer.getKind() === SyntaxKind.CommaToken;

    // When the variable has an explicit type annotation that *changes* the type,
    // preserve it via a type assertion so inlining doesn't lose type information
    // (e.g. `any` widening that suppresses type errors on the resulting expression).
    // However, when the annotation merely repeats the initializer's inferred type,
    // skip the assertion — it is redundant and defeats TypeScript's control-flow
    // narrowing (e.g. truthiness checks: `if (x) { x.prop }` — an `as T | undefined`
    // assertion prevents TypeScript from narrowing away `undefined` inside the block).
    const typeNode = decl.getTypeNode();
    const typeAnnotation = typeNode ? typeNode.getText() : null;
    let useTypeAssertion = false;
    if (typeAnnotation) {
      const declaredTypeText = decl.getType().getText(decl);
      const initTypeText = initializer.getType().getText(decl);
      useTypeAssertion = declaredTypeText !== initTypeText;
    }
    let inlineText: string;
    if (useTypeAssertion) {
      inlineText = `(${initText} as ${typeAnnotation})`;
    } else {
      inlineText = needsParens ? `(${initText})` : initText;
    }

    // Use TypeScript's symbol-based reference finder to correctly handle shadowed names
    // (e.g. a callback parameter with the same name as the outer variable).
    const nameNode = decl.getNameNode();
    const refs = Node.isIdentifier(nameNode)
      ? nameNode
          .findReferencesAsNodes()
          .filter((ref) => ref.getSourceFile() === sf && ref.getStart() !== nameNode.getStart())
      : [];
    const refPositions = refs.map((ref) => ref.getStart()).sort((a, b) => b - a); // reverse order so later replacements don't shift earlier positions

    // Replace references by re-finding each by position (stable across mutations)
    for (const pos of refPositions) {
      const id = sf.getDescendantAtPos(pos);
      if (id && Node.isIdentifier(id) && id.getText() === target) {
        id.replaceWithText(inlineText);
      }
    }

    // Re-find the declaration after mutations (original node may be stale)
    const freshDecl = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);
    if (freshDecl) {
      const list = freshDecl.getParent();
      if (list && Node.isVariableDeclarationList(list)) {
        const stmt = list.getParent();
        if (stmt && Node.isVariableStatement(stmt)) {
          // Remove TS directive comments (suppress-error, ignore) that would
          // become orphaned and cause compilation errors after removal.
          const tsDirectiveRe = /^\s*\/\/\s*@ts-(expect-error|ignore)\b/;
          for (const comment of stmt.getLeadingCommentRanges()) {
            if (tsDirectiveRe.test(comment.getText())) {
              const pos = comment.getPos();
              let end = comment.getEnd();
              const fullText = sf.getFullText();
              if (fullText[end] === "\n") end++;
              sf.replaceText([pos, end], "");
            }
          }
          // Re-find after possible text mutations from comment removal
          const freshStmt = sf
            .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
            .find((d) => d.getName() === target)
            ?.getParent()
            ?.getParent();
          if (freshStmt && Node.isVariableStatement(freshStmt)) {
            freshStmt.remove();
          }
        }
      }
    }

    // Remove named imports that are now unused (e.g. a type annotation import that was
    // only referenced in the removed declaration).
    // Build the set of names still used OUTSIDE of import declarations — identifiers
    // inside import specifiers must not count as "still used".
    const stillUsedNames = new Set<string>();
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      let insideImport = false;
      let ancestor: ReturnType<typeof id.getParent> = id.getParent();
      while (ancestor) {
        if (Node.isImportDeclaration(ancestor)) {
          insideImport = true;
          break;
        }
        const next = ancestor.getParent();
        if (!next) break;
        ancestor = next;
      }
      if (!insideImport) stillUsedNames.add(id.getText());
    }

    for (const importDecl of [...sf.getImportDeclarations()]) {
      let removedAny = false;
      for (const specifier of [...importDecl.getNamedImports()]) {
        const localName = specifier.getAliasNode()?.getText() ?? specifier.getNameNode().getText();
        if (!stillUsedNames.has(localName)) {
          specifier.remove();
          removedAny = true;
        }
      }
      // Only remove the entire import declaration if we actually removed specifiers from it
      // AND none remain — never remove side-effect imports (import "x") that we never touched.
      if (
        removedAny &&
        importDecl.getNamedImports().length === 0 &&
        !importDecl.getDefaultImport() &&
        !importDecl.getNamespaceImport()
      ) {
        importDecl.remove();
      }
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Inlined variable '${target}' with its initializer '${initText}'`,
    };
  },
  enumerate(project: Project): EnumerateCandidate[] {
    const candidates: EnumerateCandidate[] = [];
    for (const sf of project.getSourceFiles()) {
      const file = sf.getFilePath();

      // Count declarations per name so we can skip ambiguous targets
      const declCounts = new Map<string, number>();
      for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
        const name = decl.getName();
        if (name) declCounts.set(name, (declCounts.get(name) ?? 0) + 1);
      }

      const seen = new Set<string>();
      for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
        if (!decl.getInitializer()) continue;
        const varStmt = decl.getParent()?.getParent();
        if (varStmt && Node.isVariableStatement(varStmt) && varStmt.isExported()) continue;
        const name = decl.getName();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        if ((declCounts.get(name) ?? 0) > 1) continue;
        candidates.push({ file, target: name });
      }
    }
    return candidates;
  },
});
