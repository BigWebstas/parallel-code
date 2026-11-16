package com.parallelcode.phone

import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.widget.RemoteViews
import androidx.core.content.edit
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
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

/**
 * The widget cards draw in RemoteViews, which cannot read the app's Compose theme,
 * so their colors are listed here rather than taken from the active look. The
 * Obsidian card and the Light card do mirror the matching look presets
 * ([LookPresets]); `LookPalettesTest` keeps them equal, so recoloring a preset
 * cannot quietly leave the widget behind.
 */
val WIDGET_PALETTES = listOf(
    WidgetPalette(
        key = "obsidian",
        label = "Obsidian",
        fill = 0xFF1E1E1E.toInt(), // --island-bg
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
        fill = 0xFFFFFFFF.toInt(), // --island-bg
        title = 0xFF8A6433.toInt(), // --accent
        headline = 0xFF1F1F1F.toInt(), // --fg
        usage = 0xFF555555.toInt(), // --fg-muted
        updated = 0xFF6E6E6E.toInt(), // --fg-subtle
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

/** The status dot's color: what most needs the user right now. */
enum class WidgetTone(val color: Int) {
    OFFLINE(0xFFD9645B.toInt()),
    ATTENTION(0xFFE0A84E.toInt()),
    WORKING(0xFF5FBF77.toInt()),
    QUIET(0xFF8A8A8A.toInt()),
}

/** One computer's usage meters, under its [label]; the label is null when only one computer is counted. */
data class UsageSection(val label: String?, val lines: List<String>)

/** What the widget shows, worked out from the live agent list and usage snapshot. */
data class WidgetSummary(
    val headline: String,
    val usage: List<UsageSection>,
    val tone: WidgetTone = WidgetTone.QUIET,
)

/**
 * [active] is the computer in use, its agents counted only while [connected]; [others] are the other
 * saved computers that answered. With more than one computer counted, the headline sums them all and
 * says how many, e.g. "3 working · 2 computers", and the usage meters sit under each computer's label.
 */
fun widgetSummary(
    active: ComputerSnapshot,
    connected: Boolean,
    others: List<ComputerSnapshot> = emptyList(),
): WidgetSummary {
    val computers = (if (connected) listOf(active) else emptyList()) + others
    val live = computers.flatMap { it.agents }.filter { !it.collapsed }
    val needInput = live.count { it.attention == "needs_input" || it.attention == "error" }
    val working = live.count { it.running && (it.attention == "active" || it.attention == "shell_busy") }
    // Idle is every shown agent that is neither waiting on the user nor working (idle, ready, review).
    val idle = live.size - needInput - working
    val counts = listOfNotNull(
        working.takeIf { it > 0 }?.let { "$it working" },
        idle.takeIf { it > 0 }?.let { "$it idle" },
    )
    val status = when {
        computers.isEmpty() -> "Not connected"
        live.isEmpty() -> "No agents running"
        // "1 needs you" alone, but "1 need you · 2 working" in a list.
        needInput > 0 -> (listOf("$needInput need${if (needInput == 1 && counts.isEmpty()) "s" else ""} you") + counts)
            .joinToString(" · ")
        else -> counts.joinToString(" · ")
    }
    val headline = if (computers.size > 1) "$status · ${computers.size} computers" else status
    val tone = when {
        computers.isEmpty() -> WidgetTone.OFFLINE
        needInput > 0 -> WidgetTone.ATTENTION
        working > 0 -> WidgetTone.WORKING
        else -> WidgetTone.QUIET
    }
    // The last snapshot of the computer in use still shows while disconnected, as before.
    val labelled = others.isNotEmpty()
    val usage = (listOf(active) + others)
        .map { UsageSection(if (labelled) it.label else null, usageLines(it.usage)) }
        .filter { it.lines.isNotEmpty() }
    return WidgetSummary(headline, usage, tone)
}

/** One line per provider with a snapshot: what is left of each window, or the credits spent. */
private fun usageLines(usage: List<ProviderUsage>): List<String> = usage.filter { it.hasSnapshot }.map { provider ->
    val windows = listOfNotNull(
        provider.fiveHour?.let { "5h ${it.remainingPercent}%" },
        provider.sevenDay?.let { "7d ${it.remainingPercent}%" },
        provider.creditUsage?.let { "credits ${formatCredit(it)}" },
    ).joinToString("  ")
    "${provider.label.padEnd(11)} $windows"
}

/** [sections] as JSON, for the widget's preferences. */
fun encodeUsage(sections: List<UsageSection>): String = JSONArray(
    sections.map { JSONObject().put("label", it.label ?: JSONObject.NULL).put("lines", JSONArray(it.lines)) },
).toString()

/** The sections [encodeUsage] wrote; none when [json] is missing or unreadable. */
fun decodeUsage(json: String?): List<UsageSection> = try {
    val array = JSONArray(json ?: "[]")
    List(array.length()) { i ->
        val section = array.getJSONObject(i)
        val lines = section.getJSONArray("lines")
        UsageSection(
            if (section.isNull("label")) null else section.getString("label"),
            List(lines.length()) { lines.getString(it) },
        )
    }
} catch (_: JSONException) {
    emptyList()
}

/**
 * Whether the live client state should overwrite the widget. Closing the socket because the app
 * left the screen (`!started`) or dialing (`CONNECTING`) keeps the last summary on screen.
 */
fun shouldPublishWidget(started: Boolean, state: ConnectionState, othersCount: Int): Boolean = when {
    state.link == null -> true
    !started -> false
    state.status == ConnectionStatus.CONNECTED || othersCount > 0 -> true
    state.status == ConnectionStatus.CONNECTING -> false
    else -> true
}

/**
 * Write [summary] into the widget's [prefs] at [now] ("HH:mm"), returning true when anything on
 * the card changed. While connected (`tone != OFFLINE`), a new minute also updates the timestamp
 * so the reader sees the widget is still live; while offline with a computer linked, an empty
 * in-memory usage list keeps the last stored usage snapshot on the card.
 */
fun storeWidgetSummary(
    prefs: SharedPreferences,
    summary: WidgetSummary,
    now: String = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm")),
    keepOfflineUsage: Boolean = true,
): Boolean {
    val encodedUsage = if (summary.tone == WidgetTone.OFFLINE && summary.usage.isEmpty() && keepOfflineUsage) {
        prefs.getString(AgentWidget.KEY_USAGE, null) ?: encodeUsage(emptyList())
    } else {
        encodeUsage(summary.usage)
    }
    val sameContent = prefs.getString(AgentWidget.KEY_HEADLINE, null) == summary.headline &&
        prefs.getString(AgentWidget.KEY_USAGE, null) == encodedUsage &&
        prefs.getString(AgentWidget.KEY_TONE, null) == summary.tone.name
    if (sameContent && (summary.tone == WidgetTone.OFFLINE || prefs.getString(AgentWidget.KEY_UPDATED, null) == now)) {
        return false
    }
    prefs.edit {
        putString(AgentWidget.KEY_HEADLINE, summary.headline)
        putString(AgentWidget.KEY_USAGE, encodedUsage)
        putString(AgentWidget.KEY_TONE, summary.tone.name)
        putString(AgentWidget.KEY_UPDATED, now)
    }
    return true
}

/**
 * Home-screen widget: agents that need you and the usage meters. While a widget is placed on the
 * home screen, it keeps the connection open while the app process is alive and polls every saved
 * computer in the background on a schedule; in between, it shows the last update and its time.
 */
class AgentWidget : AppWidgetProvider() {
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        sync(context)
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        render(context, manager, ids)
        sync(context)
        val app = context.applicationContext as? PhoneApplication ?: return
        if (app.demoActive) return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate).launch {
            try {
                app.client.pollWidget()?.let {
                    publish(context, it, keepOfflineUsage = app.client.state.value.link != null)
                }
            } finally {
                pending.finish()
            }
        }
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        sync(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        sync(context)
    }

    companion object {
        private const val HOLDER = "widget"
        internal const val PREFS = "widget"
        internal const val KEY_HEADLINE = "headline"
        // Holds JSON sections; earlier builds kept plain text under "usage".
        internal const val KEY_USAGE = "usage_sections"
        internal const val KEY_UPDATED = "updated"
        internal const val KEY_TONE = "tone"

        /** True when at least one widget is placed on the home screen. */
        fun hasWidgets(context: Context): Boolean = runCatching {
            val manager = AppWidgetManager.getInstance(context) ?: return false
            manager.getAppWidgetIds(ComponentName(context, AgentWidget::class.java)).isNotEmpty()
        }.getOrDefault(false)

        /**
         * Keep the live connection and periodic background poll running while a widget is placed and
         * a computer is linked, and stop both once the last widget is removed.
         */
        fun sync(context: Context) {
            val app = context.applicationContext as? PhoneApplication ?: return
            if (!app.demoActive && hasWidgets(context) && app.client.state.value.link != null) {
                app.client.start(HOLDER)
                WidgetJobService.schedule(context)
            } else {
                app.client.stop(HOLDER)
                WidgetJobService.cancel(context)
            }
        }

        /** Store [summary] and redraw every placed widget. */
        fun publish(context: Context, summary: WidgetSummary, keepOfflineUsage: Boolean = true) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (!storeWidgetSummary(prefs, summary, keepOfflineUsage = keepOfflineUsage)) return
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
            val usage = decodeUsage(prefs.getString(KEY_USAGE, null))
            val tone = WidgetTone.entries.firstOrNull { it.name == prefs.getString(KEY_TONE, null) } ?: WidgetTone.OFFLINE
            val views = RemoteViews(context.packageName, R.layout.widget_agents).apply {
                setTextViewText(R.id.widget_headline, prefs.getString(KEY_HEADLINE, null) ?: "Open the app to connect")
                // Each computer's meters, its label above a full-width rule; rebuilt on every draw.
                removeAllViews(R.id.widget_usage)
                usage.forEach { section ->
                    addView(R.id.widget_usage, usageSectionViews(context, section, palette))
                }
                setInt(R.id.widget_status, "setColorFilter", tone.color)
                // The rule under the headline separates it from the usage meters; alone it is clutter.
                val usageVisibility = if (usage.isEmpty()) android.view.View.GONE else android.view.View.VISIBLE
                setViewVisibility(R.id.widget_divider, usageVisibility)
                setViewVisibility(R.id.widget_usage_title, usageVisibility)
                setViewVisibility(R.id.widget_usage, usageVisibility)
                setInt(R.id.widget_divider, "setBackgroundColor", ruleColor(palette))
                setTextViewText(R.id.widget_updated, prefs.getString(KEY_UPDATED, null).orEmpty())
                // The card's color picks the text colors too, so a light card stays readable.
                setTextColor(R.id.widget_title, palette.title)
                setTextColor(R.id.widget_headline, palette.headline)
                setTextColor(R.id.widget_usage_title, palette.usage)
                setTextColor(R.id.widget_updated, palette.updated)
                setOnClickPendingIntent(R.id.widget_root, open)
                // RemoteViews can only set a background through the View setter it reflects on.
                setInt(R.id.widget_root, "setBackgroundResource", palette.background(transparency))
            }
            manager.updateAppWidget(ids, views)
        }

        private fun usageSectionViews(context: Context, section: UsageSection, palette: WidgetPalette) =
            RemoteViews(context.packageName, R.layout.widget_usage_section).apply {
                val labelVisibility = if (section.label == null) android.view.View.GONE else android.view.View.VISIBLE
                setViewVisibility(R.id.usage_label, labelVisibility)
                setViewVisibility(R.id.usage_rule, labelVisibility)
                setTextViewText(R.id.usage_label, section.label.orEmpty())
                setTextViewText(R.id.usage_lines, section.lines.joinToString("\n"))
                setTextColor(R.id.usage_label, palette.title)
                setTextColor(R.id.usage_lines, palette.usage)
                setInt(R.id.usage_rule, "setBackgroundColor", ruleColor(palette))
            }

        /** The faint rule color for [palette]'s card, shared by the headline divider and section rules. */
        private fun ruleColor(palette: WidgetPalette) = (palette.updated and 0x00FFFFFF) or 0x40000000
    }
}

