export interface CLIOutput<T> {
  success: boolean;
  command: string;
  data: T;
  errors?: string[];
  warnings?: string[];
}

export function successOutput<T>(command: string, data: T): CLIOutput<T> {
  return { success: true, command, data };
}

export function errorOutput(command: string, errors: string[]): CLIOutput<null> {
  return { success: false, command, data: null, errors };
}

export function printOutput<T>(output: CLIOutput<T>, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  } else if (output.success) {
    process.stdout.write(String(output.data) + "\n");
  } else {
    for (const err of output.errors ?? []) {
      process.stderr.write(`Error: ${err}\n`);
    }
  }
}
