import { render } from 'solid-js/web';
import type { Terminal } from '@xterm/xterm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC } from '../../electron/ipc/channels';
import { TerminalView } from './TerminalView';

const { terminals } = vi.hoisted(() => ({ terminals: [] as Terminal[] }));

vi.mock('../lib/terminalFitManager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/terminalFitManager')>();
  return {
    ...actual,
    registerTerminal: (...args: Parameters<typeof actual.registerTerminal>) => {
      terminals.push(args[3]);
      actual.registerTerminal(...args);
    },
  };
});

type ChannelListener = (msg: unknown) => void;

let invoke: ReturnType<typeof vi.fn>;
let channelListeners: ChannelListener[];
let resolveSpawn: () => void;
const disposers: Array<() => void> = [];

beforeEach(() => {
  // happy-dom has no canvas; xterm's DOM renderer only measures glyph widths.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: () => ({ width: 8 }),
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal('OffscreenCanvas', undefined);
  channelListeners = [];
  invoke = vi.fn((cmd: string) => {
    if (cmd !== IPC.SpawnAgent) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      resolveSpawn = () => resolve({ canvasTools: false });
    });
  });
  vi.stubGlobal('electron', {
    ipcRenderer: {
      invoke,
      on: (_channel: string, listener: ChannelListener) => {
        channelListeners.push(listener);
        return () => undefined;
      },
    },
  });
});

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  document.body.replaceChildren();
  terminals.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mountTerminal(onData?: (data: Uint8Array) => void): Terminal {
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(
    render(
      () => (
        <TerminalView
          taskId="task-1"
          agentId="agent-1"
          command="codex"
          args={[]}
          cwd="/tmp"
          isShell
          onData={onData}
        />
      ),
      host,
    ),
  );
  const term = terminals.at(-1);
  if (!term) throw new Error('TerminalView did not register a terminal');
  return term;
}

function writesToAgent(): unknown[] {
  return invoke.mock.calls.filter(([cmd]) => cmd === IPC.WriteToAgent).map(([, args]) => args);
}

describe('TerminalView', () => {
  it('holds input until the agent has spawned', async () => {
    const term = mountTerminal();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith(IPC.SpawnAgent, expect.anything()));

    term.input('hi');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(writesToAgent()).toEqual([]);

    resolveSpawn();
    await vi.waitFor(() =>
      expect(writesToAgent()).toEqual([expect.objectContaining({ data: 'hi' })]),
    );
  });

  it('flushes output when animation frames never arrive', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const onData = vi.fn();
    mountTerminal(onData);
    await vi.waitFor(() => expect(channelListeners.length).toBeGreaterThan(0));

    for (const listener of channelListeners)
      listener({ type: 'Data', data: new TextEncoder().encode('ready') });

    await vi.waitFor(() => expect(onData).toHaveBeenCalled());
  });

  it('copies a finished mouse selection to the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const term = mountTerminal();
    term.write('hello world');
    await new Promise((resolve) => term.write('', () => resolve(undefined)));

    term.element?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    term.select(0, 0, 5);
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));

    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('pastes the clipboard on right-click', async () => {
    invoke.mockImplementation((cmd: string) =>
      Promise.resolve(
        cmd === IPC.ResolveClipboardPaste ? { kind: 'text', text: 'pasted' } : undefined,
      ),
    );
    const term = mountTerminal();
    const paste = vi.spyOn(term, 'paste');

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    term.element?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(paste).toHaveBeenCalledWith('pasted'));
  });
});
