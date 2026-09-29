package com.parallelcode.phone

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import androidx.core.content.edit
import java.time.LocalTime
import java.time.format.DateTimeFormatter

/** What the widget shows, worked out from the live agent list and usage snapshot. */
data class WidgetSummary(val headline: String, val usage: String)

fun widgetSummary(agents: List<RemoteAgent>, usage: List<ProviderUsage>, connected: Boolean): WidgetSummary {
    val live = agents.filter { !it.collapsed }
    val needInput = live.count { it.attention == "needs_input" || it.attention == "error" }
    val working = live.count { it.running && (it.attention == "active" || it.attention == "shell_busy") }
    val headline = when {
        !connected -> "Not connected"
        needInput > 0 && working > 0 -> "$needInput need you · $working working"
        needInput > 0 -> "$needInput need${if (needInput == 1) "s" else ""} you"
        working > 0 -> "$working working"
        live.isEmpty() -> "No agents running"
        else -> "All quiet"
    }
    val lines = usage.filter { it.hasSnapshot }.map { provider ->
        val windows = listOfNotNull(
            provider.fiveHour?.let { "5h ${it.remainingPercent}%" },
            provider.sevenDay?.let { "7d ${it.remainingPercent}%" },
        ).joinToString("  ")
        "${provider.label.padEnd(11)} $windows"
    }
    return WidgetSummary(headline, if (lines.isEmpty()) "" else "Left:\n" + lines.joinToString("\n"))
}

/**
 * Home-screen widget: agents that need you and the usage meters. The app pushes updates while its
 * connection is open (on screen, or in the background with notifications on); in between, the
 * widget shows the last update and its time.
 */
class AgentWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = render(context, manager, ids)

    companion object {
        private const val PREFS = "widget"
        private const val KEY_HEADLINE = "headline"
        private const val KEY_USAGE = "usage"
        private const val KEY_UPDATED = "updated"

        /** Store [summary] and redraw every placed widget. */
        fun publish(context: Context, summary: WidgetSummary) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (prefs.getString(KEY_HEADLINE, null) == summary.headline && prefs.getString(KEY_USAGE, null) == summary.usage) return
            prefs.edit {
                putString(KEY_HEADLINE, summary.headline)
                putString(KEY_USAGE, summary.usage)
                putString(KEY_UPDATED, LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm")))
            }
            val manager = AppWidgetManager.getInstance(context)
            render(context, manager, manager.getAppWidgetIds(ComponentName(context, AgentWidget::class.java)))
        }

        private fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
            if (ids.isEmpty()) return
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val open = PendingIntent.getActivity(
                context,
                0,
                Intent(context, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val views = RemoteViews(context.packageName, R.layout.widget_agents).apply {
                setTextViewText(R.id.widget_headline, prefs.getString(KEY_HEADLINE, null) ?: "Open the app to connect")
                setTextViewText(R.id.widget_usage, prefs.getString(KEY_USAGE, null).orEmpty())
                setTextViewText(R.id.widget_updated, prefs.getString(KEY_UPDATED, null).orEmpty())
                setOnClickPendingIntent(R.id.widget_root, open)
            }
            manager.updateAppWidget(ids, views)
        }
    }
}
