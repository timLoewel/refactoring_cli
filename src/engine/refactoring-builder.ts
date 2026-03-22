import type { ParamDefinition } from "./refactoring.types.js";

export interface ParamHelper {
  definition: ParamDefinition;
  validate: (raw: Record<string, unknown>) => unknown;
}

export function fileParam(name = "file", description = "Path to the TypeScript file"): ParamHelper {
  return {
    definition: { name, type: "string", description, required: true },
    validate(raw): unknown {
      const value = raw[name];
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`param '${name}' must be a non-empty string`);
      }
      return value;
    },
  };
}

export function stringParam(name: string, description: string, required = true): ParamHelper {
  return {
    definition: { name, type: "string", description, required },
    validate(raw): unknown {
      const value = raw[name];
      if (required) {
        if (typeof value !== "string" || value.trim() === "") {
          throw new Error(`param '${name}' must be a non-empty string`);
        }
      } else if (value !== undefined && typeof value !== "string") {
        throw new Error(`param '${name}' must be a string`);
      }
      return value;
    },
  };
}

export function identifierParam(name: string, description: string, required = true): ParamHelper {
  return {
    definition: { name, type: "string", description, required },
    validate(raw): unknown {
      const value = raw[name];
      if (required) {
        if (typeof value !== "string" || value.trim() === "") {
          throw new Error(`param '${name}' must be a non-empty string`);
        }
      } else if (value !== undefined && typeof value !== "string") {
        throw new Error(`param '${name}' must be a string`);
      }
      if (typeof value === "string" && !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)) {
        throw new Error(`param '${name}' must be a valid identifier`);
      }
      return value;
    },
  };
}

export function numberParam(name: string, description: string, required = true): ParamHelper {
  return {
    definition: { name, type: "number", description, required },
    validate(raw): unknown {
      const value = raw[name];
      if (required) {
        if (typeof value !== "number" || Number.isNaN(value)) {
          throw new Error(`param '${name}' must be a number`);
        }
      } else if (value !== undefined && (typeof value !== "number" || Number.isNaN(value))) {
        throw new Error(`param '${name}' must be a number`);
      }
      return value;
    },
  };
}
