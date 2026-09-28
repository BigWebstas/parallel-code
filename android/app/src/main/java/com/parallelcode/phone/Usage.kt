package com.parallelcode.phone

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

// Mirrors UsageState in electron/ipc/shared-types.ts and the helpers in src/components/usage-format.ts.

data class UsageWindow(val usedPercent: Double, val resetsAt: Long?) {
    val remainingPercent: Int
        get() = maxOf(0, (100 - usedPercent).roundToInt())
    val warn: Boolean
        get() = usedPercent >= USAGE_WARN_PERCENT
}

data class ProviderUsage(
    val label: String,
    val fiveHour: UsageWindow?,
    val sevenDay: UsageWindow?,
    /** `error` keeps the last snapshot but marks it stale. */
    val status: String,
    val error: String?,
) {
    val hasSnapshot: Boolean
        get() = fiveHour != null || sevenDay != null
}

/** Past this share of a window, the meter turns amber. */
private const val USAGE_WARN_PERCENT = 80

private val PROVIDERS = listOf("claude" to "Claude", "codex" to "Codex")

/**
 * Providers the desktop status bar would show: those with a snapshot, plus those whose refresh
 * failed so the reader sees why the meter stopped moving.
 */
fun parseUsage(json: JSONObject): List<ProviderUsage> = PROVIDERS.mapNotNull { (key, label) ->
    val p = json.optJSONObject(key) ?: return@mapNotNull null
    ProviderUsage(
        label = label,
        fiveHour = p.optJSONObject("fiveHour")?.let(::parseWindow),
        sevenDay = p.optJSONObject("sevenDay")?.let(::parseWindow),
        status = p.optString("status"),
        error = if (p.isNull("error")) null else p.optString("error"),
    ).takeIf { it.hasSnapshot || it.status == "error" }
}

private fun parseWindow(w: JSONObject) = UsageWindow(
    usedPercent = w.getDouble("usedPercent"),
    resetsAt = if (w.isNull("resetsAt")) null else w.getLong("resetsAt"),
)

/** "resets 14:30" today, "resets Thu 09:00" otherwise, "reset due" once passed, "" when unknown. */
fun formatReset(
    resetsAt: Long?,
    now: Long = System.currentTimeMillis(),
    zone: ZoneId = ZoneId.systemDefault(),
    locale: Locale = Locale.getDefault(),
): String {
    if (resetsAt == null) return ""
    if (resetsAt <= now) return "reset due"
    val at = Instant.ofEpochMilli(resetsAt).atZone(zone)
    val time = at.format(DateTimeFormatter.ofPattern("HH:mm", locale))
    if (at.toLocalDate() == Instant.ofEpochMilli(now).atZone(zone).toLocalDate()) return "resets $time"
    return "resets ${at.format(DateTimeFormatter.ofPattern("EEE", locale))} $time"
}

// The desktop polls the usage endpoints itself; this only re-reads its snapshot.
private const val USAGE_POLL_MS = 60_000L

/** The desktop status bar's subscription meters. Hidden until the desktop has a snapshot. */
@Composable
fun UsageStrip(client: RemoteClient, connected: Boolean) {
    var usage by remember { mutableStateOf<List<ProviderUsage>>(emptyList()) }
    var refresh by remember { mutableIntStateOf(0) }
    // Reads on every (re)connect and tap, then once a minute.
    LaunchedEffect(connected, refresh) {
        while (connected) {
            try {
                usage = client.fetchUsage()
            } catch (_: ApiException) {
                // Keep the last snapshot; the connection status already reports outages.
            }
            delay(USAGE_POLL_MS)
        }
    }
    if (usage.isEmpty()) return
    Card(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .semantics { contentDescription = "Agent usage, tap to refresh" }
            .clickable { refresh++ },
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            usage.forEach { provider ->
                val stale = provider.status == "error"
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(provider.label, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge)
                    provider.fiveHour?.let { UsageMeter("5h", it, stale) }
                    provider.sevenDay?.let { UsageMeter("7d", it, stale) }
                    if (!provider.hasSnapshot) {
                        Text(
                            "usage unavailable · ${provider.error.orEmpty()}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
    }
}

private val WARN_COLOR = Color(0xFFE0A030)

@Composable
private fun UsageMeter(label: String, window: UsageWindow, stale: Boolean) {
    val left = window.remainingPercent
    val fill = when {
        stale -> MaterialTheme.colorScheme.outline
        window.warn -> WARN_COLOR
        else -> MaterialTheme.colorScheme.primary
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.width(28.dp), style = MaterialTheme.typography.bodySmall)
        Box(
            Modifier
                .weight(1f)
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .semantics { contentDescription = "$label window $left% remaining" },
        ) {
            Box(
                Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(left / 100f)
                    .background(fill),
            )
        }
        Text(
            listOf("$left% left", formatReset(window.resetsAt)).filter { it.isNotEmpty() }.joinToString(" · "),
            Modifier.padding(start = 8.dp),
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
