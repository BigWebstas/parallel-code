package com.parallelcode.phone

import org.junit.Assert.assertEquals
import org.junit.Test

class DisplayFrameRateTest {
    @Test
    fun `selects highest refresh rate matching current physical resolution`() {
        val current = DisplayModeSpec(modeId = 1, physicalWidth = 1080, physicalHeight = 2400, refreshRate = 60f)
        val supported = listOf(
            current,
            DisplayModeSpec(modeId = 2, physicalWidth = 1080, physicalHeight = 2400, refreshRate = 90f),
            DisplayModeSpec(modeId = 3, physicalWidth = 1080, physicalHeight = 2400, refreshRate = 120f),
        )
        assertEquals(supported[2], selectHighRefreshMode(current, supported))
    }

    @Test
    fun `ignores higher refresh rate modes with different physical resolution`() {
        val current = DisplayModeSpec(modeId = 1, physicalWidth = 1440, physicalHeight = 3200, refreshRate = 60f)
        val supported = listOf(
            current,
            DisplayModeSpec(modeId = 2, physicalWidth = 1080, physicalHeight = 2400, refreshRate = 144f),
            DisplayModeSpec(modeId = 3, physicalWidth = 1440, physicalHeight = 3200, refreshRate = 120f),
        )
        assertEquals(supported[2], selectHighRefreshMode(current, supported))
    }

    @Test
    fun `keeps current mode when another mode has the same refresh rate`() {
        val current = DisplayModeSpec(modeId = 2, physicalWidth = 1080, physicalHeight = 2400, refreshRate = 120f)
        val supported = listOf(
            DisplayModeSpec(modeId = 1, physicalWidth = 1080, physicalHeight = 2400, refreshRate = 120.005f),
            current,
        )
        assertEquals(current, selectHighRefreshMode(current, supported))
    }
}
