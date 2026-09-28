package com.parallelcode.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TerminalScreenTest {
    private fun screen(cols: Int = 10, rows: Int = 3, data: String = "") =
        TerminalScreen().apply { reset(cols, rows, data.toByteArray()) }

    @Test
    fun appliesCursorMovementAndErase() {
        val s = screen(data = "hello\r\nworld\u001b[1;1Hj\u001b[2;3H\u001b[K")
        assertEquals("jello\nwo", s.text())
    }

    @Test
    fun dropsColorsAndTitles() {
        val s = screen(data = "\u001b]0;title\u0007\u001b[1;31mred\u001b[0m ok")
        assertEquals("red ok", s.text())
    }

    @Test
    fun scrollsFullLinesIntoHistory() {
        val s = screen(rows = 2, data = "1\r\n2\r\n3\r\n4")
        assertEquals("1\n2\n3\n4", s.text())
    }

    @Test
    fun wrapsOnlyWhenTheNextCharacterArrives() {
        val s = screen(cols = 3, data = "abc\r\nd")
        assertEquals("abc\nd", s.text())
        assertEquals("abc\nd", screen(cols = 3, data = "abcd").text())
    }

    @Test
    fun keepsScrollRegionRedrawsOutOfHistory() {
        // Status line pinned at the bottom; the region above scrolls.
        val s = screen(rows = 3, data = "\u001b[3;1Hstatus\u001b[1;2r\u001b[1;1Ha\r\nb\r\nc")
        assertEquals("b\nc\nstatus", s.text())
    }

    @Test
    fun restoresTheMainScreenAfterAFullScreenProgram() {
        val s = screen(data = "shell\u001b[?1049hvim stuff\u001b[?1049l")
        assertEquals("shell", s.text())
    }

    @Test
    fun decodesUtf8SplitAcrossChunks() {
        val s = screen()
        val bytes = "é✓".toByteArray()
        s.feed(bytes.copyOfRange(0, 1))
        s.feed(bytes.copyOfRange(1, bytes.size))
        assertEquals("é✓", s.text())
    }

    @Test
    fun tracksBracketedPasteMode() {
        val s = screen(data = "\u001b[?2004h")
        assertTrue(s.bracketedPaste)
        s.feed("\u001b[?2004l".toByteArray())
        assertEquals(false, s.bracketedPaste)
    }
}
