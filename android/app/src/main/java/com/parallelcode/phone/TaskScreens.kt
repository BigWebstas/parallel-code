package com.parallelcode.phone

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

// Matches MAX_NOTES_BYTES in electron/remote/server.ts.
private const val MAX_NOTES_BYTES = 100 * 1024

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewTaskScreen(client: RemoteClient, onDone: () -> Unit, onNeedsPairing: () -> Unit) {
    val scope = rememberCoroutineScope()
    var projects by remember { mutableStateOf<List<MobileProject>?>(null) }
    var loadAttempt by remember { mutableIntStateOf(0) }
    var projectId by rememberSaveable { mutableStateOf("") }
    var name by rememberSaveable { mutableStateOf("") }
    var prompt by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    // Same default title as the phone web UI: the start of the prompt.
    val title = name.trim().ifEmpty { prompt.trim().replace(Regex("\\s+"), " ").take(80) }

    fun failed(e: ApiException, suffix: String = "") {
        // The client has already dropped a rejected paired token.
        if (e.status == 401) onNeedsPairing() else error = e.message + suffix
    }

    LaunchedEffect(loadAttempt) {
        error = null
        try {
            val list = client.fetchProjects()
            projects = list
            if (list.none { it.id == projectId }) projectId = list.firstOrNull()?.id.orEmpty()
        } catch (e: ApiException) {
            projects = emptyList()
            failed(e)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = { TextButton(onClick = onDone, enabled = !busy) { Text("Cancel") } },
                title = { Text("New task") },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Project", style = MaterialTheme.typography.titleSmall)
            val loaded = projects
            when {
                loaded == null -> Text("Loading projects…")
                loaded.isEmpty() -> {
                    Text("No projects available. Add one in Parallel Code on your computer.")
                    TextButton(onClick = { loadAttempt++ }) { Text("Retry") }
                }
                else -> loaded.forEach { project ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .selectable(
                                selected = project.id == projectId,
                                enabled = !busy,
                                role = Role.RadioButton,
                                onClick = { projectId = project.id },
                            ),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = project.id == projectId, onClick = null, enabled = !busy)
                        Column(Modifier.padding(start = 8.dp)) {
                            Text(project.name)
                            Text(
                                project.agentName?.let { "Runs with $it" } ?: "Runs with your default agent",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
            OutlinedTextField(
                value = prompt,
                onValueChange = { prompt = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 140.dp),
                label = { Text("What should the agent work on?") },
                enabled = !busy,
            )
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Task name (optional)") },
                placeholder = { Text(title) },
                singleLine = true,
                enabled = !busy,
            )
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                modifier = Modifier.fillMaxWidth(),
                enabled = !busy && projectId.isNotEmpty() && prompt.isNotBlank(),
                onClick = {
                    busy = true
                    error = null
                    scope.launch {
                        try {
                            client.createTask(projectId, title, prompt.trim())
                            onDone()
                        } catch (e: ApiException) {
                            failed(
                                e,
                                " Your draft is kept. If the connection dropped, check the task list before retrying.",
                            )
                        } finally {
                            busy = false
                        }
                    }
                },
            ) { Text(if (busy) "Creating…" else "Create task") }
        }
    }
}

/** The task's notes panel from the desktop; editable once the phone is paired. */
@Composable
fun NotesPane(taskId: String, canEdit: Boolean, client: RemoteClient, modifier: Modifier) {
    val scope = rememberCoroutineScope()
    var notes by rememberSaveable(taskId) { mutableStateOf("") }
    var dirty by rememberSaveable(taskId) { mutableStateOf(false) }
    var loaded by remember(taskId) { mutableStateOf(false) }
    var loadAttempt by remember { mutableIntStateOf(0) }
    var saving by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(taskId, loadAttempt) {
        error = null
        try {
            val remote = client.fetchNotes(taskId)
            // Keep unsaved edits rather than overwrite them with the desktop's copy.
            if (!dirty) notes = remote
            loaded = true
        } catch (e: ApiException) {
            error = e.message
        }
    }

    Column(modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = notes,
            onValueChange = {
                notes = it
                dirty = true
                saved = false
            },
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            placeholder = { Text(if (loaded) "No notes yet" else "Loading notes…") },
            readOnly = !canEdit || !loaded,
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                when {
                    saving -> "Saving…"
                    dirty -> "Unsaved changes"
                    saved -> "Saved to your computer"
                    else -> ""
                },
                Modifier.weight(1f),
                style = MaterialTheme.typography.bodySmall,
            )
            if (!loaded) TextButton(onClick = { loadAttempt++ }) { Text("Reload") }
            if (canEdit) {
                Button(
                    enabled = loaded && dirty && !saving,
                    onClick = {
                        if (notes.toByteArray().size > MAX_NOTES_BYTES) {
                            error = "Notes must be 100 KB or less."
                            return@Button
                        }
                        saving = true
                        error = null
                        val text = notes
                        scope.launch {
                            try {
                                client.saveNotes(taskId, text)
                                // Typing during the save keeps the note marked unsaved.
                                if (notes == text) {
                                    dirty = false
                                    saved = true
                                }
                            } catch (e: ApiException) {
                                error = e.message
                            } finally {
                                saving = false
                            }
                        }
                    },
                ) { Text("Save") }
            }
        }
    }
}
