package com.parallelcode.phone

import android.app.Activity
import android.os.Build
import android.view.Display
import android.view.View
import kotlin.math.abs

/**
 * A display mode's geometry and refresh rate, decoupled from Android's [Display.Mode] for unit tests.
 */
internal data class DisplayModeSpec(
    val modeId: Int,
    val physicalWidth: Int,
    val physicalHeight: Int,
    val refreshRate: Float,
)

/**
 * Picks the highest refresh rate mode that keeps [current]'s physical resolution.
 * Changing physical resolution can blank the panel or alter density, so modes of other sizes are
 * ignored. Ties within 0.01 Hz keep [current] to avoid redundant window attribute updates.
 */
internal fun selectHighRefreshMode(
    current: DisplayModeSpec,
    supported: Iterable<DisplayModeSpec>,
): DisplayModeSpec {
    var best = current
    for (candidate in supported) {
        if (candidate.physicalWidth != current.physicalWidth || candidate.physicalHeight != current.physicalHeight) {
            continue
        }
        val delta = candidate.refreshRate - best.refreshRate
        if (delta > 0.01f || (abs(delta) <= 0.01f && candidate.modeId == current.modeId)) {
            best = candidate
        }
    }
    return best
}

/**
 * Requests the display's highest refresh rate (90 Hz / 120 Hz+) for the activity window and Compose
 * host view. Many Android OEMs and Android 15+ adaptive refresh rate cap non-game apps at 60 Hz
 * unless the window prefers the high-refresh [Display.Mode] and opts into the high frame rate category.
 */
internal fun requestHighFrameRate(activity: Activity, rootView: View? = null) {
    val window = activity.window ?: return
    val display: Display? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        activity.display
    } else {
        @Suppress("DEPRECATION")
        activity.windowManager.defaultDisplay
    }
    if (display != null) {
        val active = display.mode
        val current = DisplayModeSpec(
            modeId = active.modeId,
            physicalWidth = active.physicalWidth,
            physicalHeight = active.physicalHeight,
            refreshRate = active.refreshRate,
        )
        val supported = display.supportedModes.map { mode ->
            DisplayModeSpec(
                modeId = mode.modeId,
                physicalWidth = mode.physicalWidth,
                physicalHeight = mode.physicalHeight,
                refreshRate = mode.refreshRate,
            )
        }
        val best = selectHighRefreshMode(current, supported)
        val params = window.attributes
        if (params.preferredDisplayModeId != best.modeId || abs(params.preferredRefreshRate - best.refreshRate) > 0.01f) {
            params.preferredDisplayModeId = best.modeId
            params.preferredRefreshRate = best.refreshRate
            window.attributes = params
        }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
        window.setFrameRatePowerSavingsBalanced(false)
        window.setFrameRateBoostOnTouchEnabled(true)
        rootView?.requestedFrameRate = View.REQUESTED_FRAME_RATE_CATEGORY_HIGH
    }
}
