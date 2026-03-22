#!/usr/bin/env node

import "../../refactorings/register-all.js"; // side-effect: populates registry
import { createProgram } from "./program.js";

const program = createProgram();
program.parse(process.argv);
