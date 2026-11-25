import readline from 'node:readline';

/**
 * Reads a password from the terminal without echoing it.
 *
 * If ROSTER_PASSWORD is set it is used instead (handy for CI or scripts).
 * When stdin is not a terminal (for example Git Bash's mintty, or a pipe),
 * it falls back to reading plain lines and says once that typing is visible.
 */

let lineReader: { rl: readline.Interface; lines: AsyncIterableIterator<string> } | null = null;
let warned = false;

async function readPlainLine(question: string): Promise<string> {
  if (!warned) {
    process.stdout.write('(This terminal cannot hide typing, so the password will be visible.)\n');
    warned = true;
  }
  process.stdout.write(question);
  if (!lineReader) {
    // One reader for the whole run: a second one would miss lines the first has buffered.
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    lineReader = { rl, lines: rl[Symbol.asyncIterator]() };
  }
  const { value, done } = await lineReader.lines.next();
  if (done) throw new Error('No password was entered.');
  if (!process.stdin.isTTY) process.stdout.write('\n');
  return value;
}

/** Call when finished asking, so an open line reader doesn't keep the process alive. */
export function closePrompt(): void {
  lineReader?.rl.close();
  lineReader = null;
}

export async function askPassword(question: string): Promise<string> {
  const fromEnv = process.env.ROSTER_PASSWORD;
  if (fromEnv) return fromEnv;

  const stdin = process.stdin;
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') return readPlainLine(question);

  return new Promise<string>((resolve, reject) => {
    let pw = '';
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          finish();
          resolve(pw);
          return;
        }
        if (ch === '\u0003' || ch === '\u0004') {
          finish();
          reject(new Error('Cancelled.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          if (pw.length > 0) {
            pw = pw.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (ch < ' ') continue;
        pw += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}
