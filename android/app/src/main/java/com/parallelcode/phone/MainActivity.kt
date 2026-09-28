package com.parallelcode.phone

import android.app.Application
import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel

class PhoneViewModel(application: Application) : AndroidViewModel(application) {
    val client = RemoteClient(
        CredentialStore(application.getSharedPreferences("desktop", Context.MODE_PRIVATE)),
    )

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
            MaterialTheme(colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()) {
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
        screenKey.startsWith("agent:") -> Screen.Agent(screenKey.removePrefix("agent:"))
        else -> Screen.Agents
    }
    val link = state.link

    if (link == null) {
        ConnectScreen(expired = state.linkExpired, onLink = { model.client.link(it) })
        return
    }
    if (screen != Screen.Agents) BackHandler { screenKey = "agents" }
    when (screen) {
        Screen.Agents -> AgentsScreen(
            client = model.client,
            host = link.baseUrl,
            state = state,
            agents = agents,
            onOpen = { screenKey = "agent:${it.agentId}" },
            onPair = { screenKey = "pair" },
            onNewTask = { screenKey = "new-task" },
            onForget = {
                model.client.forget()
                screenKey = "agents"
            },
        )
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
            val agent = agents.firstOrNull { it.agentId == screen.agentId }
            AgentScreen(
                agent = agent,
                agentId = screen.agentId,
                state = state,
                client = model.client,
                onBack = { screenKey = "agents" },
                onPair = { screenKey = "pair" },
            )
        }
    }
}
