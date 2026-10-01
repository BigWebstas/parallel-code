package com.parallelcode.phone

import android.app.Application
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/**
 * Owns the connection so the visible app and the background notification service share one socket
 * (see [RemoteClient.start]).
 */
class PhoneApplication : Application() {
    lateinit var vpnMonitor: VpnMonitor
        private set
    lateinit var client: RemoteClient
        private set
    lateinit var settings: SettingsStore
        private set
    lateinit var promptHistory: PromptHistoryStore
        private set

    /** True while the app is on screen; agent notifications stay quiet then. */
    @Volatile
    var inForeground = false

    override fun onCreate() {
        super.onCreate()
        settings = SettingsStore(getSharedPreferences(SettingsStore.PREFS_NAME, Context.MODE_PRIVATE))
        vpnMonitor = VpnMonitor(this)
        vpnMonitor.start()
        client = RemoteClient(
            CredentialStore(getSharedPreferences("desktop", Context.MODE_PRIVATE)),
            vpnActive = vpnMonitor.isVpnActive,
            waitForVpn = { settings.waitForVpn },
        )
        promptHistory = PromptHistoryStore(getSharedPreferences(PromptHistoryStore.PREFS_NAME, Context.MODE_PRIVATE))
        // Keep the home-screen widget current whenever the connection is open.
        CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate).launch {
            combine(client.agents, client.usage, client.state) { agents, usage, state ->
                widgetSummary(agents, usage, state.status == ConnectionStatus.CONNECTED)
            }.collect { AgentWidget.publish(this@PhoneApplication, it) }
        }
    }
}
