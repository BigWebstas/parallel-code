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
import kotlin.math.abs

/** How opaque the widget's card is, in the stops the settings slider offers, opaque first. */
val WIDGET_TRANSPARENCY_STEPS = listOf(100, 75, 50, 25)

/** Snap [percent] to the nearest stop, so the slider and a hand-edited value always land on a card. */
fun widgetTransparencyStep(percent: Int): Int =
    WIDGET_TRANSPARENCY_STEPS.minByOrNull { abs(it - percent) } ?: WIDGET_TRANSPARENCY_STEPS.first()

/**
 * A card color, with text colors that stay readable on it. The card's fill and border are the
 * same color; the Light card carries a light grey border so its edge reads against white.
 */
data class WidgetPalette(
    val key: String,
    val label: String,
    /** The opaque card fill, so Settings can preview the card without loading a drawable. */
    val fill: Int,
    val title: Int,
    val headline: Int,
    val usage: Int,
    val updated: Int,
    /** The card shape at each transparency stop; RemoteViews sets a background by resource only. */
    val backgrounds: Map<Int, Int>,
) {
    /** The card shape at [percent] opacity, snapped to a stop. */
    fun background(percent: Int): Int = backgrounds.getValue(widgetTransparencyStep(percent))
}

val WIDGET_PALETTES = listOf(
    WidgetPalette(
        key = "obsidian",
        label = "Obsidian",
        fill = 0xFF1E1E1E.toInt(),
        title = 0xFFC4A77D.toInt(), // --accent
        headline = 0xFFEDEDED.toInt(), // --fg
        usage = 0xFFB5B5B5.toInt(), // --fg-muted
        updated = 0xFF919191.toInt(), // --fg-subtle
        backgrounds = mapOf(
            100 to R.drawable.widget_card_obsidian_100,
            75 to R.drawable.widget_card_obsidian_75,
            50 to R.drawable.widget_card_obsidian_50,
            25 to R.drawable.widget_card_obsidian_25,
        ),
    ),
    WidgetPalette(
        key = "slate",
        label = "Slate",
        fill = 0xFF3A3F44.toInt(),
        title = 0xFFD8C39B.toInt(),
        headline = 0xFFF2F4F5.toInt(),
        usage = 0xFFC4CACE.toInt(),
        updated = 0xFFA8AFB4.toInt(),
        backgrounds = mapOf(
            100 to R.drawable.widget_card_slate_100,
            75 to R.drawable.widget_card_slate_75,
            50 to R.drawable.widget_card_slate_50,
            25 to R.drawable.widget_card_slate_25,
        ),
    ),
    WidgetPalette(
        key = "light",
        label = "Light",
        fill = 0xFFFFFFFF.toInt(),
        title = 0xFF8A6433.toInt(), // the light theme's accent
        headline = 0xFF1F1F1F.toInt(),
        usage = 0xFF555555.toInt(),
        updated = 0xFF6E6E6E.toInt(),
        backgrounds = mapOf(
            100 to R.drawable.widget_card_light_100,
            75 to R.drawable.widget_card_light_75,
            50 to R.drawable.widget_card_light_50,
            25 to R.drawable.widget_card_light_25,
        ),
    ),
)

/** The palette for a stored [key], falling back to Obsidian for an unknown one. */
fun widgetPalette(key: String?): WidgetPalette =
    WIDGET_PALETTES.firstOrNull { it.key == key } ?: WIDGET_PALETTES.first()

/** The card shape for [key] at [percent] opacity. */
fun widgetBackground(key: String?, percent: Int): Int = widgetPalette(key).background(percent)

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
            refresh(context)
        }

        /** Redraw every placed widget, so a settings change shows without waiting for new data. */
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            render(context, manager, manager.getAppWidgetIds(ComponentName(context, AgentWidget::class.java)))
        }

        private fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
            if (ids.isEmpty()) return
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val settings = context.getSharedPreferences(SettingsStore.PREFS_NAME, Context.MODE_PRIVATE)
            val open = PendingIntent.getActivity(
                context,
                0,
                Intent(context, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val palette = widgetPalette(settings.getString(SettingsStore.KEY_WIDGET_PALETTE, null))
            val transparency = settings.getInt(SettingsStore.KEY_WIDGET_TRANSPARENCY, 100)
            val views = RemoteViews(context.packageName, R.layout.widget_agents).apply {
                setTextViewText(R.id.widget_headline, prefs.getString(KEY_HEADLINE, null) ?: "Open the app to connect")
                setTextViewText(R.id.widget_usage, prefs.getString(KEY_USAGE, null).orEmpty())
                setTextViewText(R.id.widget_updated, prefs.getString(KEY_UPDATED, null).orEmpty())
                // The card's color picks the text colors too, so a light card stays readable.
                setTextColor(R.id.widget_title, palette.title)
                setTextColor(R.id.widget_headline, palette.headline)
                setTextColor(R.id.widget_usage, palette.usage)
                setTextColor(R.id.widget_updated, palette.updated)
                setOnClickPendingIntent(R.id.widget_root, open)
                // RemoteViews can only set a background through the View setter it reflects on.
                setInt(R.id.widget_root, "setBackgroundResource", palette.background(transparency))
            }
            manager.updateAppWidget(ids, views)
        }
    }
}
