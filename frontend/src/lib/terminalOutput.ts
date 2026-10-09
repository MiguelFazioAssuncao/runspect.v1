// Program output is replayed from the current frame; completion belongs only
// to the last frame. Errors/statuses never reveal stdout from future steps.
export function terminalOutput(stdout: string, status: string, completed: boolean): string {
  if (!stdout) return completed ? status : 'Execução pronta. Avance os passos ou pressione Play.';
  if (!completed) return stdout;
  return `${stdout}${stdout.endsWith('\n') ? '' : '\n'}\n${status}`;
}
