package ru.sber.hackathonsandbox.game

import android.content.ClipData
import android.content.ClipboardManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ru.sber.hackathonsandbox.R

private val ProblemColor = Color(0xFFFF9500)
private val ActionColor = Color(0xFF34C759)

/** Event Log текущей сессии Game Screen. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventLogScreen(session: GameSession, onDismiss: () -> Unit) {
    val context = LocalContext.current
    BackHandler(onBack = onDismiss)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Лог событий") },
                navigationIcon = {
                    TextButton(onClick = onDismiss) { Text("Готово") }
                },
                actions = {
                    IconButton(
                        enabled = session.log.isNotEmpty(),
                        onClick = {
                            context.getSystemService(ClipboardManager::class.java)
                                .setPrimaryClip(ClipData.newPlainText("Лог событий", session.exportedLog))
                        },
                    ) {
                        Icon(painterResource(R.drawable.ic_copy), contentDescription = "Скопировать лог")
                    }
                    IconButton(enabled = session.log.isNotEmpty(), onClick = session::clearLog) {
                        Icon(painterResource(R.drawable.ic_delete), contentDescription = "Очистить лог")
                    }
                },
            )
        },
    ) { padding ->
        if (session.log.isEmpty()) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                Text("Событий пока нет", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(contentPadding = padding, modifier = Modifier.fillMaxSize()) {
                items(session.log.asReversed(), key = { it.id }) { entry ->
                    EntryRow(entry)
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun EntryRow(entry: EventLogEntry) {
    val secondary = MaterialTheme.colorScheme.onSurfaceVariant
    val caption = MaterialTheme.typography.bodySmall
    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                entry.title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = if (entry.isProblem) ProblemColor else MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            Text(entry.time, style = caption, fontFamily = FontFamily.Monospace, color = secondary)
        }
        entry.details?.let { Text(it, style = caption) }
        entry.origin?.let { Text("Origin: $it", style = caption, color = secondary) }
        entry.rawBody?.let {
            SelectionContainer {
                Text(it, style = caption, fontFamily = FontFamily.Monospace, color = secondary)
            }
        }
        entry.actions.forEach { Text("→ $it", style = caption, color = ActionColor) }
        entry.warnings.forEach { Text("⚠️ $it", style = caption, color = ProblemColor) }
    }
}
