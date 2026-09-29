package com.parallelcode.phone

import org.junit.Assert.assertEquals
import org.junit.Test

class AgentWidgetTest {
    private fun agent(id: String, attention: String, collapsed: Boolean = false) = RemoteAgent(
        agentId = id, taskId = id, taskName = id, running = true, exitCode = null, lastLine = "",
        projectName = null, agentName = null, attention = attention, isChat = false, collapsed = collapsed,
    )

    @Test
    fun countsAgentsThatNeedYouAndWorking() {
        val agents = listOf(agent("a", "needs_input"), agent("b", "active"), agent("c", "error", collapsed = true))
        assertEquals("1 need you · 1 working", widgetSummary(agents, emptyList(), connected = true).headline)
        assertEquals("1 needs you", widgetSummary(agents.take(1), emptyList(), connected = true).headline)
        assertEquals("Not connected", widgetSummary(agents, emptyList(), connected = false).headline)
    }

    @Test
    fun listsRemainingUsagePerProvider() {
        val usage = listOf(
            ProviderUsage("Claude", UsageWindow(22.0, null), UsageWindow(87.0, null), "ok", null),
            ProviderUsage("Codex", null, null, "ok", null),
        )
        assertEquals("Left:\nClaude      5h 78%  7d 13%", widgetSummary(emptyList(), usage, connected = true).usage)
    }
}
