package com.parallelcode.phone

import android.app.Application
import android.content.Context
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class PhoneViewModel(application: Application) : AndroidViewModel(application) {
    val client = RemoteClient(
        CredentialStore(application.getSharedPreferences("desktop", Context.MODE_PRIVATE)),
    )
    val settingsStore = SettingsStore(
        application.getSharedPreferences(SettingsStore.PREFS_NAME, Context.MODE_PRIVATE),
    )
    private val _keepScreenOn = MutableStateFlow(settingsStore.keepScreenOn)
    val keepScreenOn: StateFlow<Boolean> = _keepScreenOn.asStateFlow()

    private val _keepScreenOnOnlyWhenActive = MutableStateFlow(settingsStore.keepScreenOnOnlyWhenActive)
    val keepScreenOnOnlyWhenActive: StateFlow<Boolean> = _keepScreenOnOnlyWhenActive.asStateFlow()

    private val _themeMode = MutableStateFlow(settingsStore.themeMode)
    val themeMode: StateFlow<String> = _themeMode.asStateFlow()

    private val _showMinimizedTasks = MutableStateFlow(settingsStore.showMinimizedTasks)
    val showMinimizedTasks: StateFlow<Boolean> = _showMinimizedTasks.asStateFlow()

    fun setKeepScreenOn(value: Boolean) {
        settingsStore.keepScreenOn = value
        _keepScreenOn.value = value
    }

    fun setKeepScreenOnOnlyWhenActive(value: Boolean) {
        settingsStore.keepScreenOnOnlyWhenActive = value
        _keepScreenOnOnlyWhenActive.value = value
    }

    fun setThemeMode(value: String) {
        settingsStore.themeMode = value
        _themeMode.value = value
    }

    fun setShowMinimizedTasks(value: Boolean) {
        settingsStore.showMinimizedTasks = value
        _showMinimizedTasks.value = value
    }

    override fun onCleared() {
        client.dispose()
    }
}

class MainActivity : ComponentActivity() {
    private val model: PhoneViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val keepScreenOn by model.keepScreenOn.collectAsState()
            val keepScreenOnOnlyActive by model.keepScreenOnOnlyWhenActive.collectAsState()
            val agents by model.client.agents.collectAsState()
            val themeMode by model.themeMode.collectAsState()

            val hasActiveAgent = agents.any { it.running && (it.attention == "active" || it.attention == "shell_busy") }
            val shouldKeepAwake = keepScreenOn && (!keepScreenOnOnlyActive || hasActiveAgent)

            DisposableEffect(shouldKeepAwake) {
                if (shouldKeepAwake) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
                onDispose {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            }

            val darkTheme = when (themeMode) {
                SettingsStore.THEME_DARK -> true
                SettingsStore.THEME_LIGHT -> false
                else -> isSystemInDarkTheme()
            }

            ParallelCodeTheme(darkTheme = darkTheme) {
                PhoneApp(model)
            }
        }
    }

    // The socket only stays open while the app is visible, like the phone web UI's tab.
    override fun onStart() {
        super.onStart()
        model.client.start()
    }

    override fun onStop() {
        model.client.stop()
        super.onStop()
    }
}

private sealed interface Screen {
    data object Agents : Screen
    data object Pair : Screen
    data object NewTask : Screen
    data object Settings : Screen
    data class Agent(val agentId: String) : Screen
}

@Composable
private fun PhoneApp(model: PhoneViewModel) {
    val state by model.client.state.collectAsState()
    val agents by model.client.agents.collectAsState()
    var screenKey by rememberSaveable { mutableStateOf("agents") }
    val screen = when {
        screenKey == "pair" -> Screen.Pair
        screenKey == "new-task" -> Screen.NewTask
        screenKey == "settings" -> Screen.Settings
        screenKey.startsWith("agent:") -> Screen.Agent(screenKey.removePrefix("agent:"))
        else -> Screen.Agents
    }
    val link = state.link

    if (link == null) {
        ConnectScreen(expired = state.linkExpired, onLink = { model.client.link(it) })
        return
    }
    if (screen != Screen.Agents) BackHandler { screenKey = "agents" }
    AnimatedContent(
        targetState = screen,
        transitionSpec = {
            if (initialState == Screen.Agents) {
                (slideInHorizontally(animationSpec = tween(280)) { width -> (width * 0.15f).toInt() } + fadeIn(tween(250)))
                    .togetherWith(slideOutHorizontally(animationSpec = tween(240)) { width -> -(width * 0.15f).toInt() } + fadeOut(tween(200)))
            } else if (targetState == Screen.Agents) {
                (slideInHorizontally(animationSpec = tween(280)) { width -> -(width * 0.15f).toInt() } + fadeIn(tween(250)))
                    .togetherWith(slideOutHorizontally(animationSpec = tween(240)) { width -> (width * 0.15f).toInt() } + fadeOut(tween(200)))
            } else {
                fadeIn(tween(200)).togetherWith(fadeOut(tween(200)))
            }
        },
        label = "screenTransition",
    ) { currentScreen ->
        when (currentScreen) {
            Screen.Agents -> {
                val showMinimizedTasks by model.showMinimizedTasks.collectAsState()
                AgentsScreen(
                    client = model.client,
                    host = link.baseUrl,
                    state = state,
                    agents = agents,
                    showMinimizedTasks = showMinimizedTasks,
                    onOpen = { screenKey = "agent:${it.agentId}" },
                    onPair = { screenKey = "pair" },
                    onNewTask = { screenKey = "new-task" },
                    onSettings = { screenKey = "settings" },
                )
            }
            Screen.Settings -> {
                val keepScreenOn by model.keepScreenOn.collectAsState()
                val keepScreenOnOnlyActive by model.keepScreenOnOnlyWhenActive.collectAsState()
                val themeMode by model.themeMode.collectAsState()
                val showMinimizedTasks by model.showMinimizedTasks.collectAsState()
                val latencyMs by model.client.latencyMs.collectAsState()
                SettingsScreen(
                    keepScreenOn = keepScreenOn,
                    onKeepScreenOnChange = model::setKeepScreenOn,
                    keepScreenOnOnlyActive = keepScreenOnOnlyActive,
                    onKeepScreenOnOnlyActiveChange = model::setKeepScreenOnOnlyWhenActive,
                    themeMode = themeMode,
                    onThemeModeChange = model::setThemeMode,
                    showMinimizedTasks = showMinimizedTasks,
                    onShowMinimizedTasksChange = model::setShowMinimizedTasks,
                    latencyMs = latencyMs,
                    state = state,
                    onPair = { screenKey = "pair" },
                    onForget = {
                        model.client.forget()
                        screenKey = "agents"
                    },
                    onBack = { screenKey = "agents" },
                )
            }
            Screen.Pair -> PairScreen(
                pair = model.client::pair,
                onDone = { screenKey = "agents" },
            )
            Screen.NewTask -> NewTaskScreen(
                client = model.client,
                onDone = { screenKey = "agents" },
                onNeedsPairing = { screenKey = "pair" },
            )
            is Screen.Agent -> {
                val agent = agents.firstOrNull { it.agentId == currentScreen.agentId }
                AgentScreen(
                    agent = agent,
                    agentId = currentScreen.agentId,
                    state = state,
                    client = model.client,
                    onBack = { screenKey = "agents" },
                    onPair = { screenKey = "pair" },
                )
            }
        }
    }
}
