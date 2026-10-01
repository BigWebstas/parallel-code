package com.parallelcode.phone

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Monitors whether an active VPN connection (such as Tailscale, WireGuard, or OpenVPN) is up on the
 * device.
 *
 * Detects both full-tunnel VPNs (where [ConnectivityManager.getActiveNetwork] reports
 * [NetworkCapabilities.TRANSPORT_VPN]) and split-tunnel VPNs (such as Tailscale or WireGuard where
 * a separate VPN network interface is registered alongside Wi-Fi or cellular).
 */
class VpnMonitor(context: Context) {
    private val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    private val _isVpnActive = MutableStateFlow(checkVpnActive())

    /** Live flow indicating whether a VPN transport is currently active. */
    val isVpnActive: StateFlow<Boolean> = _isVpnActive.asStateFlow()

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            _isVpnActive.value = checkVpnActive()
        }

        override fun onLost(network: Network) {
            _isVpnActive.value = checkVpnActive()
        }

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            _isVpnActive.value = checkVpnActive()
        }
    }

    private var registered = false

    /** Register network callback to observe VPN state changes. Safe to call multiple times. */
    fun start() {
        if (registered) return
        val manager = cm ?: return
        try {
            val request = NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_VPN)
                .removeCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
                .build()
            manager.registerNetworkCallback(request, networkCallback)
            registered = true
        } catch (_: Exception) {
            // Fails gracefully in test environments or restricted execution contexts
        }
        _isVpnActive.value = checkVpnActive()
    }

    /** Unregister network callback when monitoring is no longer needed. */
    fun stop() {
        if (!registered) return
        try {
            cm?.unregisterNetworkCallback(networkCallback)
        } catch (_: Exception) {}
        registered = false
    }

    /**
     * Checks if any currently active network interface provides [NetworkCapabilities.TRANSPORT_VPN].
     */
    fun checkVpnActive(): Boolean {
        val manager = cm ?: return false
        return try {
            val active = manager.activeNetwork
            if (active != null) {
                val caps = manager.getNetworkCapabilities(active)
                if (caps?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true) {
                    return true
                }
            }
            @Suppress("DEPRECATION")
            manager.allNetworks.any { net ->
                manager.getNetworkCapabilities(net)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
            }
        } catch (_: Exception) {
            false
        }
    }
}
