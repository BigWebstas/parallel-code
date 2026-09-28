package com.parallelcode.phone

import android.content.SharedPreferences
import androidx.core.content.edit

/**
 * The desktop this phone is linked to. The view-only token comes from the QR code; the paired token
 * is minted by entering the desktop's PIN and is the one allowed to type. App-private storage with
 * backups disabled in the manifest.
 */
class CredentialStore(private val prefs: SharedPreferences) {

    val link: ConnectionLink?
        get() {
            val baseUrl = prefs.getString(KEY_BASE_URL, null) ?: return null
            val token = prefs.getString(KEY_TOKEN, null) ?: return null
            return ConnectionLink(baseUrl, token)
        }

    val pairedToken: String?
        get() = prefs.getString(KEY_PAIRED_TOKEN, null)

    /** A new link can point at another computer, so it drops any paired token. */
    fun saveLink(link: ConnectionLink) {
        prefs.edit {
            putString(KEY_BASE_URL, link.baseUrl)
            putString(KEY_TOKEN, link.token)
            remove(KEY_PAIRED_TOKEN)
        }
    }

    fun savePairedToken(token: String) {
        prefs.edit { putString(KEY_PAIRED_TOKEN, token) }
    }

    fun clearPairedToken() {
        prefs.edit { remove(KEY_PAIRED_TOKEN) }
    }

    fun clear() {
        prefs.edit { clear() }
    }

    private companion object {
        const val KEY_BASE_URL = "baseUrl"
        const val KEY_TOKEN = "token"
        const val KEY_PAIRED_TOKEN = "pairedToken"
    }
}
