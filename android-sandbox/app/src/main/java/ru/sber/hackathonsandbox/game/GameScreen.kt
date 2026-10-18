package ru.sber.hackathonsandbox.game

import androidx.activity.compose.BackHandler
import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.sber.hackathonsandbox.R

/** Полноэкранный экран игры: Page в WebView, нативная кнопка «закрыть» и кнопка Event Log поверх. */
@Composable
fun GameScreen(pageUrl: String, showsDebugControls: Boolean, onClose: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val session = remember(pageUrl) { GameSession(pageUrl, AndroidBridgeEffects(context), scope) }
    var isLogPresented by remember { mutableStateOf(false) }
    val background = MaterialTheme.colorScheme.background

    LaunchedEffect(session.isClosed) {
        if (session.isClosed) {
            onClose()
        }
    }
    BackHandler { session.close() }

    Box(
        Modifier
            .fillMaxSize()
            .background(background)
            // Нажатия не должны проходить на Launcher под экраном игры.
            .clickable(interactionSource = null, indication = null) {}
    ) {
        GameWebView(
            session = session,
            background = background,
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing),
        )

        AnimatedVisibility(session.isLoading, enter = fadeIn(), exit = fadeOut()) {
            LoadingView()
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .align(Alignment.TopEnd)
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(horizontal = 12.dp, vertical = 4.dp),
        ) {
            if (showsDebugControls) {
                OverlayButton(R.drawable.ic_event_log, "Лог событий", badge = session.log.count { it.isProblem }) {
                    isLogPresented = true
                }
            }
            OverlayButton(R.drawable.ic_close, "Закрыть") { session.close() }
        }

        AnimatedContent(
            targetState = session.toast,
            transitionSpec = {
                (fadeIn() + slideInVertically { it }) togetherWith (fadeOut() + slideOutVertically { it })
            },
            contentAlignment = Alignment.BottomCenter,
            label = "toast",
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(bottom = 24.dp),
        ) { toast ->
            if (toast != null) {
                Text(
                    text = toast.text,
                    color = Color.White,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.8f))
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                )
            }
        }

        AnimatedVisibility(
            visible = isLogPresented,
            enter = slideInVertically { it },
            exit = slideOutVertically { it },
        ) {
            EventLogScreen(session, onDismiss = { isLogPresented = false })
        }
    }
}

/** Заглушка поверх WebView, пока страница загружается. */
@Composable
private fun LoadingView() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        CircularProgressIndicator()
        Spacer(Modifier.height(12.dp))
        Text(
            "Загружаем игру…",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun OverlayButton(
    @DrawableRes icon: Int,
    description: String,
    badge: Int = 0,
    onClick: () -> Unit,
) {
    Box {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.45f))
                .clickable(onClick = onClick)
                .semantics { contentDescription = description },
        ) {
            Icon(painterResource(icon), contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
        }
        if (badge > 0) {
            Text(
                text = "$badge",
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 6.dp, y = (-4).dp)
                    .clip(CircleShape)
                    .background(Color.Red)
                    .padding(horizontal = 5.dp, vertical = 1.dp),
            )
        }
    }
}
