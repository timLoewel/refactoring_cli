import { watch, existsSync, type FSWatcher } from "node:fs";
import { resolve, relative, extname } from "node:path";
import type { Project, SourceFile } from "ts-morph";

const DEBOUNCE_MS = 100;

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

export interface FileWatcherOptions {
  project: Project;
  projectRoot: string;
  sourceFiles: string[];
}

type ChangeKind = "modify" | "create" | "delete";

interface PendingChange {
  kind: ChangeKind;
  absPath: string;
}

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private pending = new Map<string, PendingChange>();
  private debounceTimer: NodeJS.Timeout | null = null;
  private sourceFileSet: Set<string>;
  private recentlyRefreshed = new Set<string>();
  private recentlyRefreshedTimer: NodeJS.Timeout | null = null;

  private readonly project: Project;
  private readonly projectRoot: string;

  constructor(private readonly options: FileWatcherOptions) {
    this.project = options.project;
    this.projectRoot = options.projectRoot;
    this.sourceFileSet = new Set(options.sourceFiles);
  }

  get watching(): boolean {
    return this.watcher !== null;
  }

  get pendingRefresh(): boolean {
    return this.pending.size > 0;
  }

  get pendingFiles(): number {
    return this.pending.size;
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = watch(this.projectRoot, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      this.handleEvent(eventType, filename);
    });

    this.watcher.on("error", (err) => {
      process.stderr.write(`File watcher error: ${err.message}\n`);
      this.close();
    });
  }

  close(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.recentlyRefreshedTimer) {
      clearTimeout(this.recentlyRefreshedTimer);
      this.recentlyRefreshedTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.pending.clear();
    this.recentlyRefreshed.clear();
  }

  /**
   * Mark paths as already refreshed by apply. These will be ignored by the
   * watcher for a short window to avoid double-refresh race conditions.
   */
  skipPaths(paths: string[]): void {
    for (const p of paths) {
      this.pending.delete(p);
      this.recentlyRefreshed.add(p);
    }
    // Clear the recently-refreshed set after the debounce window + buffer
    if (this.recentlyRefreshedTimer) {
      clearTimeout(this.recentlyRefreshedTimer);
    }
    this.recentlyRefreshedTimer = setTimeout(() => {
      this.recentlyRefreshed.clear();
      this.recentlyRefreshedTimer = null;
    }, DEBOUNCE_MS * 3);
  }

  private handleEvent(_eventType: string, filename: string): void {
    const ext = extname(filename);
    if (!SOURCE_EXTENSIONS.has(ext)) return;

    const absPath = resolve(this.projectRoot, filename);

    // Skip files recently refreshed by apply
    if (this.recentlyRefreshed.has(absPath)) return;

    // Skip files in always-excluded directories
    const rel = relative(this.projectRoot, absPath);
    if (rel.startsWith("node_modules/") || rel.startsWith("dist/") || rel.startsWith("build/")) {
      return;
    }

    const exists = existsSync(absPath);
    const wasKnown =
      this.sourceFileSet.has(absPath) || this.project.getSourceFile(absPath) !== undefined;

    let kind: ChangeKind;
    if (!exists) {
      kind = "delete";
    } else if (wasKnown) {
      kind = "modify";
    } else {
      kind = "create";
    }

    this.pending.set(absPath, { kind, absPath });
    this.resetDebounce();
  }

  private resetDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, DEBOUNCE_MS);
  }

  private flush(): void {
    this.debounceTimer = null;
    const changes = Array.from(this.pending.values());
    this.pending.clear();

    for (const change of changes) {
      this.refreshTypeScript(change);
    }
  }

  private refreshTypeScript(change: PendingChange): void {
    const { kind, absPath } = change;

    if (kind === "delete") {
      const sf: SourceFile | undefined = this.project.getSourceFile(absPath);
      if (sf) {
        this.project.removeSourceFile(sf);
        this.sourceFileSet.delete(absPath);
      }
      return;
    }

    if (kind === "create") {
      if (!this.project.getSourceFile(absPath)) {
        try {
          this.project.addSourceFileAtPath(absPath);
          this.sourceFileSet.add(absPath);
        } catch {
          // File may not match tsconfig scope — that's fine
        }
      }
      return;
    }

    // kind === "modify"
    const sf = this.project.getSourceFile(absPath);
    if (sf) {
      sf.refreshFromFileSystem();
    }
  }
}
