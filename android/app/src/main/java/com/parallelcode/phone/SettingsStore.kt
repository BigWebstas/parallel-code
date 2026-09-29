package com.parallelcode.phone

import android.content.SharedPreferences
import androidx.core.content.edit

class SettingsStore(private val prefs: SharedPreferences) {

    var keepScreenOn: Boolean
        get() = prefs.getBoolean(KEY_KEEP_SCREEN_ON, false)
        set(value) {
            prefs.edit { putBoolean(KEY_KEEP_SCREEN_ON, value) }
        }

    var keepScreenOnOnlyWhenActive: Boolean
        get() = prefs.getBoolean(KEY_KEEP_SCREEN_ON_ONLY_ACTIVE, false)
        set(value) {
            prefs.edit { putBoolean(KEY_KEEP_SCREEN_ON_ONLY_ACTIVE, value) }
        }

    var themeMode: String
        get() = prefs.getString(KEY_THEME_MODE, THEME_SYSTEM) ?: THEME_SYSTEM
        set(value) {
            prefs.edit { putString(KEY_THEME_MODE, value) }
        }

    var showMinimizedTasks: Boolean
        get() = prefs.getBoolean(KEY_SHOW_MINIMIZED_TASKS, false)
        set(value) {
            prefs.edit { putBoolean(KEY_SHOW_MINIMIZED_TASKS, value) }
        }

    /** Jump to new terminal output even when scrolled up; off, output is followed only at the bottom. */
    var alwaysFollowOutput: Boolean
        get() = prefs.getBoolean(KEY_ALWAYS_FOLLOW_OUTPUT, false)
        set(value) {
            prefs.edit { putBoolean(KEY_ALWAYS_FOLLOW_OUTPUT, value) }
        }

    /** Replies offered above the reply box, one per line. */
    var quickReplies: List<String>
        get() = (prefs.getString(KEY_QUICK_REPLIES, null) ?: DEFAULT_QUICK_REPLIES.joinToString("\n"))
            .lines().map { it.trim() }.filter { it.isNotEmpty() }
        set(value) = prefs.edit { putString(KEY_QUICK_REPLIES, value.joinToString("\n")) }

    /** Keep watching in the background and notify about agents (see [AgentWatchService]). */
    var notificationsEnabled: Boolean
        get() = prefs.getBoolean(KEY_NOTIFICATIONS, false)
        set(value) = prefs.edit { putBoolean(KEY_NOTIFICATIONS, value) }

    var notifyNeedsInput: Boolean
        get() = prefs.getBoolean(KEY_NOTIFY_NEEDS_INPUT, true)
        set(value) = prefs.edit { putBoolean(KEY_NOTIFY_NEEDS_INPUT, value) }

    var notifyErrors: Boolean
        get() = prefs.getBoolean(KEY_NOTIFY_ERRORS, true)
        set(value) = prefs.edit { putBoolean(KEY_NOTIFY_ERRORS, value) }

    var notifyFinished: Boolean
        get() = prefs.getBoolean(KEY_NOTIFY_FINISHED, false)
        set(value) = prefs.edit { putBoolean(KEY_NOTIFY_FINISHED, value) }

    fun notifiesFor(event: AgentEvent): Boolean = when (event) {
        AgentEvent.NEEDS_INPUT -> notifyNeedsInput
        AgentEvent.ERROR -> notifyErrors
        AgentEvent.FINISHED -> notifyFinished
    }

    companion object {
        const val PREFS_NAME = "settings"
        const val KEY_KEEP_SCREEN_ON = "keepScreenOn"
        const val KEY_KEEP_SCREEN_ON_ONLY_ACTIVE = "keepScreenOnOnlyActive"
        const val KEY_THEME_MODE = "themeMode"
        const val KEY_SHOW_MINIMIZED_TASKS = "showMinimizedTasks"
        const val KEY_ALWAYS_FOLLOW_OUTPUT = "alwaysFollowOutput"
        const val KEY_QUICK_REPLIES = "quickReplies"
        val DEFAULT_QUICK_REPLIES = listOf("continue", "yes", "run the tests", "commit this")
        const val KEY_NOTIFICATIONS = "notifications"
        const val KEY_NOTIFY_NEEDS_INPUT = "notifyNeedsInput"
        const val KEY_NOTIFY_ERRORS = "notifyErrors"
        const val KEY_NOTIFY_FINISHED = "notifyFinished"

        const val THEME_SYSTEM = "system"
        const val THEME_DARK = "dark"
        const val THEME_LIGHT = "light"
    }
}