/**
 * Periodically polls every saved computer in the background while a widget is on the home screen,
 * so the widget stays fresh even after Android suspends or restarts the cached app process.
 */
class WidgetJobService : JobService() {
    private var job: Job? = null

    override fun onStartJob(params: JobParameters): Boolean {
        val app = applicationContext as? PhoneApplication ?: return false
        AgentWidget.sync(this)
        if (app.demoActive || !AgentWidget.hasWidgets(this)) return false
        job = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate).launch {
            try {
                app.client.pollWidget()?.let {
                    AgentWidget.publish(this@WidgetJobService, it, keepOfflineUsage = app.client.state.value.link != null)
                }
            } finally {
                jobFinished(params, false)
            }
        }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        job?.cancel()
        job = null
        return true
    }

    companion object {
        private const val JOB_ID = 4202
        private const val INTERVAL_MS = 15 * 60_000L

        fun schedule(context: Context) {
            runCatching {
                val scheduler = context.getSystemService(JobScheduler::class.java) ?: return
                if (scheduler.getPendingJob(JOB_ID) != null) return
                val info = JobInfo.Builder(JOB_ID, ComponentName(context, WidgetJobService::class.java))
                    .setPeriodic(INTERVAL_MS)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true)
                    .build()
                scheduler.schedule(info)
            }
        }

        fun cancel(context: Context) {
            runCatching {
                context.getSystemService(JobScheduler::class.java)?.cancel(JOB_ID)
            }
        }
    }
}
