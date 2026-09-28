package com.parallelcode.phone

import java.nio.ByteBuffer
import java.nio.CharBuffer
import java.nio.charset.CodingErrorAction

/**
 * Plain-text VT100 screen for an agent's PTY stream. Agent TUIs redraw with cursor movement, so
 * stripping escape codes would garble them; this keeps a character grid and applies the movement,
 * erase and scroll sequences they use. Colors and styles are dropped.
 */
class TerminalScreen(cols: Int = 80, rows: Int = 24) {
    var cols = cols
        private set
    var rows = rows
        private set

    /** Set by the program (`CSI ? 2004 h`); multi-line replies must then be wrapped as a paste. */
    var bracketedPaste = false
        private set

    private var grid = blankGrid()
    private var savedMainGrid: Array<CharArray>? = null
    private val history = ArrayDeque<String>()
    private var row = 0
    private var col = 0
    private var wrapPending = false
    private var scrollTop = 0
    private var scrollBottom = rows - 1
    private var savedRow = 0
    private var savedCol = 0

    private var state = State.GROUND
    private val sequence = StringBuilder()
    private val decoder = Charsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPLACE)
        .onUnmappableCharacter(CodingErrorAction.REPLACE)
    private var undecoded = ByteArray(0)

    private enum class State { GROUND, ESCAPE, ESCAPE_CHARSET, CSI, STRING, STRING_ESCAPE }

    /** Replace everything with a server scrollback snapshot. */
    fun reset(cols: Int, rows: Int, data: ByteArray) {
        this.cols = cols.coerceIn(1, 500)
        this.rows = rows.coerceIn(1, 300)
        grid = blankGrid()
        savedMainGrid = null
        history.clear()
        row = 0
        col = 0
        wrapPending = false
        scrollTop = 0
        scrollBottom = this.rows - 1
        savedRow = 0
        savedCol = 0
        bracketedPaste = false
        state = State.GROUND
        sequence.clear()
        decoder.reset()
        undecoded = ByteArray(0)
        feed(data)
    }

    fun feed(data: ByteArray) {
        // A multi-byte character can be split across chunks; carry the tail to the next call.
        val input = ByteBuffer.wrap(undecoded + data)
        val out = CharBuffer.allocate(input.remaining() + 1)
        decoder.decode(input, out, false)
        undecoded = ByteArray(input.remaining()).also { input.get(it) }
        out.flip()
        while (out.hasRemaining()) process(out.get())
    }

    /** Scrolled-off history followed by the screen, without trailing blank lines. */
    fun text(): String {
        val lines = ArrayList<String>(history.size + rows)
        lines.addAll(history)
        grid.mapTo(lines) { String(it).trimEnd() }
        while (lines.isNotEmpty() && lines.last().isEmpty()) lines.removeAt(lines.lastIndex)
        return lines.joinToString("\n")
    }

    private fun blankGrid() = Array(rows) { blankLine() }

    private fun blankLine() = CharArray(cols) { ' ' }

    private fun process(c: Char) {
        when (state) {
            State.GROUND -> ground(c)
            State.ESCAPE -> escape(c)
            State.ESCAPE_CHARSET -> state = State.GROUND
            State.CSI -> {
                if (c in '@'..'~') {
                    state = State.GROUND
                    csi(sequence.toString(), c)
                } else if (sequence.length < 64) {
                    sequence.append(c)
                }
            }
            // OSC, DCS and similar strings end with BEL or ESC \; nothing in them is shown.
            State.STRING -> when (c) {
                '\u0007' -> state = State.GROUND
                '\u001b' -> state = State.STRING_ESCAPE
            }
            State.STRING_ESCAPE -> state = if (c == '\\') State.GROUND else State.STRING
        }
    }

    private fun ground(c: Char) {
        when (c) {
            '\u001b' -> state = State.ESCAPE
            '\r' -> carriageReturn()
            '\n', '\u000b', '\u000c' -> lineFeed()
            '\b' -> {
                wrapPending = false
                if (col > 0) col--
            }
            '\t' -> {
                wrapPending = false
                col = minOf(cols - 1, (col / 8 + 1) * 8)
            }
            else -> if (c >= ' ' && c != '\u007f') put(c)
        }
    }

    private fun escape(c: Char) {
        state = State.GROUND
        when (c) {
            '[' -> {
                sequence.clear()
                state = State.CSI
            }
            ']', 'P', '_', '^', 'X' -> state = State.STRING
            '(', ')', '*', '+', '#', '%' -> state = State.ESCAPE_CHARSET
            '7' -> saveCursor()
            '8' -> restoreCursor()
            'D' -> lineFeed()
            'E' -> {
                carriageReturn()
                lineFeed()
            }
            'M' -> reverseIndex()
            'c' -> reset(cols, rows, ByteArray(0))
        }
    }

    private fun put(c: Char) {
        if (wrapPending) {
            carriageReturn()
            lineFeed()
        }
        grid[row][col] = c
        if (col == cols - 1) wrapPending = true else col++
    }

    private fun carriageReturn() {
        col = 0
        wrapPending = false
    }

    private fun lineFeed() {
        wrapPending = false
        if (row == scrollBottom) scrollUp(1) else if (row < rows - 1) row++
    }

    private fun reverseIndex() {
        wrapPending = false
        if (row == scrollTop) scrollDown(1) else if (row > 0) row--
    }

    private fun scrollUp(n: Int) {
        repeat(n.coerceAtMost(scrollBottom - scrollTop + 1)) {
            // Only full-screen scrolls of the main screen move lines into history.
            if (scrollTop == 0 && scrollBottom == rows - 1 && savedMainGrid == null) {
                history.addLast(String(grid[0]).trimEnd())
                if (history.size > MAX_HISTORY) history.removeFirst()
            }
            for (r in scrollTop until scrollBottom) grid[r] = grid[r + 1]
            grid[scrollBottom] = blankLine()
        }
    }

    private fun scrollDown(n: Int) {
        repeat(n.coerceAtMost(scrollBottom - scrollTop + 1)) {
            for (r in scrollBottom downTo scrollTop + 1) grid[r] = grid[r - 1]
            grid[scrollTop] = blankLine()
        }
    }

    private fun saveCursor() {
        savedRow = row
        savedCol = col
    }

    private fun restoreCursor() {
        moveTo(savedRow, savedCol)
    }

    private fun moveTo(r: Int, c: Int) {
        row = r.coerceIn(0, rows - 1)
        col = c.coerceIn(0, cols - 1)
        wrapPending = false
    }

    private fun csi(body: String, final: Char) {
        val private = body.startsWith('?')
        val params = body.trimStart('?', '>', '<', '=')
            .takeWhile { it.isDigit() || it == ';' }
            .split(';')
            .map { it.toIntOrNull() ?: 0 }
        fun arg(i: Int, default: Int = 1) = params.getOrNull(i)?.takeIf { it != 0 } ?: default
        fun rawArg(i: Int) = params.getOrNull(i) ?: 0

        if (private) {
            if (final == 'h' || final == 'l') params.forEach { setMode(it, final == 'h') }
            return
        }
        when (final) {
            'A' -> moveTo(maxOf(row - arg(0), if (row >= scrollTop) scrollTop else 0), col)
            'B' -> moveTo(minOf(row + arg(0), if (row <= scrollBottom) scrollBottom else rows - 1), col)
            'C' -> moveTo(row, col + arg(0))
            'D' -> moveTo(row, col - arg(0))
            'E' -> moveTo(row + arg(0), 0)
            'F' -> moveTo(row - arg(0), 0)
            'G', '`' -> moveTo(row, arg(0) - 1)
            'd' -> moveTo(arg(0) - 1, col)
            'H', 'f' -> moveTo(arg(0) - 1, arg(1) - 1)
            'J' -> eraseInDisplay(rawArg(0))
            'K' -> eraseInLine(rawArg(0))
            'L' -> if (row in scrollTop..scrollBottom) insertLines(arg(0))
            'M' -> if (row in scrollTop..scrollBottom) deleteLines(arg(0))
            '@' -> {
                val line = grid[row]
                val n = arg(0).coerceAtMost(cols - col)
                for (c in cols - 1 downTo col + n) line[c] = line[c - n]
                line.fill(' ', col, col + n)
            }
            'P' -> {
                val line = grid[row]
                val n = arg(0).coerceAtMost(cols - col)
                for (c in col until cols - n) line[c] = line[c + n]
                line.fill(' ', cols - n, cols)
            }
            'X' -> grid[row].fill(' ', col, minOf(cols, col + arg(0)))
            'S' -> scrollUp(arg(0))
            'T' -> scrollDown(arg(0))
            'r' -> {
                val top = arg(0) - 1
                val bottom = arg(1, rows) - 1
                if (top < bottom && bottom < rows) {
                    scrollTop = top
                    scrollBottom = bottom
                    moveTo(0, 0)
                }
            }
            's' -> saveCursor()
            'u' -> restoreCursor()
        }
    }

    private fun setMode(mode: Int, on: Boolean) {
        when (mode) {
            2004 -> bracketedPaste = on
            47, 1047, 1049 -> {
                if (on && savedMainGrid == null) {
                    if (mode == 1049) saveCursor()
                    savedMainGrid = grid
                    grid = blankGrid()
                } else if (!on) {
                    savedMainGrid?.let { grid = it }
                    savedMainGrid = null
                    if (mode == 1049) restoreCursor()
                }
            }
        }
    }

    private fun eraseInDisplay(mode: Int) {
        when (mode) {
            0 -> {
                eraseInLine(0)
                for (r in row + 1 until rows) grid[r] = blankLine()
            }
            1 -> {
                eraseInLine(1)
                for (r in 0 until row) grid[r] = blankLine()
            }
            2 -> grid = blankGrid()
            3 -> history.clear()
        }
    }

    private fun eraseInLine(mode: Int) {
        val line = grid[row]
        when (mode) {
            0 -> line.fill(' ', col, cols)
            1 -> line.fill(' ', 0, col + 1)
            2 -> line.fill(' ')
        }
    }

    private fun insertLines(n: Int) {
        repeat(n.coerceAtMost(scrollBottom - row + 1)) {
            for (r in scrollBottom downTo row + 1) grid[r] = grid[r - 1]
            grid[row] = blankLine()
        }
        col = 0
    }

    private fun deleteLines(n: Int) {
        repeat(n.coerceAtMost(scrollBottom - row + 1)) {
            for (r in row until scrollBottom) grid[r] = grid[r + 1]
            grid[scrollBottom] = blankLine()
        }
        col = 0
    }

    private companion object {
        const val MAX_HISTORY = 2000
    }
}
