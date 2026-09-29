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

    companion object {
        const val PREFS_NAME = "settings"
        const val KEY_KEEP_SCREEN_ON = "keepScreenOn"
        const val KEY_KEEP_SCREEN_ON_ONLY_ACTIVE = "keepScreenOnOnlyActive"
        const val KEY_THEME_MODE = "themeMode"
        const val KEY_SHOW_MINIMIZED_TASKS = "showMinimizedTasks"

        const val THEME_SYSTEM = "system"
        const val THEME_DARK = "dark"
        const val THEME_LIGHT = "light"
    }
}
