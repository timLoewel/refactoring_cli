### Requirement: Global installability via npm
The package SHALL be installable globally via `npm install -g refactoring-cli` and expose a `refactor` command.

#### Scenario: Global install and invoke
- **WHEN** a user runs `npm install -g refactoring-cli`
- **THEN** the `refactor` command is available in their PATH and `refactor --version` prints the current version

#### Scenario: npx usage without install
- **WHEN** a user runs `npx refactoring-cli list --json`
- **THEN** the command executes and returns the list of refactorings

### Requirement: Package ships only compiled output
The published package SHALL contain only the `dist/` directory and package metadata files.

#### Scenario: npm pack contents
- **WHEN** `npm pack --dry-run` is run after build
- **THEN** only files under `dist/`, `package.json`, `README.md`, and `LICENSE` are included

### Requirement: Build before publish
The package SHALL automatically build before publishing via a `prepublishOnly` script.

#### Scenario: Publish without manual build
- **WHEN** `npm publish` is run without a prior `npm run build`
- **THEN** the `prepublishOnly` hook runs the build automatically before publishing

### Requirement: Build-time version generation
The CLI version SHALL be derived from `package.json` at build time via a `prebuild` script that generates `src/core/cli/version.ts`.

#### Scenario: Version matches package.json
- **WHEN** the project is built after `npm version patch`
- **THEN** `refactor --version` outputs the same version as `package.json`

#### Scenario: Generated file is not committed
- **WHEN** a contributor checks git status after building
- **THEN** `src/core/cli/version.ts` does not appear as a modified or untracked file

### Requirement: Repository metadata
The package SHALL include `repository`, `homepage`, and `bugs` fields in package.json.

#### Scenario: npm registry page links
- **WHEN** the package is viewed on npmjs.com
- **THEN** the repository, homepage, and issues links point to the GitHub repo
