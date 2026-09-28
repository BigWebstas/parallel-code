package com.parallelcode.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TerminalStyleTest {
    private fun sgr(body: String, from: Long = CellStyle.DEFAULT) = CellStyle.applySgr(from, body)

    @Test
    fun parsesBasicBrightAnd256Colors() {
        assertEquals(2, CellStyle.fg(sgr("32")))
        assertEquals(12, CellStyle.bg(sgr("104")))
        assertEquals(208, CellStyle.fg(sgr("38;5;208")))
        assertEquals(17, CellStyle.bg(sgr("48:5:17")))
    }

    @Test
    fun parsesTrueColorInBothForms() {
        val rgb = CellStyle.RGB_FLAG or 0x0a141e
        assertEquals(rgb, CellStyle.fg(sgr("38;2;10;20;30")))
        assertEquals(rgb, CellStyle.fg(sgr("38:2::10:20:30")))
        assertEquals(rgb, CellStyle.bg(sgr("48:2:10:20:30")))
        // Parameters after an extended color still apply.
        assertTrue(CellStyle.flags(sgr("38;2;10;20;30;1")) and CellStyle.BOLD != 0)
    }

    @Test
    fun resetsAndClearsAttributes() {
        val styled = sgr("1;3;4;7;31;42")
        assertEquals(CellStyle.DEFAULT, sgr("0", styled))
        assertEquals(CellStyle.DEFAULT, sgr("", styled))
        val cleared = sgr("22;23;24;27;39;49", styled)
        assertEquals(CellStyle.DEFAULT, cleared)
    }

    @Test
    fun resolvesThroughTheDesktopPalette() {
        val p = TerminalPalette.OBSIDIAN
        assertEquals(0xFFe08c96.toInt(), p.resolve(sgr("31")).foreground)
        // Bold basic colors brighten, as in xterm.js.
        assertEquals(0xFFeaa0aa.toInt(), p.resolve(sgr("1;31")).foreground)
        assertEquals(0xFFff8700.toInt(), p.resolve(sgr("38;5;208")).foreground)
        assertEquals(0xFF808080.toInt(), p.resolve(sgr("38;5;244")).foreground)
        assertNull(p.resolve(CellStyle.DEFAULT).background)
    }

    @Test
    fun inverseSwapsWithTheThemeDefaults() {
        val p = TerminalPalette.OBSIDIAN
        val s = p.resolve(sgr("7"))
        assertEquals(p.background, s.foreground)
        assertEquals(p.foreground, s.background)
    }
}
