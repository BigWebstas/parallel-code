package com.parallelcode.phone

import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
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
    lateinit var networkMonitor: NetworkMonitor
        private set
    lateinit var client: RemoteClient
        private set
    lateinit var settings: SettingsStore
        private set
    lateinit var promptHistory: PromptHistoryStore
        private set
    lateinit var updates: AppUpdates
        private set

    /** True while the app is on screen; agent notifications stay quiet then. */
    @Volatile
    var inForeground = false

    @Volatile
    var demoActive = false
        private set

    fun setDemoActive(active: Boolean) {
        demoActive = active
        if (active) {
            client.setSuspended(true)
            updates.setPaused(true)
            networkMonitor.stop()
        } else {
            // Refresh network policy before any real token may leave the phone again.
            networkMonitor.start()
            networkMonitor.setForeground(inForeground)
            client.setSuspended(false)
            updates.setPaused(false)
        }
        // Android 12+ refuses foreground-service starts from the background (e.g. the task was swiped
        // away during the demo); MainActivity.onStart syncs again once the app is visible.
        if (active || inForeground || Build.VERSION.SDK_INT < 31) AgentWatchService.sync(this)
        AgentWidget.sync(this)
    }

    override fun onCreate() {
        super.onCreate()
        settings = SettingsStore(getSharedPreferences(SettingsStore.PREFS_NAME, Context.MODE_PRIVATE))
        networkMonitor = NetworkMonitor(this)
        networkMonitor.start()
        client = RemoteClient(
            CredentialStore(getSharedPreferences(CredentialStore.PREFS_NAME, Context.MODE_PRIVATE)),
            vpnActive = networkMonitor.isVpnActive,
            wifiSsid = networkMonitor.wifiSsid,
            waitForVpn = { settings.waitForVpn },
            homeWifiSsid = { settings.homeWifiSsid },
        )
        promptHistory = PromptHistoryStore(getSharedPreferences(PromptHistoryStore.PREFS_NAME, Context.MODE_PRIVATE))
        updates = AppUpdates(this)
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        scope.launch {
            var lastLink = client.state.value.link
            client.state.collect { state ->
                if (state.link != lastLink) {
                    lastLink = state.link
                    AgentWidget.sync(this@PhoneApplication)
                }
            }
        }
        // Keep the home-screen widget current whenever the connection is open.
        scope.launch {
            combine(
                combine(client.agents, client.usage, client.state, client.otherComputers, client.computers) {
                        agents, usage, state, others, computers ->
                    val label = computers.firstOrNull { it.baseUrl == state.link?.baseUrl }?.label.orEmpty()
                    Triple(
                        widgetSummary(
                            ComputerSnapshot(label, agents, usage),
                            state.status == ConnectionStatus.CONNECTED,
                            others.values.toList(),
                        ),
                        state,
                        others.size,
                    )
                },
                client.isStarted,
                client.lastSync,
            ) { (summary, state, othersCount), started, _ ->
                if (shouldPublishWidget(started, state, othersCount)) summary to (state.link != null) else null
            }.collect { update ->
                if (!demoActive && update != null) {
                    AgentWidget.publish(this@PhoneApplication, update.first, keepOfflineUsage = update.second)
                }
            }
        }
        AgentWidget.sync(this)
        registerReceiver(
            object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    if (!demoActive) {
                        AgentWidget.sync(this@PhoneApplication)
                        client.refreshNow()
                    }
                }
            },
            IntentFilter(Intent.ACTION_SCREEN_ON),
        )
    }
}
