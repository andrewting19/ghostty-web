import { describe, expect, test } from 'bun:test';
import { createIsolatedTerminal } from './test-helpers';

const ESC = '\x1b';

function generateStressOutput(): Uint8Array {
  const lines: string[] = [];

  lines.push(`${ESC}[1m${'═'.repeat(80)}${ESC}[0m`);
  lines.push('');
  lines.push(`${ESC}[1m── COLORS ──${ESC}[0m`);
  for (let row = 0; row < 8; row++) {
    let line = '';
    for (let i = 0; i < 32; i++) {
      line += `${ESC}[48;5;${row * 32 + i}m  ${ESC}[0m`;
    }
    lines.push(line);
  }

  lines.push(`${ESC}[1m── GRADIENTS ──${ESC}[0m`);
  for (let row = 0; row < 6; row++) {
    let line = '';
    for (let i = 0; i < 80; i++) {
      const r = Math.floor(Math.sin(i * 0.08 + row) * 127 + 128);
      const g = Math.floor(Math.sin(i * 0.08 + row + 2) * 127 + 128);
      const b = Math.floor(Math.sin(i * 0.08 + row + 4) * 127 + 128);
      line += `${ESC}[48;2;${r};${g};${b}m ${ESC}[0m`;
    }
    lines.push(line);
  }

  lines.push(`${ESC}[1m── UNICODE ──${ESC}[0m`);
  lines.push('  ┌──────────┬──────────┐');
  lines.push('  │  Cell A   │  Cell B   │');
  lines.push('  ├──────────┼──────────┤');
  lines.push('  │  Cell C   │  Cell D   │');
  lines.push('  └──────────┴──────────┘');

  for (let section = 0; section < 4; section++) {
    lines.push(`${ESC}[1m── SECTION ${section + 5} ──${ESC}[0m`);
    for (let row = 0; row < 8; row++) {
      let line = '  ';
      for (let i = 0; i < 60; i++) {
        line += `${ESC}[38;5;${(section * 64 + row * 8 + i) % 256}m*${ESC}[0m`;
      }
      lines.push(line);
    }
  }

  lines.push('');
  lines.push('═'.repeat(80));
  lines.push('  ✓ Test complete');
  lines.push('═'.repeat(80));
  lines.push('');

  return new TextEncoder().encode(lines.join('\r\n') + '\r\n');
}

function getViewportRows(term: Awaited<ReturnType<typeof createIsolatedTerminal>>): string[] {
  const viewport = term.wasmTerm!.getViewport();
  const rows: string[] = [];

  for (let row = 0; row < term.rows; row++) {
    let text = '';
    for (let col = 0; col < term.cols; col++) {
      const cell = viewport[row * term.cols + col];
      if (cell.width === 0) continue;
      text += cell.codepoint > 32 ? String.fromCodePoint(cell.codepoint) : ' ';
    }
    rows.push(text.trimEnd());
  }

  return rows;
}

describe('Viewport and scrollback regressions', () => {
  const data = generateStressOutput();

  test('scrollback length does not drop while repeated writes accumulate history', async () => {
    const term = await createIsolatedTerminal({ cols: 160, rows: 39, scrollback: 10000 });
    const container = document.createElement('div');
    term.open(container);

    const lengths: number[] = [];
    for (let rep = 0; rep < 12; rep++) {
      term.write(data);
      term.wasmTerm!.update();
      lengths.push(term.wasmTerm!.getScrollbackLength());
    }

    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1]);
    }

    term.dispose();
  });

  test('viewport text stays stable across repeated writes at cols=130', async () => {
    const term = await createIsolatedTerminal({ cols: 130, rows: 39, scrollback: 10000 });
    const container = document.createElement('div');
    term.open(container);

    let baseline: string[] | null = null;
    for (let rep = 0; rep < 12; rep++) {
      term.write(data);
      term.wasmTerm!.update();
      const rows = getViewportRows(term);
      if (!baseline) {
        baseline = rows;
        continue;
      }

      let diffRows = 0;
      for (let i = 0; i < rows.length; i++) {
        if ((rows[i] || '') !== (baseline[i] || '')) diffRows++;
      }
      expect(diffRows).toBeLessThanOrEqual(1);
    }

    term.dispose();
  });
});
