package ru.sber.hackathonsandbox

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.edit
import ru.sber.hackathonsandbox.game.GameScreen
import ru.sber.hackathonsandbox.launcher.LaunchHistory
import ru.sber.hackathonsandbox.launcher.LauncherScreen
import ru.sber.hackathonsandbox.launcher.SettingsKey
import ru.sber.hackathonsandbox.ui.theme.HackathonSandboxTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HackathonSandboxTheme {
                SandboxApp()
            }
        }
    }
}

/** Launcher, поверх которого на весь экран открывается Game Screen. */
@Composable
private fun SandboxApp() {
    val context = LocalContext.current
    val preferences = remember { context.getSharedPreferences("sandbox", Context.MODE_PRIVATE) }
    val history = remember { LaunchHistory(preferences) }
    var showsDebugControls by remember {
        mutableStateOf(preferences.getBoolean(SettingsKey.SHOWS_DEBUG_CONTROLS, true))
    }
    var openedPage by rememberSaveable { mutableStateOf<String?>(null) }

    Box(Modifier.fillMaxSize()) {
        LauncherScreen(
            history = history,
            showsDebugControls = showsDebugControls,
            onShowsDebugControlsChange = {
                showsDebugControls = it
                preferences.edit { putBoolean(SettingsKey.SHOWS_DEBUG_CONTROLS, it) }
            },
            onOpenPage = { openedPage = it },
        )
        AnimatedContent(
            targetState = openedPage,
            transitionSpec = { slideInVertically { it } togetherWith slideOutVertically { it } },
            label = "gameScreen",
        ) { page ->
            if (page != null) {
                GameScreen(page, showsDebugControls, onClose = { openedPage = null })
            }
        }
    }
}
