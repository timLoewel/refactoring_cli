#!/usr/bin/env node

import { registerAll } from "../refactorings/index.js";
import { createProgram } from "./program.js";

registerAll();

const program = createProgram();
program.parse(process.argv);
