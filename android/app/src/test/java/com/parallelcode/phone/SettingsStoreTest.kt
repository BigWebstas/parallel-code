package com.parallelcode.phone

import android.content.SharedPreferences
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SettingsStoreTest {

    private lateinit var prefs: FakeSharedPreferences
    private lateinit var store: SettingsStore

    @Before
    fun setUp() {
        prefs = FakeSharedPreferences()
        store = SettingsStore(prefs)
    }

    @Test
    fun defaultsToKeepScreenOnDisabled() {
        assertFalse(store.keepScreenOn)
    }

    @Test
    fun enablesKeepScreenOnAndPersists() {
        store.keepScreenOn = true
        assertTrue(store.keepScreenOn)
        assertTrue(prefs.getBoolean(SettingsStore.KEY_KEEP_SCREEN_ON, false))
    }

    @Test
    fun togglesKeepScreenOnBackToDisabled() {
        store.keepScreenOn = true
        assertTrue(store.keepScreenOn)
        store.keepScreenOn = false
        assertFalse(store.keepScreenOn)
        assertFalse(prefs.getBoolean(SettingsStore.KEY_KEEP_SCREEN_ON, true))
    }

    @Test
    fun defaultsToKeepScreenOnOnlyWhenActiveDisabled() {
        assertFalse(store.keepScreenOnOnlyWhenActive)
    }

    @Test
    fun enablesKeepScreenOnOnlyWhenActiveAndPersists() {
        store.keepScreenOnOnlyWhenActive = true
        assertTrue(store.keepScreenOnOnlyWhenActive)
        assertTrue(prefs.getBoolean(SettingsStore.KEY_KEEP_SCREEN_ON_ONLY_ACTIVE, false))
    }

    @Test
    fun defaultsToSystemThemeMode() {
        assertEquals(SettingsStore.THEME_SYSTEM, store.themeMode)
    }

    @Test
    fun setsThemeModeAndPersists() {
        store.themeMode = SettingsStore.THEME_DARK
        assertEquals(SettingsStore.THEME_DARK, store.themeMode)
        assertEquals(SettingsStore.THEME_DARK, prefs.getString(SettingsStore.KEY_THEME_MODE, null))

        store.themeMode = SettingsStore.THEME_LIGHT
        assertEquals(SettingsStore.THEME_LIGHT, store.themeMode)
        assertEquals(SettingsStore.THEME_LIGHT, prefs.getString(SettingsStore.KEY_THEME_MODE, null))
    }

    @Test
    fun defaultsToShowMinimizedTasksDisabled() {
        assertFalse(store.showMinimizedTasks)
    }

    @Test
    fun enablesShowMinimizedTasksAndPersists() {
        store.showMinimizedTasks = true
        assertTrue(store.showMinimizedTasks)
        assertTrue(prefs.getBoolean(SettingsStore.KEY_SHOW_MINIMIZED_TASKS, false))

        store.showMinimizedTasks = false
        assertFalse(store.showMinimizedTasks)
        assertFalse(prefs.getBoolean(SettingsStore.KEY_SHOW_MINIMIZED_TASKS, true))
    }
}

/** Simple in-memory fake of Android SharedPreferences for unit tests. */
private class FakeSharedPreferences : SharedPreferences {
    private val map = mutableMapOf<String, Any>()

    override fun getAll(): Map<String, *> = map
    override fun getString(key: String?, defValue: String?): String? = (map[key] as? String) ?: defValue
    @Suppress("UNCHECKED_CAST")
    override fun getStringSet(key: String?, defValues: Set<String>?): Set<String>? =
        (map[key] as? Set<String>) ?: defValues
    override fun getInt(key: String?, defValue: Int): Int = (map[key] as? Int) ?: defValue
    override fun getLong(key: String?, defValue: Long): Long = (map[key] as? Long) ?: defValue
    override fun getFloat(key: String?, defValue: Float): Float = (map[key] as? Float) ?: defValue
    override fun getBoolean(key: String?, defValue: Boolean): Boolean = (map[key] as? Boolean) ?: defValue
    override fun contains(key: String?): Boolean = map.containsKey(key)
    override fun edit(): SharedPreferences.Editor = FakeEditor(map)
    override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {}
    override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {}

    private class FakeEditor(private val backingMap: MutableMap<String, Any>) : SharedPreferences.Editor {
        private val pending = mutableMapOf<String, Any?>()
        private var clearPending = false

        override fun putString(key: String?, value: String?): SharedPreferences.Editor = apply {
            if (key != null) pending[key] = value
        }
        override fun putStringSet(key: String?, values: Set<String>?): SharedPreferences.Editor = apply {
            if (key != null) pending[key] = values
        }
        override fun putInt(key: String?, value: Int): SharedPreferences.Editor = apply {
            if (key != null) pending[key] = value
        }
        override fun putLong(key: String?, value: Long): SharedPreferences.Editor = apply {
            if (key != null) pending[key] = value
        }
        override fun putFloat(key: String?, value: Float): SharedPreferences.Editor = apply {
            if (key != null) pending[key] = value
        }
        override fun putBoolean(key: String?, value: Boolean): SharedPreferences.Editor = apply {
            if (key != null) pending[key] = value
        }
        override fun remove(key: String?): SharedPreferences.Editor = apply {
            if (key != null) pending[key] = null
        }
        override fun clear(): SharedPreferences.Editor = apply {
            clearPending = true
        }
        override fun commit(): Boolean {
            apply()
            return true
        }
        override fun apply() {
            if (clearPending) backingMap.clear()
            for ((k, v) in pending) {
                if (v == null) backingMap.remove(k) else backingMap[k] = v
            }
            pending.clear()
            clearPending = false
        }
    }
}
