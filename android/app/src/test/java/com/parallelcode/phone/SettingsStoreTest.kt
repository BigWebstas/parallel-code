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

    @Test
    fun quickRepliesDefaultAndDropBlankLines() {
        assertEquals(SettingsStore.DEFAULT_QUICK_REPLIES, store.quickReplies)
        store.quickReplies = listOf(" continue ", "", "ship it")
        assertEquals(listOf("continue", "ship it"), store.quickReplies)
    }

    @Test
    fun appendsToADraftLikeTyping() {
        assertEquals("yes", appendToDraft("  ", "yes"))
        assertEquals("ok yes", appendToDraft("ok", "yes"))
        assertEquals("ok yes", appendToDraft("ok ", "yes"))
    }

    @Test
    fun alwaysFollowOutputDefaultsOffAndPersists() {
        assertFalse(store.alwaysFollowOutput)
        store.alwaysFollowOutput = true
        assertTrue(store.alwaysFollowOutput)
        assertTrue(prefs.getBoolean(SettingsStore.KEY_ALWAYS_FOLLOW_OUTPUT, false))
    }
}
