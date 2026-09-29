package com.parallelcode.phone

import android.content.SharedPreferences
import androidx.core.content.edit
import org.json.JSONArray
import org.json.JSONObject

/** A desktop this phone has linked to, by its Remote Access address. */
data class SavedComputer(val baseUrl: String, val token: String, val pairedToken: String?) {
    /** "192.168.1.20:7777": what the phone shows for this computer. */
    val label: String get() = baseUrl.substringAfter("://")
}

/**
 * The desktops this phone is linked to, and which one it uses. The view-only token comes from the
 * QR code; the paired token is minted by entering the desktop's PIN and is the one allowed to type.
 * Computers are keyed by address. App-private storage with backups disabled in the manifest.
 */
class CredentialStore(private val prefs: SharedPreferences) {

    init {
        migrateSingleComputer()
    }

    val computers: List<SavedComputer>
        get() {
            val array = runCatching { JSONArray(prefs.getString(KEY_COMPUTERS, "[]")) }.getOrElse { JSONArray() }
            return List(array.length()) { i ->
                val c = array.getJSONObject(i)
                SavedComputer(
                    c.getString("baseUrl"),
                    c.getString("token"),
                    if (c.isNull("pairedToken")) null else c.optString("pairedToken").ifEmpty { null },
                )
            }
        }

    private val active: SavedComputer?
        get() = prefs.getString(KEY_ACTIVE, null)?.let { url -> computers.firstOrNull { it.baseUrl == url } }

    val link: ConnectionLink?
        get() = active?.let { ConnectionLink(it.baseUrl, it.token) }

    val pairedToken: String?
        get() = active?.pairedToken

    /**
     * Use [link]'s computer, adding it if new. A new QR token for a known address may belong to a
     * different computer now, so it drops that address's paired token.
     */
    fun saveLink(link: ConnectionLink) {
        val others = computers.filter { it.baseUrl != link.baseUrl }
        write(others + SavedComputer(link.baseUrl, link.token, null), active = link.baseUrl)
    }

    /** Switch to a saved computer. */
    fun select(baseUrl: String) {
        if (computers.any { it.baseUrl == baseUrl }) prefs.edit { putString(KEY_ACTIVE, baseUrl) }
    }

    fun savePairedToken(token: String) = updateActive { it.copy(pairedToken = token) }

    fun clearPairedToken() = updateActive { it.copy(pairedToken = null) }

    /** Forget a saved computer; forgetting the one in use leaves none selected. */
    fun remove(baseUrl: String) {
        val current = prefs.getString(KEY_ACTIVE, null)
        write(computers.filter { it.baseUrl != baseUrl }, active = current.takeIf { it != baseUrl })
    }

    /** Forget the computer in use. */
    fun clear() {
        prefs.getString(KEY_ACTIVE, null)?.let(::remove)
    }

    private fun updateActive(change: (SavedComputer) -> SavedComputer) {
        val url = prefs.getString(KEY_ACTIVE, null) ?: return
        write(computers.map { if (it.baseUrl == url) change(it) else it }, active = url)
    }

    private fun write(list: List<SavedComputer>, active: String?) {
        val array = JSONArray()
        list.forEach {
            array.put(
                JSONObject()
                    .put("baseUrl", it.baseUrl)
                    .put("token", it.token)
                    .put("pairedToken", it.pairedToken ?: JSONObject.NULL),
            )
        }
        prefs.edit {
            putString(KEY_COMPUTERS, array.toString())
            if (active == null) remove(KEY_ACTIVE) else putString(KEY_ACTIVE, active)
        }
    }

    /** Earlier versions kept one computer in flat keys; carry it over, pairing included. */
    private fun migrateSingleComputer() {
        val baseUrl = prefs.getString(LEGACY_BASE_URL, null) ?: return
        val token = prefs.getString(LEGACY_TOKEN, null)
        if (token != null && !prefs.contains(KEY_COMPUTERS)) {
            write(listOf(SavedComputer(baseUrl, token, prefs.getString(LEGACY_PAIRED_TOKEN, null))), active = baseUrl)
        }
        prefs.edit {
            remove(LEGACY_BASE_URL)
            remove(LEGACY_TOKEN)
            remove(LEGACY_PAIRED_TOKEN)
        }
    }

    private companion object {
        const val KEY_COMPUTERS = "computers"
        const val KEY_ACTIVE = "active"
        const val LEGACY_BASE_URL = "baseUrl"
        const val LEGACY_TOKEN = "token"
        const val LEGACY_PAIRED_TOKEN = "pairedToken"
    }
}
